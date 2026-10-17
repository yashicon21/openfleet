import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { actorFor, bareAgentName, candidateProjects, locatePath, roleFromAgentName, roleOf } from "../attribution.js";
import { readCoreIndex } from "../coreindex.js";
import { appendEvent } from "../events.js";
import { filePatch, snapshotWorktree, type FileKind } from "../git.js";
import { readState, updateState, type ChildState, type ProjectState, type Role } from "../state.js";
import { findWorkspace, projectPaths, type ProjectPaths, type Workspace } from "../workspace.js";

export interface HookPayload {
  sessionId?: string;
  timestamp?: number | string;
  cwd?: string;
  source?: string;
  reason?: string;
  toolName?: string;
  toolArgs?: unknown;
  agentId?: string;
  agentName?: string;
  agentDisplayName?: string;
  agentType?: string;
  response?: string;
  [k: string]: unknown;
}

export interface HookContext {
  ws: Workspace;
  /** Project from OPENFLEET_PROJECT, if the session was launched by the CLI. */
  project?: string;
}

export interface HookOutput {
  additionalContext?: string;
}

/** Hooks are a no-op unless the session is inside (or launched for) an OpenFleet workspace. */
export function resolveContext(payload: HookPayload, env: NodeJS.ProcessEnv = process.env): HookContext | undefined {
  const fromEnv = env.OPENFLEET_WORKSPACE ? findWorkspace(env.OPENFLEET_WORKSPACE) : undefined;
  const ws = fromEnv ?? (payload.cwd ? findWorkspace(payload.cwd) : undefined);
  if (!ws) return undefined;
  const project = env.OPENFLEET_PROJECT || undefined;
  if (project && !fs.existsSync(projectPaths(ws, project).state)) return { ws };
  return { ws, ...(project ? { project } : {}) };
}

function ts(payload: HookPayload): string {
  const t = payload.timestamp;
  if (typeof t === "number") return new Date(t).toISOString();
  if (typeof t === "string" && !Number.isNaN(Date.parse(t))) return new Date(t).toISOString();
  return new Date().toISOString();
}

/** Single active project: explicit, or the only non-finished project in the workspace. */
function activeProject(ctx: HookContext): ProjectPaths | undefined {
  if (ctx.project) return projectPaths(ctx.ws, ctx.project);
  const live = candidateProjects(ctx.ws).filter((p) => {
    try {
      const s = readState(p).status;
      return s !== "done" && s !== "cancelled";
    } catch {
      return false;
    }
  });
  return live.length === 1 ? live[0] : undefined;
}

// ---------------------------------------------------------------- session

export function onSessionStart(ctx: HookContext, payload: HookPayload): HookOutput {
  const p = ctx.project ? projectPaths(ctx.ws, ctx.project) : undefined;
  if (p) {
    appendEvent(p, {
      ts: ts(payload),
      actor: "coordinator",
      type: "session.started",
      payload: { sessionId: payload.sessionId ?? null, source: payload.source ?? null },
    });
  }
  const index = readCoreIndex(ctx.ws);
  const lines = [
    `OpenFleet workspace root: ${ctx.ws.root}`,
    `OpenFleet data dir: ${ctx.ws.dir}`,
    p ? `Active OpenFleet project: ${p.name} (${p.dir})` : "No OpenFleet project is active in this session.",
  ];
  if (index) {
    const slots = Object.entries(index.slots)
      .filter(([, list]) => list.length)
      .map(([slot, list]) => `${slot}: ${list.map((e) => e.agent).join(", ")}`);
    lines.push(`Phase extensions — ${slots.length ? slots.join("; ") : "none"}.`);
  }
  return { additionalContext: lines.join("\n") };
}

export function onSessionEnd(ctx: HookContext, payload: HookPayload): HookOutput {
  if (!ctx.project) return {};
  appendEvent(projectPaths(ctx.ws, ctx.project), {
    ts: ts(payload),
    actor: "coordinator",
    type: "session.ended",
    payload: { sessionId: payload.sessionId ?? null, reason: payload.reason ?? null },
  });
  return {};
}

// ---------------------------------------------------------------- subagents

function extName(agentName: string | undefined): string | undefined {
  const bare = bareAgentName(agentName);
  return bare?.startsWith("openfleet-ext-") ? bare.slice("openfleet-ext-".length) : undefined;
}

function pickPending(state: ProjectState, role: Role): string | undefined {
  const ids = Object.entries(state.children)
    .filter(([, c]) => c.pendingSpawn === role)
    .map(([id]) => id);
  return ids[0];
}

