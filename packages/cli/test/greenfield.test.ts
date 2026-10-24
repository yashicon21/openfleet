import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readEvents } from "../src/events.js";
import { readJson, writeJson } from "../src/fsutil.js";
import { isSetup } from "../src/groups.js";
import type { ReposFile } from "../src/repos.js";
import { newState, patchState, readState, type ProjectState } from "../src/state.js";
import { projectPaths, type Workspace } from "../src/workspace.js";
import { sh, tmpDir, workspace } from "./helpers.js";

const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));

const GIT_ENV = {
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "commit.gpgsign",
  GIT_CONFIG_VALUE_0: "false",
};

function cli(cwd: string, args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV, ...env },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Fake `gh`: records its args; `auth status` fails with FAKE_GH_AUTH=fail; `repo create` adds origin. */
function fakeGh(dir: string): { bin: string; log: string } {
  const bin = path.join(dir, "fake-gh.mjs");
  const log = path.join(dir, "gh.log");
  fs.writeFileSync(
    bin,
    `#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
if (args[0] === "auth") {
  if (process.env.FAKE_GH_AUTH === "fail") { console.error("You are not logged into any GitHub hosts."); process.exit(1); }
  process.exit(0);
}
if (args[0] === "repo" && args[1] === "create") {
  if (process.env.FAKE_GH_CREATE === "fail") { console.error("GraphQL: Name already exists on this account"); process.exit(1); }
  const src = args[args.indexOf("--source") + 1];
  execFileSync("git", ["remote", "add", "origin", "git@github.com:" + args[2] + ".git"], { cwd: src });
  process.exit(0);
}
process.exit(2);
`,
  );
  fs.chmodSync(bin, 0o755);
  return { bin, log };
}

function project(ws: Workspace, name = "invoices") {
  const p = projectPaths(ws, name);
  fs.mkdirSync(p.dir, { recursive: true });
  writeJson(p.state, newState(name, "sess-1"));
  return p;
}

