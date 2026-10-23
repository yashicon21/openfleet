import type { AgentRole, ChildMeta, ChildView, RunEvent, Stage, WorldState } from "./types.js";

/**
 * Pure event reducer shared by the replay and (later) the live dashboard.
 * It never mutates its input: touched maps and children are copied.
 */

export function emptyWorld(project: string): WorldState {
  return { project, status: "specifying", seq: 0, time: 0, repos: {}, children: {}, agents: {}, done: false };
}

/** Repo key of a child id: `<repo>`, `<repo>:<package>` or `<repo>[:<package>]/<unit>`. */
export function repoOf(childId: string): string {
  return childId.split(/[:/]/)[0] ?? childId;
}

export function labelOf(childId: string): string {
  const parts = childId.split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : childId;
}

const STAGE_OF_PHASE: Record<string, Stage> = {
  pending: "plot",
  planning: "foundation",
  "plan-review": "foundation",
  planned: "foundation",
  baseline: "foundation",
  implementing: "scaffold",
  testing: "testing",
  "post-test": "testing",
  done: "finished",
};

const ROLE_OF_ACTOR: Record<string, AgentRole> = {
  "repo-coordinator": "coordinator",
  planner: "planner",
  baseline: "tester",
  implementer: "implementer",
  tester: "tester",
};

/** Maps an actor such as `web/users/tester` to its role, or undefined for non-agent actors. */
export function roleOfActor(actor: string): { role: AgentRole; raw: string; child: string } | undefined {
  const i = actor.lastIndexOf("/");
  if (i < 0) return undefined;
  const raw = actor.slice(i + 1);
  const role = ROLE_OF_ACTOR[raw];
  return role ? { role, raw, child: actor.slice(0, i) } : undefined;
}

function newChild(id: string, meta: ChildMeta | undefined): ChildView {
  return {
    id,
    repo: meta?.repo ?? repoOf(id),
    label: meta?.label ?? labelOf(id),
    integration: meta?.kind === "integration",
    phase: "pending",
    stage: "plot",
    merged: false,
    rejections: 0,
    plan: { submitted: 0, validated: 0, rejected: 0, lastReasons: [] },
    tests: [],
    diff: { files: 0, added: 0, removed: 0 },
    roles: [],
    lastSeq: 0,
  };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

class Draft {
  private childrenCopied = false;
  private reposCopied = false;
  private agentsCopied = false;
  private touched = new Set<string>();
  readonly s: WorldState;

  constructor(
    prev: WorldState,
    private meta: Record<string, ChildMeta>,
  ) {
    this.s = { ...prev };
  }

  child(id: string): ChildView {
    if (!this.childrenCopied) {
      this.s.children = { ...this.s.children };
      this.childrenCopied = true;
    }
    let c = this.s.children[id];
    if (!c) {
      c = newChild(id, this.meta[id]);
      this.addToRepo(c.repo, id);
    } else if (!this.touched.has(id)) {
      c = { ...c, plan: { ...c.plan }, diff: { ...c.diff }, tests: c.tests, roles: c.roles };
    }
    this.touched.add(id);
    this.s.children[id] = c;
    return c;
  }

  private addToRepo(repo: string, id: string): void {
    if (!this.reposCopied) {
      this.s.repos = { ...this.s.repos };
      this.reposCopied = true;
    }
    const r = this.s.repos[repo];
    this.s.repos[repo] = { id: repo, children: [...(r?.children ?? []), id] };
  }

  agents(): WorldState["agents"] {
    if (!this.agentsCopied) {
      this.s.agents = { ...this.s.agents };
      this.agentsCopied = true;
    }
    return this.s.agents;
  }
}

function addRole(c: ChildView, role: AgentRole): void {
  if (!c.roles.includes(role)) c.roles = [...c.roles, role];
}

export function reduce(state: WorldState, e: RunEvent, meta: Record<string, ChildMeta> = {}): WorldState {
  const d = new Draft(state, meta);
  const s = d.s;
  s.seq = e.seq;
  const t = Date.parse(e.ts);
  if (Number.isFinite(t)) s.time = t;
  const p = e.payload ?? {};
  const target = e.target ?? undefined;

  switch (e.type) {
    case "phase.changed": {
      const to = str(p.to);
      if (!to) break;
      if (p.scope === "project" || !target) {
        s.status = to;
        break;
      }
      const c = d.child(target);
      c.phase = to;
      c.lastSeq = e.seq;
      if (to === "failed" || to === "blocked") {
        c.alarm = to;
        break;
      }
      c.alarm = undefined;
      const stage = STAGE_OF_PHASE[to];
      // A knocked-down plan stays rubble until a new plan is submitted or work moves past planning.
      if (stage && !(c.stage === "rubble" && stage === "foundation")) c.stage = stage;
      break;
    }
    case "plan.submitted":
    case "plan.validated":
    case "plan.rejected": {
      if (!target) break;
      const c = d.child(target);
      c.lastSeq = e.seq;
      if (e.type === "plan.submitted") {
        c.plan.submitted++;
        if (c.stage === "rubble" || c.stage === "plot") c.stage = "foundation";
      } else if (e.type === "plan.validated") {
        c.plan.validated++;
      } else {
        c.plan.rejected++;
        c.rejections++;
        c.plan.lastReasons = Array.isArray(p.reasons)
          ? p.reasons.filter((r): r is string => typeof r === "string")
          : [];
        c.stage = "rubble";
      }
      break;
    }
    case "test.run": {
      if (!target) break;
      const c = d.child(target);
      c.lastSeq = e.seq;
      c.tests = [
        ...c.tests,
        { seq: e.seq, command: str(p.command) ?? "", passed: p.passed === true, summary: str(p.summary) },
      ];
      break;
    }
    case "worktree.snapshot": {
      if (!target) break;
      const totals = (p.totals ?? {}) as Record<string, unknown>;
      const c = d.child(target);
      c.lastSeq = e.seq;
      c.diff = { files: num(totals.files), added: num(totals.added), removed: num(totals.removed) };
      break;
    }
    case "child.merged": {
      if (!target) break;
      const c = d.child(target);
      c.lastSeq = e.seq;
      c.merged = true;
      break;
    }
    case "child.failed": {
      if (!target) break;
      const c = d.child(target);
      c.lastSeq = e.seq;
      c.alarm = "failed";
      break;
    }
    case "agent.spawned": {
      const who = roleOfActor(e.actor);
      const id = str(p.agentId);
      if (!who || !id) break;
      const childId = target ?? (who.child.startsWith("unknown") ? undefined : who.child);
      if (!childId) break;
      const c = d.child(childId);
      addRole(c, who.role);
      d.agents()[id] = { id, role: who.role, rawRole: who.raw, child: childId, repo: c.repo, since: e.seq };
      break;
    }
    case "agent.stopped": {
      const id = str(p.agentId);
      if (id && s.agents[id]) delete d.agents()[id];
      break;
    }
    case "session.ended":
    case "run.completed": {
      if (Object.keys(s.agents).length) s.agents = {};
      if (e.type === "run.completed") {
        s.done = true;
        s.status = "done";
      }
      break;
    }
    default:
      if (target && e.type !== "project.created" && e.type !== "message.sent") {
        if (!s.children[target]) d.child(target);
      }
  }
  return s;
}

/** Reduces `events` from scratch. */
export function reduceAll(project: string, events: RunEvent[], meta: Record<string, ChildMeta> = {}): WorldState {
  let s = emptyWorld(project);
  for (const e of events) s = reduce(s, e, meta);
  return s;
}
