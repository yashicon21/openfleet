import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cliSpec } from "../../create/src/index.js";
import { readEvents } from "../src/events.js";
import { readJson } from "../src/fsutil.js";
import type { ProjectState } from "../src/state.js";
import { gitRepo, tmpDir, writeExtension } from "./helpers.js";

type Launch = { args: string[]; ws: string; project: string };

const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const CREATE = fileURLToPath(new URL("../../create/dist/index.js", import.meta.url));

function fakeCopilot(dir: string): string {
  const file = path.join(dir, "fake-copilot.mjs");
  fs.writeFileSync(
    file,
    `#!/usr/bin/env node
import fs from "node:fs";
fs.writeFileSync(process.env.FAKE_OUT, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), ws: process.env.OPENFLEET_WORKSPACE, project: process.env.OPENFLEET_PROJECT ?? null }));
`,
  );
  fs.chmodSync(file, 0o755);
  return file;
}

function cli(cwd: string, args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("openfleet CLI", () => {
  it("init creates the workspace layout and is idempotent", () => {
    const root = tmpDir();
    expect(cli(root, ["init"]).code).toBe(0);
    for (const rel of ["repos.json", "extensions.lock.json", ".gitignore", "projects", "extensions", "core/plugin.json", "core/hooks.json", "core/lib/hooks/main.js", "core/agents/openfleet-coordinator.agent.md", "core/skills/openfleet-grill/SKILL.md", "core/VERSION"]) {
      expect(fs.existsSync(path.join(root, "openfleet", rel)), rel).toBe(true);
    }
    fs.writeFileSync(path.join(root, "openfleet/repos.json"), JSON.stringify({ v: 1, repos: { keep: { path: "." } } }));
    expect(cli(root, ["init"]).stdout).toContain("Refreshed");
    expect(readJson<{ repos: object }>(path.join(root, "openfleet/repos.json")).repos).toHaveProperty("keep");
  });

  it("commands outside a workspace fail with a friendly error", () => {
    const r = cli(tmpDir(), ["list"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/^openfleet: /);
    expect(r.stderr).not.toContain("    at ");
  });

  it("new launches the coordinator; worktree/state/event helpers work; clean removes worktrees", () => {
    const tmp = tmpDir();
    const repo = gitRepo(path.join(tmp, "web"));
    const root = path.join(tmp, "ws");
    fs.mkdirSync(root);
    cli(root, ["init"]);
    fs.writeFileSync(path.join(root, "openfleet/repos.json"), JSON.stringify({ v: 1, repos: { web: { path: "../web", defaultBranch: "main" } } }));
    const out = path.join(tmp, "launch.json");
    const env = { OPENFLEET_COPILOT_BIN: fakeCopilot(tmp), FAKE_OUT: out };

    const r = cli(root, ["new", "dark-mode", "Add", "dark", "mode", "--", "--model", "x"], env);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    const launch = readJson<Launch>(out);
    const state = readJson<ProjectState>(path.join(root, "openfleet/projects/dark-mode/state.json"));
    expect(launch.args).toEqual(expect.arrayContaining(["--agent", "openfleet:openfleet-coordinator", "--session-id", state.sessionId, "--add-dir", repo, "--model", "x"]));
    expect(launch.args[launch.args.indexOf("--plugin-dir") + 1]).toBe(path.join(root, "openfleet/core"));
    expect(launch.args[launch.args.indexOf("-i") + 1]).toContain("Add dark mode");
    expect(launch).toMatchObject({ ws: root, project: "dark-mode" });
    expect(launch.args).toEqual(expect.arrayContaining(["--allow-all-tools", "--add-dir", root, "--add-dir", path.join(root, "openfleet/projects/dark-mode/worktrees")]));
    expect(launch.args).not.toContain("--allow-all-paths");
    expect(cli(root, ["new", "dark-mode"], env).stderr).toMatch(/already exists/);

    expect(cli(root, ["resume", "dark-mode", "--ask", "--", "--yolo"], env).code).toBe(0);
    const resumed = readJson<Launch>(out);
    expect(resumed.args).not.toContain("--allow-all-tools");
    expect(resumed.args.at(-1)).toBe("--yolo");

    const wt = cli(root, ["worktree", "dark-mode", "web", "--repo", "web", "--branch", "openfleet/dark-mode"]);
    expect(wt.code).toBe(0);
    const child = JSON.parse(wt.stdout) as { worktree: string };
    expect(fs.existsSync(path.join(child.worktree, "README.md"))).toBe(true);
    expect(cli(root, ["worktree", "dark-mode", "web", "--repo", "web", "--branch", "openfleet/dark-mode"]).code).toBe(0);

    expect(cli(root, ["state", "dark-mode", "--patch", '{"children":{"web":{"phase":"planning"}}}']).code).toBe(0);
    expect(cli(root, ["state", "dark-mode", "--patch", "{oops"]).stderr).toMatch(/Invalid JSON/);
    expect(cli(root, ["state", "dark-mode", "--patch", '{"status":"awaiting-approval"}']).stderr).toMatch(/Unknown project status/);
    const assumption = { child: "web", question: "Default theme?", decision: "light", rationale: "Matches the current UI", contractChange: false };
    expect(cli(root, ["event", "dark-mode", "--type", "assumption", "--target", "web", "--payload", JSON.stringify(assumption)]).code).toBe(0);
    const ev = cli(root, ["event", "dark-mode", "--type", "question.asked", "--actor", "web/planner", "--target", "web", "--payload", '{"text":"Which theme?"}']);
    expect((JSON.parse(ev.stdout) as { seq: number }).seq).toBeGreaterThan(0);

    const status = cli(root, ["status", "dark-mode"]);
    expect(status.stdout).toMatch(/web\s+planning/);
    expect(cli(root, ["list"]).stdout).toContain("dark-mode");

    const projectDir = path.join(root, "openfleet/projects/dark-mode");
    const types = readEvents({ events: path.join(projectDir, "events.jsonl") } as never).map((e) => e.type);
    expect(types).toEqual(["project.created", "phase.changed", "worktree.created", "phase.changed", "assumption", "question.asked"]);
    expect(readEvents({ events: path.join(projectDir, "events.jsonl") } as never).find((e) => e.type === "assumption")?.payload).toEqual(assumption);

    const clean = cli(root, ["clean", "dark-mode", "--branches"]);
    expect(clean.code).toBe(0);
    expect(fs.existsSync(child.worktree)).toBe(false);
  });

  it("warns when another active project touches the same repo", () => {
    const root = tmpDir();
    cli(root, ["init"]);
    for (const name of ["one", "two"]) {
      const dir = path.join(root, "openfleet/projects", name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify({ v: 1, name, status: "running", createdAt: "", updatedAt: "", children: { api: { repo: "api", phase: "implementing", retries: 0, dependsOn: [], agentIds: {} } }, questions: [] }));
    }
    expect(cli(root, ["status", "one"]).stderr).toMatch(/"two" is also active on api/);
  });

  it("add/remove extensions and dispatches extension commands", () => {
    const tmp = tmpDir();
    const root = path.join(tmp, "ws");
    fs.mkdirSync(root);
    cli(root, ["init"]);
    const ext = writeExtension(path.join(tmp, "ext"), { name: "audit", version: "1.0.0", core: ">=0.0.0", mode: "phase", slot: "post-run", commands: { report: "report.md" } }, { "report.md": "Report." });
    const add = cli(root, ["add", ext]);
    expect(add.code).toBe(0);
    expect(add.stdout).toContain("Added extension audit@1.0.0");
    expect(cli(root, ["extensions"]).stdout).toContain("audit@1.0.0");

    const out = path.join(tmp, "launch.json");
    expect(cli(root, ["report", "--since", "yesterday"], { OPENFLEET_COPILOT_BIN: fakeCopilot(tmp), FAKE_OUT: out }).code).toBe(0);
    const launch = readJson<Launch>(out);
    expect(launch.args[launch.args.indexOf("--agent") + 1]).toBe("openfleet:openfleet-ext-audit");
    expect(launch.args[launch.args.indexOf("-i") + 1]).toContain("--since yesterday");
    expect(launch.args).toContain("--allow-all-tools");

    expect(cli(root, ["report", "--ask"], { OPENFLEET_COPILOT_BIN: fakeCopilot(tmp), FAKE_OUT: out }).code).toBe(0);
    const asked = readJson<Launch>(out);
    expect(asked.args).not.toContain("--allow-all-tools");
    expect(asked.args[asked.args.indexOf("-i") + 1]).not.toContain("--ask");

    expect(cli(root, ["remove", "audit"]).code).toBe(0);
    expect(cli(root, ["report"]).stderr).toMatch(/Unknown command "report"/);
  });

  it("update reinstalls core and keeps user data", () => {
    const root = tmpDir();
    cli(root, ["init"]);
    fs.writeFileSync(path.join(root, "openfleet/core/agents/junk.agent.md"), "x");
    expect(cli(root, ["update"]).code).toBe(0);
    expect(fs.existsSync(path.join(root, "openfleet/core/agents/junk.agent.md"))).toBe(false);
    expect(fs.existsSync(path.join(root, "openfleet/repos.json"))).toBe(true);
  });
});

describe("@openfleet-tools/create", () => {
  it("defaults --cli to the CLI version it is released with", () => {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const cliVersion = readJson<{ version: string }>(path.join(root, "packages/cli/package.json")).version;
    expect(readJson<{ version: string }>(path.join(root, "packages/create/package.json")).version).toBe(cliVersion);
    expect(cliSpec()).toBe(`@openfleet-tools/cli@^${cliVersion}`);
    expect(cliSpec("1.2.3")).toBe("@openfleet-tools/cli@1.2.3");
    expect(cliSpec("file:../cli")).toBe("file:../cli");
    const config = readJson<{ fixed: string[][] }>(path.join(root, ".changeset/config.json"));
    expect(config.fixed).toContainEqual(expect.arrayContaining(["@openfleet-tools/cli", "@openfleet-tools/create"]));
    const help = spawnSync(process.execPath, [CREATE, "--help"], { encoding: "utf8" });
    expect(help.stdout).toContain(`(default: ^${cliVersion})`);
  });

  it("creates a package.json and skips install when asked", () => {
    const dir = path.join(tmpDir(), "my-fleet");
    const r = spawnSync(process.execPath, [CREATE, dir, "--skip-install"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(readJson<{ name: string; private: boolean }>(path.join(dir, "package.json"))).toEqual({ name: "my-fleet", private: true });
  });

  it("installs a local CLI build and runs init", () => {
    const dir = path.join(tmpDir(), "fleet");
    const cliPkg = fileURLToPath(new URL("..", import.meta.url));
    const r = spawnSync(process.execPath, [CREATE, dir, "--cli", `file:${cliPkg}`], {
      encoding: "utf8",
      env: { ...process.env, npm_config_user_agent: "npm/10" },
    });
    expect(r.stderr).not.toMatch(/ERR!/);
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(dir, "openfleet/core/plugin.json"))).toBe(true);
  }, 120_000);
});
