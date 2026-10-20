// Deterministic run scheduling: every plan first, then the `plans-ready` gate, then
// baselines and implementation in `dependsOn` order. `npx openfleet next` prints this.
import { activeChildren, type ChildPhase, type ProjectState } from "./state.js";

export type Action =
  | { action: "plan"; child: string }
  | { action: "check-consistency"; children: string[] }
  | { action: "plans-ready" }
  | { action: "baseline"; child: string }
  | { action: "implement"; child: string }
  | { action: "block"; child: string; dependency: string }
  | { action: "finalize" };

export interface Waiting {
  child: string;
  reason: string;
}

export type GateState = "planning" | "checking" | "plans-ready" | "open";

export interface Schedule {
  gate: GateState;
  actions: Action[];
  waiting: Waiting[];
}

const FINISHED: readonly ChildPhase[] = ["done", "failed", "blocked"];
const PLANNING: readonly ChildPhase[] = ["pending", "planning", "plan-review"];

/** What the coordinator should do next. Only meaningful while the project is `running`. */
export function schedule(state: ProjectState): Schedule {
  const actions: Action[] = [];
  const waiting: Waiting[] = [];
  const needsCheck: string[] = [];
  const gateOpen = state.plansReady === true;
  const failedDep = (deps: string[]) =>
    deps.find((d) => {
      const phase = state.children[d]?.phase;
      return phase === "failed" || phase === "blocked";
    });

  for (const [id, c] of Object.entries(state.children)) {
    if (FINISHED.includes(c.phase)) continue;
    const bad = failedDep(c.dependsOn);
    if (bad) {
      actions.push({ action: "block", child: id, dependency: bad });
      continue;
    }
    switch (c.phase) {
      case "pending":
        actions.push({ action: "plan", child: id });
        break;
      case "planning":
        waiting.push({ child: id, reason: "planner running" });
        break;
      case "plan-review":
        waiting.push({ child: id, reason: "plan under review" });
        break;
      case "planned": {
        if (!c.consistent) {
          needsCheck.push(id);
          break;
        }
        if (!gateOpen) {
          waiting.push({ child: id, reason: "plans-ready gate" });
          break;
        }
        if (c.baseline && !c.baselinePassed) {
          actions.push({ action: "baseline", child: id });
          break;
        }
        const open = c.dependsOn.filter((d) => state.children[d]?.phase !== "done");
        if (open.length) waiting.push({ child: id, reason: `dependencies: ${open.join(", ")}` });
        else actions.push({ action: "implement", child: id });
        break;
      }
      case "baseline":
        waiting.push({ child: id, reason: "baseline tester running" });
        break;
      default:
        waiting.push({ child: id, reason: `${c.phase} in progress` });
    }
  }

  const active = activeChildren(state);
  const blocking = new Set(actions.filter((a) => a.action === "block").map((a) => (a as { child: string }).child));
  const stillPlanning = active.filter(([id, c]) => !blocking.has(id) && PLANNING.includes(c.phase));
  let gate: GateState = gateOpen ? "open" : "planning";
  if (needsCheck.length) {
    if (gateOpen || !stillPlanning.length) {
      actions.push({ action: "check-consistency", children: needsCheck });
      if (!gateOpen) gate = "checking";
    } else {
      for (const id of needsCheck) waiting.push({ child: id, reason: "other plans (consistency check)" });
    }
  } else if (!gateOpen && active.length && !stillPlanning.length && !blocking.size) {
    actions.push({ action: "plans-ready" });
    gate = "plans-ready";
  }

  if (Object.values(state.children).length && Object.values(state.children).every((c) => FINISHED.includes(c.phase))) {
    actions.push({ action: "finalize" });
  }
  return { gate, actions, waiting };
}
