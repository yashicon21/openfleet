import fs from "node:fs";
import path from "node:path";
import { installCore, installedCoreVersion, packageVersion } from "../core.js";
import { disableIncompatible, emptyLock, SETTINGS_FILE } from "../extensions.js";
import { readConfig, setConfig, writeWorkspaceVersion } from "../config.js";
import { realish, writeJson } from "../fsutil.js";
import { emptyRepos } from "../repos.js";
import { findWorkspace, MARKER, requireWorkspace, UserError, workspaceAt, type Workspace } from "../workspace.js";
import { out, warn } from "./output.js";

export const WORKSPACE_GITIGNORE = `# Managed by OpenFleet
node_modules/
core/
repos/
projects/*/worktrees/
projects/*/patches/
projects/*/.events.seq
projects/*/.*.lock
.hook-errors.log
`;

/** Entries `init` creates in the workspace root; any of them in a folder without openfleet.json is a clash. */
const MANAGED_ENTRIES = [
  "core",
  "extensions",
  "projects",
  "repos",
  "repos.json",
  "extensions.lock.json",
  SETTINGS_FILE,
  `${MARKER}.lock`,
];

function clashes(root: string): string[] {
  return MANAGED_ENTRIES.filter((name) => fs.existsSync(path.join(root, name)));
}

/** Lines of WORKSPACE_GITIGNORE that an existing .gitignore does not contain. */
export function missingGitignoreLines(file: string): string[] {
  const have = new Set(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim()),
  );
  return WORKSPACE_GITIGNORE.split("\n").filter((l) => l && !l.startsWith("#") && !have.has(l));
}

function ensureFile(file: string, write: () => void): boolean {
  if (fs.existsSync(file)) return false;
  write();
  return true;
}

export interface InitResult {
  ws: Workspace;
  created: boolean;
  /** True when init wrote `.gitignore`; false when one already existed (the suggested lines are printed instead). */
  gitignoreWritten: boolean;
}

/** Scaffold an OpenFleet workspace in `root` (idempotent) and install core. */
export function initWorkspace(root: string): InitResult {
  const existing = findWorkspace(root);
  if (existing && existing.root !== realish(root)) {
    warn(`Already inside the OpenFleet workspace at ${existing.root}; initializing there.`);
  }
  if (!existing) {
    const found = clashes(root);
    if (found.length) {
      throw new UserError(
        `Cannot create an OpenFleet workspace in ${realish(root)}: it already contains ${found.join(", ")}.\n` +
          "Run it in an empty folder or a new subfolder instead.",
      );
    }
  }
  const ws = existing ?? workspaceAt(realish(root));
  const created = !existing;
  fs.mkdirSync(ws.extensions, { recursive: true });
  fs.mkdirSync(ws.projects, { recursive: true });
  for (const dir of [ws.extensions, ws.projects]) {
    ensureFile(path.join(dir, ".gitkeep"), () => fs.writeFileSync(path.join(dir, ".gitkeep"), ""));
  }
  ensureFile(ws.reposFile, () => writeJson(ws.reposFile, emptyRepos()));
  ensureFile(ws.lockFile, () => writeJson(ws.lockFile, emptyLock()));
  writeWorkspaceVersion(ws, packageVersion());
  const gi = path.join(ws.root, ".gitignore");
  const gitignoreWritten = ensureFile(gi, () => fs.writeFileSync(gi, WORKSPACE_GITIGNORE));
  installCore(ws, warn);
  return { ws, created, gitignoreWritten };
}

export function cmdInit(): number {
  const { ws, created, gitignoreWritten } = initWorkspace(process.cwd());
  out(`${created ? "Created" : "Refreshed"} OpenFleet workspace at ${ws.root} (core ${packageVersion()}).`);
  const missing = gitignoreWritten ? [] : missingGitignoreLines(path.join(ws.root, ".gitignore"));
  if (missing.length) {
    out("");
    out(`${path.join(ws.root, ".gitignore")} already exists; OpenFleet left it unchanged. Consider adding:`);
    for (const line of missing) out(`  ${line}`);
  }
  out("");
  out("Next:");
  out('  npx openfleet new <project-name> "<what you want to change>"');
  return 0;
}

export function cmdUpdate(): number {
  const ws = requireWorkspace();
  const before = installedCoreVersion(ws);
  const version = packageVersion();
  const disabled = disableIncompatible(ws, version);
  for (const name of disabled) {
    warn(
      `Disabled extension "${name}": not compatible with core ${version}. Update it, then \`npx openfleet add\` it again.`,
    );
  }
  installCore(ws, warn);
  writeWorkspaceVersion(ws, version);
  out(`Updated OpenFleet core ${before ?? "(none)"} → ${version}.`);
  return 0;
}

const CONFIG_USAGE = "Usage: npx openfleet config | npx openfleet config set <key> <value>";

/** `config` prints the effective workspace settings; `config set <key> <value>` validates and writes one. */
export function cmdConfig(args: string[]): number {
  const ws = requireWorkspace();
  if (!args.length) {
    out(JSON.stringify(readConfig(ws), null, 2));
    return 0;
  }
  const [sub, key, value, ...extra] = args;
  if (sub !== "set" || !key || value === undefined || extra.length) throw new UserError(CONFIG_USAGE);
  out(JSON.stringify(setConfig(ws, key, value), null, 2));
  return 0;
}
