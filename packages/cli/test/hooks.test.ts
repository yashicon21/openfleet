import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createProject } from "../src/commands/project.js";
import { readEvents } from "../src/events.js";
import { fileChangesFromTool, runHook } from "../src/hooks/handlers.js";
import { addWorktree, headSha } from "../src/git.js";
import { patchState, readState } from "../src/state.js";
import { projectPaths, type Workspace } from "../src/workspace.js";
import { installedCoreVersion, syncExtensions } from "../src/core.js";
import { addExtension } from "../src/extensions.js";
import { gitRepo, publishFixture, tmpDir, workspace } from "./helpers.js";

function setup() {
  const repo = gitRepo(path.join(tmpDir(), "api"), { "src/a.ts": "export const a = 1;\n" });
  const ws = workspace({ api: { path: repo, defaultBranch: "main", confirmed: true } });
  createProject(ws, "demo");
  const p = projectPaths(ws, "demo");
  const worktree = path.join(p.worktrees, "api");
  addWorktree(repo, worktree, "openfleet/demo", "main");
  patchState(p, {
    status: "running",
    children: {
      api: {
        repo: "api",
        repoPath: repo,
        worktree,
        branch: "openfleet/demo",
        baseSha: headSha(worktree),
        phase: "implementing",
      },
    },
  });
  const env = { OPENFLEET_WORKSPACE: ws.root, OPENFLEET_PROJECT: "demo" };
  return { ws, p, worktree, env };
}

const types = (ws: Workspace) => readEvents(projectPaths(ws, "demo")).map((e) => e.type);

describe("fileChangesFromTool", () => {
  it("parses create, edit, multi-edit and apply_patch payloads", () => {
    expect(fileChangesFromTool("create", { path: "a.ts", file_text: "1\n2\n" })).toEqual([
      { path: "a.ts", kind: "added", added: 2, removed: 0 },
    ]);
    expect(fileChangesFromTool("edit", JSON.stringify({ path: "a.ts", old_str: "x", new_str: "y\nz" }))).toEqual([
      { path: "a.ts", kind: "edited", added: 2, removed: 1 },
    ]);
    expect(
      fileChangesFromTool("multi_edit", {
        file_path: "b.ts",
        edits: [
          { old_string: "a", new_string: "b" },
          { old_string: "c\nd", new_string: "" },
        ],
      }),
    ).toEqual([{ path: "b.ts", kind: "edited", added: 1, removed: 3 }]);
    const patch = [
      "*** Begin Patch",
      "*** Add File: n.ts",
      "+x",
      "+y",
      "*** Update File: o.ts",
      "*** Move to: p.ts",
      "-a",
      "+b",
      "*** Delete File: q.ts",
      "*** End Patch",
    ].join("\n");
    expect(fileChangesFromTool("apply_patch", patch)).toEqual([
      { path: "n.ts", kind: "added", added: 2, removed: 0 },
      { path: "p.ts", kind: "added", added: 1, removed: 1 },
      { path: "o.ts", kind: "deleted", added: 0, removed: 0 },
      { path: "q.ts", kind: "deleted", added: 0, removed: 0 },
    ]);
    expect(fileChangesFromTool("view", { path: "a.ts" })).toEqual([]);
  });
});

