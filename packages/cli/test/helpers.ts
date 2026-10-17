import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import { initWorkspace } from "../src/commands/workspace.js";
import { realish, writeJson } from "../src/fsutil.js";
import type { Workspace } from "../src/workspace.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

export function tmpDir(prefix = "openfleet-test-"): string {
  const dir = realish(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  temps.push(dir);
  return dir;
}

export function sh(cwd: string, cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function gitRepo(dir: string, files: Record<string, string> = { "README.md": "hello\n" }): string {
  fs.mkdirSync(dir, { recursive: true });
  sh(dir, "git", ["init", "-q", "-b", "main"]);
  sh(dir, "git", ["config", "user.email", "test@example.com"]);
  sh(dir, "git", ["config", "user.name", "Test"]);
  sh(dir, "git", ["config", "commit.gpgsign", "false"]);
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
  sh(dir, "git", ["add", "-A"]);
  sh(dir, "git", ["commit", "-qm", "init"]);
  return dir;
}

/** Fresh workspace with core installed (requires `pnpm build` for core/lib). */
export function workspace(repos: Record<string, object> = {}): Workspace {
  const root = tmpDir();
  const { ws } = initWorkspace(root);
  if (Object.keys(repos).length) writeJson(ws.reposFile, { v: 1, repos });
  return ws;
}

export function writeExtension(
  dir: string,
  manifest: Record<string, unknown>,
  files: Record<string, string> = {},
): string {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "openfleet.extension.json"), JSON.stringify(manifest, null, 2));
  const all = { "instructions.md": `# ${String(manifest.name)}\nDo the thing.\n`, ...files };
  for (const [name, body] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
}