describe("repo create", () => {
  it("creates an empty repo with an initial commit on main and registers it as greenfield", () => {
    const ws = workspace();
    const p = project(ws);
    const r = cli(ws.root, ["repo", "create", "invoices", "--project", "invoices"]);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    const dir = path.join(ws.repos, "invoices");
    expect(sh(dir, "git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim()).toBe("main");
    expect(sh(dir, "git", ["log", "--format=%s"]).trim()).toBe("chore: Initial commit");
    expect(sh(dir, "git", ["ls-tree", "-r", "HEAD"]).trim()).toBe("");
    expect(readJson<ReposFile>(ws.reposFile).repos.invoices).toEqual({
      path: "repos/invoices",
      defaultBranch: "main",
      greenfield: true,
    });
    expect(readState(p).greenfield).toBe(true);
    expect(readEvents(p).find((e) => e.type === "repo.created")).toMatchObject({
      payload: { key: "invoices", path: "repos/invoices", remote: null, github: null },
    });
  });

  it("works without a project and accepts an existing empty folder", () => {
    const ws = workspace();
    fs.mkdirSync(path.join(ws.repos, "web"), { recursive: true });
    expect(cli(ws.root, ["repo", "create", "web"]).code).toBe(0);
    expect(readJson<ReposFile>(ws.reposFile).repos.web?.greenfield).toBe(true);
  });

  it("refuses a non-empty folder, a known key and an invalid key", () => {
    const ws = workspace({ api: { path: "../api" } });
    fs.mkdirSync(path.join(ws.repos, "web"), { recursive: true });
    fs.writeFileSync(path.join(ws.repos, "web", "index.html"), "<p>hi</p>");
    const busy = cli(ws.root, ["repo", "create", "web"]);
    expect(busy.code).toBe(1);
    expect(busy.stderr).toMatch(/already exists and is not empty/);
    expect(fs.existsSync(path.join(ws.repos, "web", ".git"))).toBe(false);
    expect(cli(ws.root, ["repo", "create", "api"]).stderr).toMatch(/already in repos\.json/);
    expect(cli(ws.root, ["repo", "create", "../x"]).stderr).toMatch(/Invalid repo key/);
    expect(cli(ws.root, ["repo", "list"]).stderr).toMatch(/Usage: openfleet repo create/);
  });

  it("--github creates a private repo with gh and records the remote", () => {
    const ws = workspace();
    const gh = fakeGh(tmpDir());
    const r = cli(ws.root, ["repo", "create", "invoices", "--github", "someone/invoices"], {
      OPENFLEET_GH_BIN: gh.bin,
    });
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    const calls = fs
      .readFileSync(gh.log, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as string[]);
    expect(calls[0]).toEqual(["auth", "status"]);
    expect(calls[1]).toEqual([
      "repo",
      "create",
      "someone/invoices",
      "--private",
      "--source",
      path.join(ws.repos, "invoices"),
      "--remote",
      "origin",
      "--push",
    ]);
    expect(readJson<ReposFile>(ws.reposFile).repos.invoices).toMatchObject({
      url: "git@github.com:someone/invoices.git",
      greenfield: true,
    });
  });

  it("--github fails clearly when gh is missing, signed out or create fails, leaving nothing behind", () => {
    const ws = workspace();
    const gh = fakeGh(tmpDir());
    const missing = cli(ws.root, ["repo", "create", "a", "--github", "o/a"], {
      OPENFLEET_GH_BIN: path.join(tmpDir(), "no-gh"),
    });
    expect(missing.code).toBe(1);
    expect(missing.stderr).toMatch(/GitHub CLI/);
    const signedOut = cli(ws.root, ["repo", "create", "a", "--github", "o/a"], {
      OPENFLEET_GH_BIN: gh.bin,
      FAKE_GH_AUTH: "fail",
    });
    expect(signedOut.stderr).toMatch(/not signed in[\s\S]*not logged into any GitHub hosts[\s\S]*gh auth login/);
    const failed = cli(ws.root, ["repo", "create", "a", "--github", "o/a"], {
      OPENFLEET_GH_BIN: gh.bin,
      FAKE_GH_CREATE: "fail",
    });
    expect(failed.stderr).toMatch(/Name already exists/);
    expect(cli(ws.root, ["repo", "create", "a", "--github", "bad"]).stderr).toMatch(/Use <owner>\/<name>/);
    expect(fs.existsSync(path.join(ws.repos, "a"))).toBe(false);
    expect(readJson<ReposFile>(ws.reposFile).repos.a).toBeUndefined();
  });

  it("creates worktrees off the empty initial commit and snapshots them", () => {
    const ws = workspace();
    const p = project(ws);
    expect(cli(ws.root, ["repo", "create", "invoices", "--project", "invoices"]).code).toBe(0);
    const wt = cli(ws.root, ["worktree", "invoices", "invoices/setup", "--branch", "openfleet/invoices--setup"]);
    expect(wt.stderr).toBe("");
    const child = JSON.parse(wt.stdout) as { worktree: string; baseBranch: string; baseSha: string };
    expect(child.baseBranch).toBe("main");
    expect(child.baseSha).toBe(sh(path.join(ws.repos, "invoices"), "git", ["rev-parse", "main"]).trim());
    fs.writeFileSync(path.join(child.worktree, "package.json"), "{}\n");
    const scope = cli(ws.root, ["scope", "invoices", "invoices/setup", "--check"]);
    expect(JSON.parse(scope.stdout)).toMatchObject({ changed: ["package.json"], ok: true });
    expect(readState(p).children["invoices/setup"]?.phase).toBe("pending");
  });
});

describe("greenfield child kinds", () => {
  function greenfieldProject(children: Record<string, object>, greenfield = true): ProjectState {
    const ws = workspace();
    const p = project(ws);
    return patchState(p, { greenfield, children });
  }

  it("adds setup → contracts → services ∥ frontend → system to dependsOn", () => {
    const s = greenfieldProject({
      "app/setup": { kind: "setup" },
      "app:contracts": { kind: "contracts" },
      "app:invoices": { kind: "service" },
      "app:payments": { kind: "service", dependsOn: ["app:invoices"] },
      "app:web": { kind: "frontend" },
      "app/system": { kind: "system" },
    });
    const deps = (id: string) => [...s.children[id]!.dependsOn].sort();
    expect(deps("app/setup")).toEqual([]);
    expect(deps("app:contracts")).toEqual(["app/setup"]);
    expect(deps("app:invoices")).toEqual(["app/setup", "app:contracts"]);
    expect(deps("app:payments")).toEqual(["app/setup", "app:contracts", "app:invoices"]);
    expect(deps("app:web")).toEqual(["app/setup", "app:contracts"]);
    expect(deps("app/system")).toEqual(["app/setup", "app:contracts", "app:invoices", "app:payments", "app:web"]);
    expect(s.children.app?.integration).toBe(true);
    expect(isSetup("app/setup", s.children["app/setup"]!)).toBe(true);
  });

  it("keeps setup per repo in a multi-repo layout", () => {
    const s = greenfieldProject({
      "api/setup": { kind: "setup" },
      "web/setup": { kind: "setup" },
      "api/contracts": { kind: "contracts" },
      "web/ui": { kind: "frontend" },
    });
    expect([...s.children["web/ui"]!.dependsOn].sort()).toEqual(["api/contracts", "web/setup"]);
    expect(s.children["api/contracts"]!.dependsOn).toEqual(["api/setup"]);
  });

  it("leaves dependsOn alone outside greenfield projects and rejects unknown kinds", () => {
    const s = greenfieldProject({ "app/setup": { kind: "setup" }, "app/web": { kind: "frontend" } }, false);
    expect(s.children["app/web"]!.dependsOn).toEqual([]);
    const ws = workspace();
    const p = project(ws);
    expect(() => patchState(p, { children: { app: { kind: "database" } } })).toThrow(/Unknown kind "database"/);
  });
});