describe("hooks", () => {
  it("is a no-op outside a workspace", () => {
    expect(runHook("sessionStart", { cwd: tmpDir() }, {})).toEqual({});
  });

  it("records session start and end, and injects workspace context", () => {
    const { ws, env } = setup();
    const out = runHook("sessionStart", { sessionId: "s1", source: "new" }, env);
    expect(out.additionalContext).toContain("Active OpenFleet project: demo");
    runHook("sessionEnd", { sessionId: "s1", reason: "complete" }, env);
    expect(types(ws).slice(-2)).toEqual(["session.started", "session.ended"]);
  });

  it("attributes a spawn via pendingSpawn and injects the assignment", () => {
    const { ws, p, worktree, env } = setup();
    patchState(p, { children: { api: { pendingSpawn: "implementer" } } });
    const out = runHook("subagentStart", { agentName: "openfleet:openfleet-implementer" }, env);
    expect(out.additionalContext).toContain("# OpenFleet assignment");
    expect(out.additionalContext).toContain(worktree);
    const child = readState(p).children.api!;
    expect(child.pendingSpawn).toBeUndefined();
    expect(child.role).toBe("implementer");
    expect(readEvents(p).at(-1)).toMatchObject({ type: "agent.spawned", actor: "api/implementer", target: "api" });
    expect(types(ws)).toContain("agent.spawned");
  });

  it("injects upstream outputs from direct and transitive dependencies", () => {
    const { p, env } = setup();
    patchState(p, {
      children: {
        lib: {
          repo: "lib",
          phase: "done",
          outputs: { publish: { version: "1.2.0-preview.3", prUrl: "https://x/pr/1" } },
        },
        mid: { repo: "mid", phase: "done", dependsOn: ["lib"], outputs: { notes: { "a|b": "line1\nline2" } } },
        other: { repo: "other", phase: "done", outputs: { publish: { version: "9.9.9" } } },
        api: { dependsOn: ["mid"], pendingSpawn: "planner" },
      },
    });
    const out = runHook("subagentStart", { agentName: "openfleet:openfleet-planner" }, env);
    const ctx = out.additionalContext!;
    expect(ctx).toContain("## Upstream outputs");
    expect(ctx).toContain("| lib | publish | `version` | 1.2.0-preview.3 |");
    expect(ctx).toContain("| lib | publish | `prUrl` | https://x/pr/1 |");
    expect(ctx).toContain("| mid | notes | `a\\|b` | line1 line2 |");
    expect(ctx).not.toContain("9.9.9");
    patchState(p, { children: { lib: { pendingSpawn: "implementer" } } });
    expect(runHook("subagentStart", { agentName: "openfleet-implementer" }, env).additionalContext).not.toContain(
      "Upstream outputs",
    );
  });

  it("attributes phase extension agents to their extension", () => {
    const { ws, p, env } = setup();
    addExtension(ws, publishFixture(tmpDir()), installedCoreVersion(ws)!);
    syncExtensions(ws);
    runHook("subagentStart", { agentName: "openfleet:openfleet-ext-publish-post-test" }, env);
    runHook("subagentStop", { agentName: "openfleet:openfleet-ext-publish-post-test", response: "ok" }, env);
    expect(
      readEvents(p)
        .slice(-2)
        .map((e) => [e.type, e.actor]),
    ).toEqual([
      ["agent.spawned", "ext:publish"],
      ["agent.stopped", "ext:publish"],
    ]);
  });

  it("captures file edits with per-file patches and attribution", () => {
    const { p, worktree, env } = setup();
    fs.writeFileSync(path.join(worktree, "src/a.ts"), "export const a = 2;\n");
    fs.writeFileSync(path.join(worktree, "src/b.ts"), "export const b = 1;\n");
    runHook(
      "postToolUse",
      { cwd: worktree, toolName: "edit", toolArgs: { path: "src/a.ts", old_str: "1", new_str: "2" } },
      env,
    );
    runHook(
      "postToolUse",
      {
        cwd: worktree,
        toolName: "create",
        toolArgs: { path: path.join(worktree, "src/b.ts"), file_text: "export const b = 1;\n" },
      },
      env,
    );
    runHook(
      "postToolUse",
      { cwd: tmpDir(), toolName: "create", toolArgs: { path: "/elsewhere/x.ts", file_text: "" } },
      env,
    );
    const files = readEvents(p).filter((e) => e.type.startsWith("file."));
    expect(files.map((e) => [e.type, e.actor, e.payload.path])).toEqual([
      ["file.edited", "api/implementer", "src/a.ts"],
      ["file.added", "api/implementer", "src/b.ts"],
    ]);
    const editPatch = fs.readFileSync(path.join(p.dir, files[0]!.payload.patch as string), "utf8");
    expect(editPatch).toContain("+export const a = 2;");
    const addPatch = fs.readFileSync(path.join(p.dir, files[1]!.payload.patch as string), "utf8");
    expect(addPatch).toContain("+export const b = 1;");
  });

  it("records the stop, the agent id and a de-duplicated worktree snapshot", () => {
    const { p, worktree, env } = setup();
    patchState(p, { children: { api: { role: "implementer" } } });
    fs.writeFileSync(path.join(worktree, "src/a.ts"), "export const a = 3;\n");
    fs.writeFileSync(path.join(worktree, "new.md"), "# new\n");
    runHook(
      "subagentStop",
      { agentName: "openfleet:openfleet-implementer", agentId: "agent-1", response: "Done." },
      env,
    );
    runHook("subagentStop", { agentName: "openfleet-implementer", agentId: "agent-1", response: "Again." }, env);
    const events = readEvents(p);
    expect(events.filter((e) => e.type === "agent.stopped").map((e) => e.target)).toEqual(["api", "api"]);
    const snaps = events.filter((e) => e.type === "worktree.snapshot");
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.payload).toMatchObject({ totals: { files: 2, added: 2, removed: 1 } });
    expect(readState(p).children.api!.agentIds.implementer).toBe("agent-1");
  });

  it("ignores non-OpenFleet subagents", () => {
    const { ws, env } = setup();
    const before = types(ws).length;
    runHook("subagentStart", { agentName: "explore" }, env);
    runHook("subagentStop", { agentName: "explore", response: "x" }, env);
    expect(types(ws)).toHaveLength(before);
  });

  it("runs through the installed core/lib hook entrypoint and never fails", () => {
    const { ws, p, env } = setup();
    const main = path.join(ws.core, "lib", "hooks", "main.js");
    const run = (event: string, input: string) =>
      execFileSync(process.execPath, [main, event], { input, env: { ...process.env, ...env }, encoding: "utf8" });
    expect(
      (JSON.parse(run("sessionStart", JSON.stringify({ sessionId: "s" }))) as { additionalContext: string })
        .additionalContext,
    ).toContain("demo");
    expect(run("postToolUse", "not json")).toBe("");
    expect(readEvents(p).some((e) => e.type === "session.started")).toBe(true);
  });
});
