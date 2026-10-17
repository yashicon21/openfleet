import fs from "node:fs";
import path from "node:path";
import { installCore, installedCoreVersion, packageVersion } from "../core.js";
import { disableIncompatible, emptyLock } from "../extensions.js";
import { realish, writeJson } from "../fsutil.js";
import { emptyRepos } from "../repos.js";
import { findWorkspace, requireWorkspace, workspaceAt, type Workspace } from "../workspace.js";
import { out, warn } from "./output.js";

export const WORKSPACE_GITIGNORE = `# Managed by OpenFleet
core/
repos/
projects/*/worktrees/
projects/*/patches/
projects/*/.events.seq
projects/*/.*.lock
.hook-errors.log
`;

function ensureFile(file: string, write: () => void): boolean {
  if (fs.existsSync(file)) return false;
  write();
  return true;
}

export interface InitResult {
  ws: Workspace;
  created: boolean;
}

/** Scaffold `<root>/openfleet/` (idempotent) and install core. */
export function initWorkspace(root: string): InitResult {
  const existing = findWorkspace(root);
  if (existing && existing.root !== realish(root)) {
    warn(`Already inside the OpenFleet workspace at ${existing.root}; initializing there.`);
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
  const gi = path.join(ws.dir, ".gitignore");
  ensureFile(gi, () => fs.writeFileSync(gi, WORKSPACE_GITIGNORE));
  installCore(ws, warn);
  return { ws, created };
}

export function cmdInit(): number {
  const { ws, created } = initWorkspace(process.cwd());
  out(`${created ? "Created" : "Refreshed"} OpenFleet workspace at ${ws.dir} (core ${packageVersion()}).`);
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
  out(`Updated OpenFleet core ${before ?? "(none)"} → ${version}.`);
  return 0;
}
