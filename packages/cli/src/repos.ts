import { readJsonOr, writeJson } from "./fsutil.js";
import type { Workspace } from "./workspace.js";

export interface PackageEntry {
  /** Path relative to the repo root. */
  path: string;
  build?: string;
  test?: string;
  /** End-to-end test command (for example Playwright). */
  e2e?: string;
}

export interface RepoEntry {
  /** Absolute or workspace-relative path to a local checkout. */
  path?: string;
  /** Git URL to clone when no local checkout exists. */
  url?: string;
  defaultBranch?: string;
  build?: string;
  test?: string;
  /** End-to-end test command (for example Playwright). */
  e2e?: string;
  /**
   * Local, uncommitted files (for example `.env.local`) that `npx openfleet worktree` copies from
   * the main checkout into each new worktree. Relative to the repo root. Never committed or logged.
   */
  copyFiles?: string[];
  /** Names (never values) of the env vars and credentials the repo needs to build and test. */
  env?: string[];
  /** Monorepo packages, keyed by package name. */
  packages?: Record<string, PackageEntry>;
  description?: string;
  /** Build/test commands were confirmed by the user. */
  confirmed?: boolean;
}

export interface ReposFile {
  v: 1;
  repos: Record<string, RepoEntry>;
}

export function emptyRepos(): ReposFile {
  return { v: 1, repos: {} };
}

export function readRepos(ws: Workspace): ReposFile {
  return readJsonOr<ReposFile>(ws.reposFile, emptyRepos());
}

export function writeRepos(ws: Workspace, repos: ReposFile): void {
  writeJson(ws.reposFile, repos);
}
