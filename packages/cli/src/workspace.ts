import fs from "node:fs";
import path from "node:path";
import { isDir, isFile, realish } from "./fsutil.js";

export const DIR = "openfleet";
const PROJECT_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

export interface Workspace {
  /** Directory containing the `openfleet/` folder. */
  root: string;
  /** `<root>/openfleet` */
  dir: string;
  core: string;
  extensions: string;
  projects: string;
  reposFile: string;
  lockFile: string;
}

export function workspaceAt(root: string): Workspace {
  const dir = path.join(root, DIR);
  return {
    root,
    dir,
    core: path.join(dir, "core"),
    extensions: path.join(dir, "extensions"),
    projects: path.join(dir, "projects"),
    reposFile: path.join(dir, "repos.json"),
    lockFile: path.join(dir, "extensions.lock.json"),
  };
}

function isWorkspaceRoot(root: string): boolean {
  return isFile(path.join(root, DIR, "repos.json"));
}

/** Walk up from `start` to find the nearest OpenFleet workspace. */
export function findWorkspace(start: string): Workspace | undefined {
  let cur = realish(start);
  for (;;) {
    if (isWorkspaceRoot(cur)) return workspaceAt(cur);
    const parent = path.dirname(cur);
    if (parent === cur) return undefined;
    cur = parent;
  }
}

export function requireWorkspace(start = process.cwd()): Workspace {
  const ws = findWorkspace(start);
  if (!ws) {
    throw new UserError(
      `No OpenFleet workspace found from ${start}. Run \`npm create @openfleet-tools\` (or \`npx openfleet init\`) first.`,
    );
  }
  return ws;
}

export interface ProjectPaths {
  name: string;
  dir: string;
  spec: string;
  state: string;
  contracts: string;
  plans: string;
  events: string;
  seq: string;
  eventsLock: string;
  stateLock: string;
  patches: string;
  worktrees: string;
}

export function projectPaths(ws: Workspace, name: string): ProjectPaths {
  const dir = path.join(ws.projects, name);
  return {
    name,
    dir,
    spec: path.join(dir, "spec.md"),
    state: path.join(dir, "state.json"),
    contracts: path.join(dir, "contracts"),
    plans: path.join(dir, "plans"),
    events: path.join(dir, "events.jsonl"),
    seq: path.join(dir, ".events.seq"),
    eventsLock: path.join(dir, ".events.lock"),
    stateLock: path.join(dir, ".state.lock"),
    patches: path.join(dir, "patches"),
    worktrees: path.join(dir, "worktrees"),
  };
}

export function validateProjectName(name: string | undefined): string {
  if (!name || !PROJECT_NAME.test(name)) {
    throw new UserError(
      `Invalid project name "${name ?? ""}". Use lowercase letters, digits and dashes (e.g. better-auth).`,
    );
  }
  return name;
}

export function listProjectNames(ws: Workspace): string[] {
  if (!isDir(ws.projects)) return [];
  return fs
    .readdirSync(ws.projects, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isFile(path.join(ws.projects, d.name, "state.json")))
    .map((d) => d.name)
    .sort();
}

/** Errors that should be printed without a stack trace. */
export class UserError extends Error {}
