import { labelOf, roleOfActor } from "./reducer.js";
import type { RunEvent } from "./types.js";

const txt = (v: unknown, fallback: string): string => (typeof v === "string" && v ? v : fallback);

export type Tone = "info" | "good" | "bad" | "warn";

/** One-line ticker text for an event, or undefined for noise (file edits, snapshots...). */
export function describe(e: RunEvent): { text: string; tone: Tone } | undefined {
  const p = e.payload ?? {};
  const who = e.target ? labelOf(e.target) : "project";
  switch (e.type) {
    case "project.created":
      return { text: "Project created", tone: "info" };
    case "spec.written":
      return { text: "Spec written", tone: "info" };
    case "spec.approved":
      return { text: "Spec approved — construction can start", tone: "good" };
    case "phase.changed":
      if (p.scope === "project") return { text: `Project is now ${String(p.to)}`, tone: "info" };
      if (p.to === "failed") return { text: `${who} failed`, tone: "bad" };
      if (p.to === "blocked") return { text: `${who} is blocked`, tone: "warn" };
      if (p.to === "done") return { text: `${who} is done`, tone: "good" };
      if (p.to === "pending") return { text: `${who} staked out`, tone: "info" };
      return { text: `${who} → ${String(p.to)}`, tone: "info" };
    case "agent.spawned": {
      const r = roleOfActor(e.actor);
      return r ? { text: `${r.raw} dispatched to ${who}`, tone: "info" } : undefined;
    }
    case "plan.submitted":
      return { text: `Plan submitted for ${who}`, tone: "info" };
    case "plan.validated":
      return { text: `Plan approved for ${who}`, tone: "good" };
    case "plan.rejected":
      return { text: `Plan rejected for ${who} (${txt(p.reason, "invalid")}) — rebuilding`, tone: "bad" };
    case "plans.consistent":
      return { text: "Plans agree with each other", tone: "good" };
    case "test.run":
      return {
        text: `${who}: ${p.passed === true ? "✓" : "✗"} ${txt(p.command, "tests")}`,
        tone: p.passed === true ? "good" : "bad",
      };
    case "child.merged":
      return { text: `${who} merged into ${txt(p.into, "integration")}`, tone: "good" };
    case "child.failed":
      return { text: `${who} failed after retries`, tone: "bad" };
    case "merge.conflict":
      return { text: `Merge conflict in ${who}`, tone: "warn" };
    case "question.escalated":
      return { text: `${who} escalated a question`, tone: "warn" };
    case "assumption":
      return { text: `Decision for ${who}`, tone: "info" };
    case "run.completed":
      return { text: "Run complete", tone: "good" };
    default:
      return undefined;
  }
}
