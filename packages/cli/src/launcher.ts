import { spawnSync } from "node:child_process";
import path from "node:path";
import { qualifiedAgentName } from "./attribution.js";
import fs from "node:fs";
import { isDir, realish } from "./fsutil.js";
import { warn } from "./commands/output.js";
import { deniedChecks, runChecks } from "./preflight.js";
import { readRepos } from "./repos.js";
import { appSandboxContainer, detectSandbox, INHERITED_SANDBOX_MESSAGE, sandboxWarning } from "./sandbox.js";
import { projectPaths, UserError, type Workspace } from "./workspace.js";

export interface LaunchOptions {
  ws: Workspace;
  agent: string;
  prompt?: string;
  sessionId?: string;
  name?: string;
  project?: string;
  /** Extra args forwarded verbatim to the host CLI (after `--`). */
  passthrough?: string[];
  /** Keep Copilot's per-tool permission prompts (`--ask`). Default: auto-approve tools. */
  ask?: boolean;
}

/** Host CLI binary. Overridable for tests and for future hosts (e.g. `claude`). */
export function hostBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env.OPENFLEET_COPILOT_BIN || "copilot";
}

/**
 * Directories the session's agents work in, passed as `--add-dir` so path verification stays on
 * without prompting: the workspace root, the project's worktrees, cloned repos and known local repos.
 */
export function allowedDirs(ws: Workspace, project?: string): string[] {
  const dirs = new Set<string>();
  const add = (p: string) => {
    if (!isDir(p)) return;
    dirs.add(p);
    dirs.add(realish(p));
  };
  add(ws.root);
  if (project) add(projectPaths(ws, project).worktrees);
  add(path.join(ws.dir, "repos"));
  for (const repo of Object.values(readRepos(ws).repos)) {
    if (repo.path) add(path.resolve(ws.root, repo.path));
  }
  return [...dirs];
}

export function buildCopilotArgs(opts: LaunchOptions): string[] {
  const args = ["--plugin-dir", opts.ws.core, "--agent", qualifiedAgentName(opts.agent)];
  if (opts.sessionId) args.push("--session-id", opts.sessionId);
  if (opts.name) args.push("--name", opts.name);
  // Tools run without prompts; paths stay limited to allowedDirs and URLs still prompt.
  if (!opts.ask) args.push("--allow-all-tools");
  for (const dir of allowedDirs(opts.ws, opts.project)) args.push("--add-dir", dir);
  if (opts.prompt) args.push("-i", opts.prompt);
  args.push(...(opts.passthrough ?? []));
  return args;
}

export function launchEnv(opts: LaunchOptions, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...env,
    OPENFLEET_WORKSPACE: opts.ws.root,
    ...(opts.project ? { OPENFLEET_PROJECT: opts.project } : {}),
  };
}

/**
 * Probe git writes from the OpenFleet process itself. If the OS denies them here, the sandbox is
 * inherited from the launching shell and nothing inside Copilot can fix it, so fail before launching.
 */
export function inheritedSandboxCheck(ws: Workspace, project?: string, env: NodeJS.ProcessEnv = process.env): void {
  const denied = deniedChecks(runChecks(ws, project));
  if (!denied.length) return;
  const container = appSandboxContainer(env);
  throw new UserError(
    [
      INHERITED_SANDBOX_MESSAGE,
      ...(container ? [`This process runs inside a macOS App Sandbox (container ${container}).`] : []),
      "",
      "Denied:",
      ...denied.map((c) => `  - ${c.repo ?? "workspace"}: ${c.check} ${c.path} (${c.code})`),
    ].join("\n"),
  );
}

/** Launch Copilot CLI interactively in the workspace root. Returns its exit code. */
export function launch(opts: LaunchOptions): number {
  const bin = hostBinary();
  // Create the worktrees dir up front so it can be passed to --add-dir before any worktree exists.
  if (opts.project) fs.mkdirSync(projectPaths(opts.ws, opts.project).worktrees, { recursive: true });
  inheritedSandboxCheck(opts.ws, opts.project);
  const sandbox = detectSandbox(opts.passthrough ?? [], opts.ws.root);
  if (sandbox.enabled) warn(sandboxWarning(sandbox.source));
  const res = spawnSync(bin, buildCopilotArgs(opts), {
    cwd: opts.ws.root,
    stdio: "inherit",
    env: launchEnv(opts),
  });
  if (res.error) {
    if ((res.error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new UserError(
        `Could not find \`${bin}\`. Install GitHub Copilot CLI (https://github.com/github/copilot-cli) and try again.`,
      );
    }
    throw res.error;
  }
  return res.status ?? 1;
}