function childContext(p: ProjectPaths, childId: string, child: ChildState, role: Role): string {
  return [
    `# OpenFleet assignment`,
    `- project: ${p.name}`,
    `- child: ${childId} (repo \`${child.repo}\`${child.package ? `, package \`${child.package}\`` : ""})`,
    `- role: ${role}`,
    child.worktree ? `- worktree (work ONLY here): ${child.worktree}` : `- worktree: not created yet`,
    child.branch ? `- branch: ${child.branch}` : "",
    `- spec: ${p.spec}`,
    `- contracts: ${p.contracts}`,
    child.plan ? `- approved plan: ${child.plan}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function onSubagentStart(ctx: HookContext, payload: HookPayload): HookOutput {
  const role = roleFromAgentName(payload.agentName);
  const ext = extName(payload.agentName);
  if (!role && !ext) return {};
  const p = activeProject(ctx);
  if (!p) return {};
  if (ext) {
    appendEvent(p, {
      ts: ts(payload),
      actor: `ext:${ext}`,
      type: "agent.spawned",
      payload: { agentName: payload.agentName ?? null },
    });
    return {};
  }
  if (role === "coordinator") return {};
  let childId: string | undefined;
  const state = updateState(p, (s) => {
    childId = pickPending(s, role!);
    if (!childId) return;
    const child = s.children[childId]!;
    delete child.pendingSpawn;
    child.role = role as Role;
  });
  appendEvent(p, {
    ts: ts(payload),
    actor: actorFor(childId ?? "unknown", role),
    type: "agent.spawned",
    target: childId ?? null,
    payload: { agentName: payload.agentName ?? null, agentDisplayName: payload.agentDisplayName ?? null },
  });
  if (!childId) return {};
  return { additionalContext: childContext(p, childId, state.children[childId]!, role as Role) };
}

function snapshotChild(p: ProjectPaths, childId: string, child: ChildState, actor: string, at: string): void {
  if (!child.worktree || !fs.existsSync(child.worktree)) return;
  let snap;
  try {
    snap = snapshotWorktree(child.worktree, child.baseSha ?? "HEAD");
  } catch {
    return;
  }
  const hash = crypto.createHash("sha256").update(snap.patch).digest("hex");
  if (hash === child.lastSnapshot) return;
  appendEvent(p, {
    ts: at,
    actor,
    type: "worktree.snapshot",
    target: childId,
    payload: {
      worktree: child.worktree,
      base: child.baseSha ?? "HEAD",
      files: snap.files,
      totals: {
        files: snap.files.length,
        added: snap.files.reduce((n, f) => n + f.added, 0),
        removed: snap.files.reduce((n, f) => n + f.removed, 0),
      },
    },
    patch: snap.patch,
  });
  updateState(p, (s) => {
    const c = s.children[childId];
    if (c) c.lastSnapshot = hash;
  });
}

export function onSubagentStop(ctx: HookContext, payload: HookPayload): HookOutput {
  const role = roleFromAgentName(payload.agentName);
  const ext = extName(payload.agentName);
  if (!role && !ext) return {};
  const p = activeProject(ctx);
  if (!p) return {};
  const at = ts(payload);
  if (ext) {
    appendEvent(p, {
      ts: at,
      actor: `ext:${ext}`,
      type: "agent.stopped",
      payload: { agentId: payload.agentId ?? null, agentName: payload.agentName ?? null, response: payload.response ?? "" },
    });
    return {};
  }
  if (role === "coordinator") return {};
  const state = readState(p);
  const entries = Object.entries(state.children);
  let match = entries.find(([, c]) => payload.agentId && c.agentIds[role as Role] === payload.agentId);
  if (!match) {
    const byRole = entries.filter(([, c]) => roleOf(c) === role && c.phase !== "done");
    if (byRole.length === 1) match = byRole[0];
  }
  const childId = match?.[0];
  const actor = actorFor(childId ?? "unknown", role);
  appendEvent(p, {
    ts: at,
    actor,
    type: "agent.stopped",
    target: childId ?? null,
    payload: { agentId: payload.agentId ?? null, agentName: payload.agentName ?? null, response: payload.response ?? "" },
  });
  if (childId && payload.agentId && !match![1].agentIds[role as Role]) {
    updateState(p, (s) => {
      const c = s.children[childId];
      if (c) c.agentIds[role as Role] = payload.agentId!;
    });
  }
  // Ground truth: diff snapshot of the attributed worktree, or every worktree when unattributed.
  const targets = childId ? [[childId, match![1]] as const] : entries;
  for (const [id, child] of targets) snapshotChild(p, id, child, childId ? actor : actorFor(id, roleOf(child)), at);
  return {};
}

