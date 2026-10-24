import { describe, expect, it } from "vitest";
import {
  buildReplayData,
  buildTimeline,
  countAt,
  describe as describeEvent,
  emptyWorld,
  pauseAt,
  planSummary,
  realAt,
  reduce,
  reduceAll,
  renderReplayHtml,
  roleOfActor,
  type RunEvent,
} from "../src/index.js";
import { scriptJson } from "../src/html.js";

const T0 = Date.parse("2026-01-01T10:00:00.000Z");
const MIN = 60_000;
let seq = 0;

function ev(
  min: number,
  type: string,
  target: string | null,
  payload: Record<string, unknown> = {},
  actor = "coordinator",
): RunEvent {
  return { v: 1, ts: new Date(T0 + min * MIN).toISOString(), seq: ++seq, actor, type, target, payload };
}
const phase = (min: number, child: string, to: string) => ev(min, "phase.changed", child, { scope: "child", to });

describe("replay reducer", () => {
  it("grows a building through the phases", () => {
    const id = "web/users";
    const stages: string[] = [];
    let s = emptyWorld("demo");
    for (const e of [
      phase(0, id, "pending"),
      phase(1, id, "planning"),
      phase(2, id, "implementing"),
      phase(3, id, "testing"),
      phase(4, id, "done"),
    ]) {
      s = reduce(s, e);
      stages.push(s.children[id]!.stage);
    }
    expect(stages).toEqual(["plot", "foundation", "scaffold", "testing", "finished"]);
    expect(s.children[id]).toMatchObject({ repo: "web", label: "users" });
    expect(s.repos.web?.children).toEqual([id]);
  });

  it("never mutates the previous state", () => {
    const a = reduce(emptyWorld("demo"), phase(0, "web/users", "planning"));
    const snapshot = JSON.stringify(a);
    const b = reduce(a, phase(1, "web/users", "implementing"));
    expect(JSON.stringify(a)).toBe(snapshot);
    expect(b.children["web/users"]!.stage).toBe("scaffold");
    // Untouched children keep their identity, so storing a state per event is cheap.
    const c = reduce(reduce(b, phase(2, "web/roles", "planning")), phase(3, "web/roles", "implementing"));
    expect(c.children["web/users"]).toBe(b.children["web/users"]);
  });

  it("knocks a rejected plan down to rubble until a new plan is submitted", () => {
    const id = "web/users";
    const s1 = reduceAll("demo", [
      phase(0, id, "planning"),
      ev(1, "plan.submitted", id),
      ev(2, "plan.rejected", id, { reasons: ["Use the shared toast API", 3] }),
    ]);
    expect(s1.children[id]).toMatchObject({ stage: "rubble", rejections: 1 });
    expect(s1.children[id]!.plan.lastReasons).toEqual(["Use the shared toast API"]);
    const s2 = reduce(s1, phase(3, id, "planning"));
    expect(s2.children[id]!.stage).toBe("rubble");
    const s3 = reduce(s2, ev(4, "plan.submitted", id));
    expect(s3.children[id]!.stage).toBe("foundation");
  });

  it("raises an alarm on failure and clears it when work resumes", () => {
    const id = "web";
    let s = reduceAll("demo", [phase(0, id, "implementing"), phase(1, id, "blocked")]);
    expect(s.children[id]).toMatchObject({ stage: "scaffold", alarm: "blocked" });
    s = reduce(s, phase(2, id, "implementing"));
    expect(s.children[id]!.alarm).toBeUndefined();
    s = reduce(s, ev(3, "child.failed", id));
    expect(s.children[id]!.alarm).toBe("failed");
  });

  it("tracks agents, tests, diffs and merges", () => {
    const id = "web/users";
    const s = reduceAll("demo", [
      ev(0, "agent.spawned", id, { agentId: "a1" }, "web/users/implementer"),
      ev(0, "agent.spawned", "web", { agentId: "a2" }, "web/repo-coordinator"),
      ev(1, "test.run", id, { command: "pnpm test", passed: true, summary: "12 passed" }),
      ev(2, "worktree.snapshot", id, { totals: { files: 3, added: 40, removed: 7 } }),
      ev(3, "agent.stopped", null, { agentId: "a1" }),
      ev(4, "child.merged", id),
    ]);
    expect(Object.keys(s.agents)).toEqual(["a2"]);
    expect(s.agents.a2).toMatchObject({ role: "coordinator", child: "web" });
    expect(s.children[id]).toMatchObject({
      roles: ["implementer"],
      merged: true,
      diff: { files: 3, added: 40, removed: 7 },
      tests: [{ command: "pnpm test", passed: true, summary: "12 passed" }],
    });
    const done = reduce(s, ev(5, "run.completed", null));
    expect(done).toMatchObject({ done: true, status: "done", agents: {} });
  });

  it("maps actors to robot roles", () => {
    expect(roleOfActor("web/users/tester")).toEqual({ role: "tester", raw: "tester", child: "web/users" });
    expect(roleOfActor("web/baseline")?.role).toBe("tester");
    expect(roleOfActor("coordinator")).toBeUndefined();
    expect(roleOfActor("web/users/human")).toBeUndefined();
  });
});

