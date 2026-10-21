import crypto from "node:crypto";
import fs from "node:fs";
import { appendEvent, readEvents } from "../events.js";
import { deleteBranch, removeWorktree, tryGit } from "../git.js";
import { syncExtensions } from "../core.js";
import { groupOf, membersOf } from "../groups.js";
import { launch } from "../launcher.js";
import { newState, readState, updateState, type ProjectState } from "../state.js";
import { writeJson } from "../fsutil.js";
import {
  listProjectNames,
  projectPaths,
  requireWorkspace,
  UserError,
  validateProjectName,
  type Workspace,
} from "../workspace.js";
import { out, warn } from "./output.js";

const INACTIVE = new Set(["done", "cancelled"]);

function childRepos(state: ProjectState): Set<string> {
  return new Set(Object.values(state.children).map((c) => c.repo));
}

/** Other active projects touching any of the same repos. */
export function findOverlaps(ws: Workspace, name: string): { project: string; repos: string[] }[] {
  const mine = childRepos(readState(projectPaths(ws, name)));
  if (!mine.size) return [];
  const result: { project: string; repos: string[] }[] = [];
  for (const other of listProjectNames(ws)) {
    if (other === name) continue;
    let state: ProjectState;
    try {
      state = readState(projectPaths(ws, other));
    } catch {
      continue;
    }
    if (INACTIVE.has(state.status)) continue;
    const shared = [...childRepos(state)].filter((r) => mine.has(r));
    if (shared.length) result.push({ project: other, repos: shared });
  }
  return result;
}

function warnOverlaps(ws: Workspace, name: string): void {
  for (const o of findOverlaps(ws, name)) {
    warn(`Project "${o.project}" is also active on ${o.repos.join(", ")}. Changes may conflict.`);
  }
}

export function createProject(ws: Workspace, name: string): ProjectState {
  const p = projectPaths(ws, name);
  if (fs.existsSync(p.state)) {
    throw new UserError(`Project "${name}" already exists. Use \`npx openfleet resume ${name}\`.`);
  }
  fs.mkdirSync(p.contracts, { recursive: true });
  fs.mkdirSync(p.plans, { recursive: true });
  const state = newState(name, crypto.randomUUID());
  writeJson(p.state, state);
  appendEvent(p, { actor: "cli", type: "project.created", target: null, payload: { sessionId: state.sessionId } });
  return state;
}

export function cmdNew(args: string[], passthrough: string[], opts: { ask?: boolean } = {}): number {
  const ws = requireWorkspace();
  const [rawName, ...promptParts] = args;
  const name = validateProjectName(rawName);
  // Re-sync so edits to openfleet/extensions.config.json reach the generated agents.
  syncExtensions(ws, warn);
  const state = createProject(ws, name);
  const request = promptParts.join(" ").trim();
  out(`Created project ${name} at ${projectPaths(ws, name).dir}. Launching the coordinator…`);
  const prompt = [
    `Start OpenFleet project \`${name}\` (openfleet/projects/${name}/).`,
    request ? `The user's request: ${request}` : "Ask the user what they want to change.",
    "Begin the grill session (skill openfleet-grill).",
  ].join("\n");
  return launch({
    ws,
    agent: "openfleet-coordinator",
    prompt,
    sessionId: state.sessionId,
    name: `openfleet: ${name}`,
    project: name,
    passthrough,
    ask: opts.ask,
  });
}

