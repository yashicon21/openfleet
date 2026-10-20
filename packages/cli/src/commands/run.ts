// `npx openfleet next | gate | baseline`: helpers for the plan-first run loop.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { checkCopyPath } from "../copyfiles.js";
import { appendEvent } from "../events.js";
import { schedule } from "../schedule.js";
import { activeChildren, readState, updateState, type ProjectState } from "../state.js";
import { projectPaths, requireWorkspace, UserError, validateProjectName } from "../workspace.js";
import { out } from "./output.js";

export const GATE_USAGE = `Usage:
  openfleet gate <project> consistent [--child <id>[,<id>…]]
  openfleet gate <project> open`;

export const BASELINE_USAGE = `Usage:
  openfleet baseline <project> <child> --report <json>
  openfleet baseline <project> <child> --check`;

function fileHash(file: string): string | null {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

/** Baseline files whose content changed (or that were deleted) since the baseline passed. */
export function baselineChanges(worktree: string, hashes: Record<string, string>): string[] {
  return Object.entries(hashes)
    .filter(([rel, hash]) => fileHash(path.join(worktree, rel)) !== hash)
    .map(([rel]) => rel);
}

function print(state: ProjectState): void {
  out(JSON.stringify(schedule(state), null, 2));
}

export function cmdNext(args: string[]): number {
  const ws = requireWorkspace();
  print(readState(projectPaths(ws, validateProjectName(args[0]))));
  return 0;
}

export function cmdGate(args: string[], flags: { child?: string }): number {
  const ws = requireWorkspace();
  const p = projectPaths(ws, validateProjectName(args[0]));
  const sub = args[1];
  if (sub === "consistent") {
    let checked: string[] = [];
    const next = updateState(p, (s) => {
      const active = activeChildren(s);
      if (!s.plansReady) {
        const waiting = active.filter(([, c]) => ["pending", "planning", "plan-review"].includes(c.phase));
        if (waiting.length) {
          throw new UserError(
            `Not every plan is validated yet: ${waiting.map(([id, c]) => `${id} (${c.phase})`).join(", ")}.`,
          );
        }
      }
      checked = flags.child
        ? flags.child.split(",").map((id) => id.trim())
        : active.filter(([, c]) => c.phase === "planned" && !c.consistent).map(([id]) => id);
      if (!checked.length) throw new UserError("No validated plans are waiting for a consistency check.");
      for (const id of checked) {
        const c = s.children[id];
        if (!c) throw new UserError(`Unknown child "${id}".`);
        if (c.phase !== "planned") throw new UserError(`Child ${id} is "${c.phase}", not "planned".`);
        c.consistent = true;
      }
    });
    appendEvent(p, {
      actor: "coordinator",
      type: "plans.consistent",
      payload: {
        children: checked,
        plans: Object.fromEntries(checked.map((id) => [id, next.children[id]!.plan ?? null])),
        gateOpen: next.plansReady === true,
      },
    });
    print(next);
    return 0;
  }
  if (sub === "open") {
    const next = updateState(p, (s) => {
      const active = activeChildren(s);
      if (!active.length) throw new UserError("No active children: the gate cannot open.");
      const notReady = active.filter(([, c]) => c.phase !== "done" && !(c.phase === "planned" && c.consistent));
      if (notReady.length) {
        throw new UserError(
          `These plans have not passed the consistency check: ${notReady.map(([id, c]) => `${id} (${c.phase})`).join(", ")}.`,
        );
      }
      s.plansReady = true;
    });
    print(next);
    return 0;
  }
  throw new UserError(GATE_USAGE);
}

export function cmdBaseline(args: string[], flags: { report?: string; check?: boolean }): number {
  const ws = requireWorkspace();
  const p = projectPaths(ws, validateProjectName(args[0]));
  const childId = args[1];
  if (childId && flags.check) {
    const c = readState(p).children[childId];
    if (!c) throw new UserError(`Unknown child "${childId}".`);
    if (!c.baselinePassed || !c.worktree) throw new UserError(`Child ${childId} has no passed baseline.`);
    const hashes = c.baselineHashes ?? {};
    const changed = baselineChanges(c.worktree, hashes);
    out(
      JSON.stringify({ child: childId, changed, unchanged: Object.keys(hashes).filter((f) => !changed.includes(f)) }),
    );
    return 0;
  }
  if (!childId || flags.report === undefined) throw new UserError(BASELINE_USAGE);
  let r: Record<string, unknown>;
  try {
    r = JSON.parse(flags.report) as Record<string, unknown>;
  } catch (err) {
    throw new UserError(`Invalid JSON for --report: ${(err as Error).message}`);
  }
  if (typeof r !== "object" || r === null || Array.isArray(r)) throw new UserError("--report must be a JSON object");
  if ((r.status ?? "done") !== "done") {
    throw new UserError(`Only a passing baseline is recorded. Handle a failed baseline with the normal retries.`);
  }
  if (!Array.isArray(r.files) || !r.files.length)
    throw new UserError(`report "files" must list the baseline test files`);
  const files = r.files.map((f) => {
    const checked = checkCopyPath(f);
    if ("error" in checked) throw new UserError(`report "files": "${String(f)}" ${checked.error}`);
    return checked.rel;
  });
  for (const k of ["command", "summary", "results"] as const) {
    if (r[k] !== undefined && typeof r[k] !== "string") throw new UserError(`report "${k}" must be a string`);
  }
  const next = updateState(p, (s) => {
    const c = s.children[childId];
    if (!c) throw new UserError(`Unknown child "${childId}".`);
    if (!c.baseline) throw new UserError(`Child ${childId} has no baseline phase (set "baseline": true).`);
    if (!c.worktree) throw new UserError(`Child ${childId} has no worktree.`);
    const hashes: Record<string, string> = {};
    for (const f of files) {
      const h = fileHash(path.join(c.worktree, f));
      if (!h) throw new UserError(`Baseline file ${f} does not exist in ${c.worktree}.`);
      hashes[f] = h;
    }
    c.baselineFiles = files;
    c.baselineHashes = hashes;
    c.baselinePassed = true;
    if (c.phase === "baseline") c.phase = "planned";
  });
  appendEvent(p, {
    actor: `${childId}/baseline`,
    type: "baseline.passed",
    target: childId,
    payload: {
      files,
      command: r.command ?? null,
      results: r.results ?? null,
      summary: r.summary ?? "",
    },
  });
  out(JSON.stringify(next.children[childId], null, 2));
  return 0;
}