describe("replay timeline", () => {
  const events = [ev(0, "a", null), ev(5, "b", null), ev(65, "c", null), ev(70, "d", null)];

  it("collapses long gaps into short pauses", () => {
    const tl = buildTimeline(events);
    expect(tl.at).toEqual([0, 300, 320, 620]);
    expect(tl.pauses).toEqual([{ from: 300, to: 320, realFrom: T0 + 5 * MIN, realTo: T0 + 65 * MIN }]);
    expect(countAt(tl, 0)).toBe(1);
    expect(countAt(tl, 310)).toBe(2);
    expect(countAt(tl, 1000)).toBe(4);
    expect(pauseAt(tl, 310)).toBeDefined();
    expect(pauseAt(tl, 330)).toBeUndefined();
    expect(realAt(tl, 150)).toBe(T0 + 2.5 * MIN);
    expect(realAt(tl, 310)).toBe(T0 + 35 * MIN);
    expect(realAt(tl, 380)).toBe(T0 + 66 * MIN);
  });

  it("uses the run model's gaps when given", () => {
    const tl = buildTimeline(events, { gaps: [{ start: T0, end: T0 + 5 * MIN }] });
    expect(tl.pauses.map((p) => p.from)).toEqual([0]);
    expect(tl.duration).toBe(20 + 3600 + 300);
  });
});

describe("replay data", () => {
  it("slims payloads, adds inferred stops and summarizes plans", () => {
    const data = buildReplayData({
      project: "demo",
      events: [
        ev(1, "worktree.snapshot", "web", { totals: { files: 1 }, files: ["a"], worktree: "/home/me/wt" }),
        ev(0, "agent.spawned", "web", { agentId: "a1", response: "x".repeat(5000) }, "web/implementer"),
        ev(2, "file.edited", "web", { kind: "edit", lines: 4, path: "/secret/path.ts" }),
        ev(3, "phase.changed", "web", { to: "done", note: "y".repeat(1000) }),
      ],
      children: [{ id: "web", repo: "web", label: "web", kind: "single", dependsOn: [], plan: "plans/web.md" }],
      gaps: [],
      inferredStops: [{ agentId: "a1", end: T0 + 1.5 * MIN }],
      readPlan: (p) =>
        p === "plans/web.md" ? "# Plan\n\nIntro.\n\n## Summary\n\nDo the thing.\n\n## Steps\n\n1. x" : undefined,
      now: new Date(T0),
    });
    expect(data.events.map((e) => e.type)).toEqual([
      "agent.spawned",
      "worktree.snapshot",
      "agent.stopped",
      "file.edited",
      "phase.changed",
    ]);
    expect(data.events[0]!.payload).toEqual({ agentId: "a1" });
    expect(data.events[1]!.payload).toEqual({ totals: { files: 1 } });
    expect(data.events[2]!.payload).toEqual({ agentId: "a1", inferred: true });
    expect(data.events[3]!.payload).toEqual({ kind: "edit", lines: 4 });
    expect(String(data.events[4]!.payload.note).length).toBeLessThanOrEqual(400);
    expect(data.children.web!.planSummary).toBe("Do the thing.");
    expect(data.generatedAt).toBe(new Date(T0).toISOString());
    expect(reduceAll("demo", data.events).agents).toEqual({});
  });

  it("falls back to a plan's first paragraph", () => {
    expect(planSummary("# Title\n\nFirst paragraph\nwraps here.\n\nSecond.")).toBe("First paragraph wraps here.");
    expect(planSummary("")).toBeUndefined();
  });

  it("describes notable events for the ticker and skips noise", () => {
    expect(describeEvent(phase(0, "web/users", "done"))?.tone).toBe("good");
    expect(describeEvent(ev(0, "file.edited", "web", {}))).toBeUndefined();
  });
});

describe("replay html", () => {
  it("escapes embedded JSON so it cannot close the script tag", () => {
    const json = scriptJson({ s: "</script><script>alert(1)</script>\u2028" });
    expect(json).not.toContain("<");
    expect(json).not.toContain("\u2028");
    expect(JSON.parse(json)).toEqual({ s: "</script><script>alert(1)</script>\u2028" });
  });

  it("is one offline file with the renderer and data inlined", () => {
    const data = buildReplayData({ project: "demo", events: [phase(0, "web", "planning")], children: [] });
    const html = renderReplayHtml({ ...data, title: "</script>demo" });
    expect(html).toContain('<script id="openfleet-data" type="application/json">');
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href=/);
    expect(html).toContain("Three.js Authors");
    expect(html.match(/<\/script>/g)?.length).toBe(2);
  });
});
