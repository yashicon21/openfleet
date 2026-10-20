import fs from "node:fs";
import { appendEvent } from "./events.js";
import { readJson, writeJson } from "./fsutil.js";
import { withLock } from "./lock.js";
import { UserError, type ProjectPaths } from "./workspace.js";

export const STATE_SCHEMA_VERSION = 1;

/** `specifying` covers the whole grill, including the final spec review; the user's answer moves it to `running`. */
export const PROJECT_STATUSES = ["specifying", "running", "finalizing", "done", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** `failed`: retries and the coordinator's guided attempt both failed. `blocked`: a dependency failed. */
export const CHILD_PHASES = [
  "pending",
  "planning",
  "plan-review",
  "implementing",
  "testing",
  "post-test",
  "done",
  "failed",
  "blocked",
] as const;
export type ChildPhase = (typeof CHILD_PHASES)[number];

export type Role = "planner" | "implementer" | "tester";

export type CompletionMode = "staged" | "draft-pr";

export interface ChildState {
  /** Key in repos.json. */
  repo: string;
  /** Package path inside a monorepo, if this child targets one package. */
  package?: string;
  /** Absolute path of the source repository checkout. */
  repoPath?: string;
  worktree?: string;
  branch?: string;
  baseBranch?: string;
  /** Commit the worktree branched from; snapshots diff against it. */
  baseSha?: string;
  phase: ChildPhase;
  /** Role of the currently active agent for this child. */
  role?: Role;
  /** Set by the coordinator just before spawning; consumed by the subagentStart hook. */
  pendingSpawn?: Role;
  retries: number;
  dependsOn: string[];
  agentIds: Partial<Record<Role, string>>;
  plan?: string;
  /** Set by finalize, or mid-run by an extension output named `prUrl`. Finalize then updates this PR. */
  prUrl?: string;
  /** Extension outputs, keyed by extension name. Injected into dependents' prompts by the spawn hook. */
  outputs?: Record<string, Record<string, string>>;
  /** Extension follow-ups for people after the run, keyed by extension name. */
  followUps?: Record<string, string[]>;
  lastSnapshot?: string;
  notes?: string;
}

export interface Question {
  id: string;
  from: string;
  text: string;
  status: "open" | "answered";
  answer?: string;
  /** `spec`: answered from spec.md/contracts. `coordinator`: decided by the coordinator (logged as an `assumption`). */
  answeredBy?: "spec" | "coordinator";
}

export interface ProjectState {
  v: typeof STATE_SCHEMA_VERSION;
  name: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  /** Copilot CLI session id of the coordinator session, used by `resume`. */
  sessionId?: string;
  completionMode?: CompletionMode;
  specApproved?: boolean;
  /** Keyed by child id: `<repo>` or `<repo>:<package>`. */
  children: Record<string, ChildState>;
  questions: Question[];
  /** Follow-ups from project-level extension slots (`pre-spec`, `post-run`), keyed by extension name. */
  followUps?: Record<string, string[]>;
}

/** Every child that depends on `id`, directly or transitively. */
export function dependentsOf(state: ProjectState, id: string): string[] {
  const out = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const [cid, c] of Object.entries(state.children)) {
      if (!out.has(cid) && cid !== id && (c.dependsOn ?? []).includes(cur)) {
        out.add(cid);
        queue.push(cid);
      }
    }
  }
  return [...out];
}

/** Every child that `id` depends on, directly or transitively, nearest first. */
export function dependenciesOf(state: ProjectState, id: string): string[] {
  const out: string[] = [];
  const queue = [...(state.children[id]?.dependsOn ?? [])];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === id || out.includes(cur)) continue;
    out.push(cur);
    queue.push(...(state.children[cur]?.dependsOn ?? []));
  }
  return out;
}

export function newState(name: string, sessionId?: string): ProjectState {
  const now = new Date().toISOString();
  return {
    v: STATE_SCHEMA_VERSION,
    name,
    status: "specifying",
    createdAt: now,
    updatedAt: now,
    ...(sessionId ? { sessionId } : {}),
    children: {},
    questions: [],
  };
}

export function readState(p: ProjectPaths): ProjectState {
  if (!fs.existsSync(p.state)) throw new UserError(`Project "${p.name}" not found (${p.state}).`);
  return readJson<ProjectState>(p.state);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** RFC 7396 JSON merge patch: objects merge, `null` deletes, everything else replaces. */
export function mergePatch<T>(target: T, patch: unknown): T {
  if (!isPlainObject(patch)) return patch as T;
  const base: Record<string, unknown> = isPlainObject(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete base[k];
    else base[k] = mergePatch(base[k], v);
  }
  return base as T;
}

function normalizeChildren(state: ProjectState): void {
  for (const [id, child] of Object.entries(state.children)) {
    child.repo ??= id.split(":")[0] ?? id;
    child.phase ??= "pending";
    child.retries ??= 0;
    child.dependsOn ??= [];
    child.agentIds ??= {};
  }
}

function validateTransitions(prev: ProjectState, next: ProjectState): void {
  if (prev.status !== next.status && !(PROJECT_STATUSES as readonly string[]).includes(next.status)) {
    throw new UserError(`Unknown project status "${next.status}". Use one of: ${PROJECT_STATUSES.join(", ")}.`);
  }
  for (const [id, child] of Object.entries(next.children)) {
    if (prev.children[id]?.phase !== child.phase && !(CHILD_PHASES as readonly string[]).includes(child.phase)) {
      throw new UserError(`Unknown phase "${child.phase}" for child ${id}. Use one of: ${CHILD_PHASES.join(", ")}.`);
    }
  }
}

/**
 * Read-modify-write state.json under the project's state lock. Emits
 * `phase.changed` events for project status and child phase transitions.
 */
export function updateState(
  p: ProjectPaths,
  mutate: (s: ProjectState) => ProjectState | void,
  actor = "coordinator",
): ProjectState {
  const changes: { target: string | null; from: string | undefined; to: string }[] = [];
  const next = withLock(p.stateLock, () => {
    const prev = readState(p);
    const draft = structuredClone(prev);
    const result = mutate(draft) ?? draft;
    normalizeChildren(result);
    validateTransitions(prev, result);
    result.updatedAt = new Date().toISOString();
    if (prev.status !== result.status) changes.push({ target: null, from: prev.status, to: result.status });
    for (const [id, child] of Object.entries(result.children)) {
      const before = prev.children[id]?.phase;
      if (before !== child.phase) changes.push({ target: id, from: before, to: child.phase });
    }
    writeJson(p.state, result);
    return result;
  });
  for (const c of changes) {
    appendEvent(p, {
      actor,
      type: "phase.changed",
      target: c.target,
      payload: { scope: c.target ? "child" : "project", from: c.from ?? null, to: c.to },
    });
  }
  return next;
}

export function patchState(p: ProjectPaths, patch: unknown, actor?: string): ProjectState {
  if (!isPlainObject(patch)) throw new UserError("State patch must be a JSON object.");
  return updateState(p, (s) => mergePatch(s, patch), actor);
}