export function cmdResume(
  args: string[],
  passthrough: string[],
  opts: { fresh?: boolean; ask?: boolean } = {},
): number {
  const ws = requireWorkspace();
  const name = validateProjectName(args[0]);
  const p = projectPaths(ws, name);
  let state = readState(p);
  syncExtensions(ws, warn);
  const sessionId = opts.fresh || !state.sessionId ? crypto.randomUUID() : state.sessionId;
  // Subagents (repo coordinators included) do not survive the session: drop their claims and running marks.
  state = updateState(
    p,
    (s) => {
      s.sessionId = sessionId;
      for (const c of Object.values(s.children)) {
        delete c.pendingSpawn;
        delete c.claimedAt;
        if (c.coordinator === "running") c.coordinator = "stopped";
      }
    },
    "cli",
  );
  const repoCoordinators = Object.entries(state.children)
    .filter(([, c]) => c.integration && c.phase !== "done" && c.phase !== "failed")
    .map(([id]) => id);
  warnOverlaps(ws, name);
  out(`Resuming project ${name} (status: ${state.status})…`);
  return launch({
    ws,
    agent: "openfleet-coordinator",
    prompt: [
      `Resume OpenFleet project \`${name}\`. Read openfleet/projects/${name}/state.json and continue from where it left off.`,
      repoCoordinators.length
        ? `Start the repo coordinators again (\`npx openfleet next ${name}\` lists them): ${repoCoordinators.join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    sessionId: state.sessionId,
    name: `openfleet: ${name}`,
    project: name,
    passthrough,
    ask: opts.ask,
  });
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function table(rows: string[][]): string {
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length)));
  return rows
    .map((r) =>
      r
        .map((c, i) => pad(c, widths[i]!))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

export function cmdList(): number {
  const ws = requireWorkspace();
  const names = listProjectNames(ws);
  if (!names.length) {
    out("No projects yet. Start one with `npx openfleet new <name>`.");
    return 0;
  }
  const rows = [["PROJECT", "STATUS", "CHILDREN", "UPDATED"]];
  for (const name of names) {
    const s = readState(projectPaths(ws, name));
    const children = Object.values(s.children);
    const done = children.filter((c) => c.phase === "done").length;
    const failed = children.filter((c) => c.phase === "failed" || c.phase === "blocked").length;
    const progress = children.length
      ? `${done}/${children.length} done${failed ? `, ${failed} failed/blocked` : ""}`
      : "-";
    rows.push([name, s.status, progress, s.updatedAt]);
  }
  out(table(rows));
  return 0;
}

export function cmdStatus(args: string[], opts: { json?: boolean } = {}): number {
  const ws = requireWorkspace();
  if (!args[0]) return cmdList();
  const name = validateProjectName(args[0]);
  const p = projectPaths(ws, name);
  const s = readState(p);
  if (opts.json) {
    out(JSON.stringify(s, null, 2));
    return 0;
  }
  out(`Project ${name}: ${s.status}${s.completionMode ? ` (completion: ${s.completionMode})` : ""}`);
  const children = Object.entries(s.children);
  if (children.length) {
    out("");
    const rows = [["CHILD", "PHASE", "ROLE", "RETRIES", "BRANCH", "DEPENDS ON"]];
    const row = (label: string, id: string) => {
      const c = s.children[id]!;
      const role = c.integration ? `repo-coordinator (${c.coordinator ?? "not started"})` : (c.role ?? "-");
      const deps = c.integration ? "(its children)" : c.dependsOn.join(",") || "-";
      const phase = c.phase === "done" && groupOf(s, id) ? (c.merged ? "done, merged" : "done") : c.phase;
      rows.push([label, phase, role, String(c.retries), c.branch ?? "-", deps]);
    };
    for (const [id, c] of children) {
      if (groupOf(s, id)) continue;
      row(id, id);
      if (c.integration) for (const m of membersOf(s, id)) row(`  ${m}`, m);
    }
    out(table(rows));
  }
  const open = s.questions.filter((q) => q.status === "open");
  if (open.length) {
    out("");
    out("Open questions:");
    for (const q of open) out(`  [${q.id}] ${q.from}: ${q.text}`);
  }
  const events = readEvents(p);
  out("");
  out(
    `${events.length} events recorded${events.length ? `, last: ${events.at(-1)!.type} at ${events.at(-1)!.ts}` : ""}.`,
  );
  warnOverlaps(ws, name);
  return 0;
}

export function cmdClean(args: string[], opts: { branches?: boolean; force?: boolean } = {}): number {
  const ws = requireWorkspace();
  const name = validateProjectName(args[0]);
  const p = projectPaths(ws, name);
  const s = readState(p);
  let failures = 0;
  for (const [id, c] of Object.entries(s.children)) {
    if (c.worktree && fs.existsSync(c.worktree)) {
      const repoPath =
        c.repoPath ??
        tryGit(c.worktree, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
          ?.trim()
          .replace(/\/\.git$/, "");
      try {
        if (!repoPath) throw new Error("unknown source repo");
        removeWorktree(repoPath, c.worktree, opts.force);
        out(`Removed worktree ${c.worktree}`);
        appendEvent(p, { actor: "cli", type: "worktree.removed", target: id, payload: { worktree: c.worktree } });
      } catch (err) {
        failures++;
        const msg = String((err as { stderr?: string | Buffer }).stderr ?? (err as Error).message).trim();
        warn(
          `Could not remove worktree for ${id}: ${msg}${opts.force ? "" : " (use --force to discard uncommitted changes)"}`,
        );
        continue;
      }
    }
    if (opts.branches && c.branch && c.repoPath) {
      try {
        // A merged member's commits live on its integration branch, which `-d` does not check.
        deleteBranch(c.repoPath, c.branch, opts.force || c.merged === true);
        out(`Deleted branch ${c.branch} in ${c.repoPath}`);
      } catch (err) {
        failures++;
        const msg = String((err as { stderr?: string | Buffer }).stderr ?? (err as Error).message).trim();
        warn(`Could not delete branch ${c.branch}: ${msg}`);
      }
    }
  }
  if (fs.existsSync(p.worktrees) && fs.readdirSync(p.worktrees).length === 0) fs.rmdirSync(p.worktrees);
  updateState(
    p,
    (st) => {
      for (const c of Object.values(st.children)) {
        if (c.worktree && !fs.existsSync(c.worktree)) delete c.worktree;
      }
    },
    "cli",
  );
  out(failures ? `Cleaned ${name} with ${failures} problem(s).` : `Cleaned ${name}.`);
  return failures ? 1 : 0;
}
