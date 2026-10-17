import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allowedDirs, buildCopilotArgs } from "../src/launcher.js";
import { projectPaths } from "../src/workspace.js";
import { gitRepo, tmpDir, workspace } from "./helpers.js";

function addDirs(args: string[]): string[] {
  return args.flatMap((a, i) => (a === "--add-dir" ? [args[i + 1]!] : []));
}

describe("buildCopilotArgs", () => {
  it("auto-approves tools but keeps path and URL verification and interactive mode", () => {
    const ws = workspace();
    const args = buildCopilotArgs({ ws, agent: "openfleet-coordinator", prompt: "hi" });
    expect(args).toContain("--allow-all-tools");
    for (const flag of ["--allow-all-paths", "--allow-all-urls", "--allow-all", "--yolo", "--autopilot", "-p"]) {
      expect(args).not.toContain(flag);
    }
    expect(args[args.indexOf("-i") + 1]).toBe("hi");
  });

  it("--ask keeps per-tool prompts", () => {
    const ws = workspace();
    expect(buildCopilotArgs({ ws, agent: "openfleet-coordinator", ask: true })).not.toContain("--allow-all-tools");
  });

  it("appends passthrough args last so users can add --yolo", () => {
    const ws = workspace();
    const args = buildCopilotArgs({ ws, agent: "openfleet-coordinator", prompt: "hi", passthrough: ["--yolo"] });
    expect(args.at(-1)).toBe("--yolo");
  });

  it("adds the workspace, project worktrees, cloned repos and local repos", () => {
    const tmp = tmpDir();
    const api = gitRepo(path.join(tmp, "api"));
    const ws = workspace({
      api: { path: api },
      gone: { path: "../does-not-exist" },
      remote: { url: "https://example.com/remote.git" },
    });
    const worktrees = projectPaths(ws, "demo").worktrees;
    fs.mkdirSync(worktrees, { recursive: true });
    const clones = path.join(ws.dir, "repos");
    fs.mkdirSync(path.join(clones, "remote"), { recursive: true });

    const dirs = addDirs(buildCopilotArgs({ ws, agent: "openfleet-coordinator", project: "demo" }));
    expect(dirs).toEqual(expect.arrayContaining([ws.root, worktrees, clones, api]));
    expect(dirs.some((d) => d.includes("does-not-exist"))).toBe(false);
    expect(new Set(dirs).size).toBe(dirs.length);
  });

  it("includes both the given and the real path when a repo path goes through a symlink", () => {
    const tmp = tmpDir();
    const real = gitRepo(path.join(tmp, "real"));
    const link = path.join(tmp, "link");
    fs.symlinkSync(real, link);
    const ws = workspace({ web: { path: link } });
    expect(allowedDirs(ws)).toEqual(expect.arrayContaining([link, real]));
  });
});