// ---------------------------------------------------------------- tools

interface ToolFileChange {
  path: string;
  kind: FileKind;
  added: number;
  removed: number;
}

function countLines(s: unknown): number {
  if (typeof s !== "string" || s.length === 0) return 0;
  return s.split("\n").length - (s.endsWith("\n") ? 1 : 0);
}

function parseArgs(args: unknown): unknown {
  if (typeof args === "string") {
    const t = args.trim();
    if (t.startsWith("{")) {
      try {
        return JSON.parse(t);
      } catch {
        return args;
      }
    }
  }
  return args;
}

function parseApplyPatch(text: string): ToolFileChange[] {
  const out: ToolFileChange[] = [];
  let cur: ToolFileChange | undefined;
  for (const line of text.split("\n")) {
    const m = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (m) {
      cur = { path: m[2]!.trim(), kind: m[1] === "Add" ? "added" : m[1] === "Delete" ? "deleted" : "edited", added: 0, removed: 0 };
      out.push(cur);
      continue;
    }
    const move = /^\*\*\* Move to: (.+)$/.exec(line);
    if (move && cur) {
      out.push({ path: cur.path, kind: "deleted", added: 0, removed: 0 });
      cur.path = move[1]!.trim();
      cur.kind = "added";
      continue;
    }
    if (!cur || line.startsWith("***")) continue;
    if (line.startsWith("+")) cur.added++;
    else if (line.startsWith("-")) cur.removed++;
  }
  return out;
}

/** Extract file changes from a postToolUse payload. Only file-mutating tools are recognised. */
export function fileChangesFromTool(toolName: string | undefined, rawArgs: unknown): ToolFileChange[] {
  const name = (toolName ?? "").toLowerCase();
  const args = parseArgs(rawArgs);
  const a = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
  const file = (a.path ?? a.file_path ?? a.filePath) as string | undefined;
  switch (name) {
    case "create":
    case "write":
      return file ? [{ path: file, kind: "added", added: countLines(a.file_text ?? a.content), removed: 0 }] : [];
    case "edit":
    case "str_replace":
    case "str_replace_editor":
    case "multiedit":
    case "multi_edit": {
      if (!file) return [];
      if (a.command === "create") return [{ path: file, kind: "added", added: countLines(a.file_text), removed: 0 }];
      const edits = Array.isArray(a.edits) ? (a.edits as Record<string, unknown>[]) : [a];
      let added = 0;
      let removed = 0;
      for (const e of edits) {
        added += countLines(e.new_str ?? e.new_string ?? e.newString);
        removed += countLines(e.old_str ?? e.old_string ?? e.oldString);
      }
      return [{ path: file, kind: "edited", added, removed }];
    }
    case "apply_patch": {
      const text = typeof args === "string" ? args : (a.input ?? a.patch);
      return typeof text === "string" ? parseApplyPatch(text) : [];
    }
    default:
      return [];
  }
}

export function onPostToolUse(ctx: HookContext, payload: HookPayload): HookOutput {
  const changes = fileChangesFromTool(payload.toolName, payload.toolArgs);
  if (!changes.length) return {};
  const cwd = payload.cwd ?? ctx.ws.root;
  for (const change of changes) {
    const abs = path.resolve(cwd, change.path);
    const loc = locatePath(ctx.ws, abs, ctx.project);
    if (!loc) continue;
    const role = roleOf(loc.child);
    let patch = "";
    if (change.kind !== "deleted") {
      try {
        patch = filePatch(loc.child.worktree!, loc.rel);
      } catch {
        patch = "";
      }
    }
    appendEvent(loc.project, {
      ts: ts(payload),
      actor: actorFor(loc.childId, role),
      type: `file.${change.kind}`,
      target: loc.childId,
      payload: {
        path: loc.rel.split(path.sep).join("/"),
        kind: change.kind,
        lines: { added: change.added, removed: change.removed },
        tool: payload.toolName ?? null,
      },
      patch,
    });
  }
  return {};
}

export const HANDLERS: Record<string, (ctx: HookContext, payload: HookPayload) => HookOutput> = {
  sessionStart: onSessionStart,
  sessionEnd: onSessionEnd,
  subagentStart: onSubagentStart,
  subagentStop: onSubagentStop,
  postToolUse: onPostToolUse,
};

export function runHook(event: string, payload: HookPayload, env: NodeJS.ProcessEnv = process.env): HookOutput {
  const handler = HANDLERS[event];
  if (!handler) return {};
  const ctx = resolveContext(payload, env);
  if (!ctx) return {};
  return handler(ctx, payload);
}

