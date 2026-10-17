import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function git(cwd: string, args: string[], opts: ExecFileSyncOptions = {}): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
    ...opts,
  }) as string;
}

export function tryGit(cwd: string, args: string[]): string | undefined {
  try {
    return git(cwd, args);
  } catch {
    return undefined;
  }
}

export function isGitRepo(dir: string): boolean {
  return tryGit(dir, ["rev-parse", "--is-inside-work-tree"])?.trim() === "true";
}

export function headSha(dir: string): string | undefined {
  return tryGit(dir, ["rev-parse", "HEAD"])?.trim();
}

export type FileKind = "added" | "edited" | "deleted";

export interface FileChange {
  path: string;
  kind: FileKind;
  added: number;
  removed: number;
  binary?: boolean;
}

export interface Snapshot {
  files: FileChange[];
  patch: string;
}

function parseNumstat(out: string): Map<string, { added: number; removed: number; binary: boolean }> {
  const m = new Map<string, { added: number; removed: number; binary: boolean }>();
  for (const line of out.split("\n")) {
    if (!line) continue;
    const [a, r, ...rest] = line.split("\t");
    const file = rest.join("\t");
    const binary = a === "-" || r === "-";
    m.set(file, { added: binary ? 0 : Number(a), removed: binary ? 0 : Number(r), binary });
  }
  return m;
}

/**
 * Diff of a worktree against `base` (default HEAD), including untracked
 * files, without touching the real index.
 */
export function snapshotWorktree(worktree: string, base = "HEAD"): Snapshot {
  const tmpIndex = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "openfleet-idx-")), "index");
  const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };
  try {
    git(worktree, ["read-tree", base], { env });
    git(worktree, ["add", "-A", "--", "."], { env });
    const status = git(worktree, ["diff", "--cached", "--name-status", "--no-renames", base], { env });
    const numstat = parseNumstat(git(worktree, ["diff", "--cached", "--numstat", "--no-renames", base], { env }));
    const patch = git(worktree, ["diff", "--cached", "--binary", "--no-renames", base], { env });
    const files: FileChange[] = [];
    for (const line of status.split("\n")) {
      if (!line) continue;
      const [code, ...rest] = line.split("\t");
      const file = rest.join("\t");
      const kind: FileKind = code === "A" ? "added" : code === "D" ? "deleted" : "edited";
      const n = numstat.get(file) ?? { added: 0, removed: 0, binary: false };
      files.push({ path: file, kind, added: n.added, removed: n.removed, ...(n.binary ? { binary: true } : {}) });
    }
    return { files, patch };
  } finally {
    fs.rmSync(path.dirname(tmpIndex), { recursive: true, force: true });
  }
}

/** Patch for a single file vs HEAD (handles untracked files). */
export function filePatch(worktree: string, file: string): string {
  const rel = path.isAbsolute(file) ? path.relative(worktree, file) : file;
  const tracked = tryGit(worktree, ["ls-files", "--error-unmatch", "--", rel]) !== undefined;
  if (tracked) return tryGit(worktree, ["diff", "HEAD", "--", rel]) ?? "";
  try {
    git(worktree, ["diff", "--no-index", "--", "/dev/null", rel]);
    return "";
  } catch (err) {
    // `git diff --no-index` exits 1 when files differ; stdout holds the patch.
    return String((err as { stdout?: string | Buffer }).stdout ?? "");
  }
}

export function addWorktree(repoPath: string, worktree: string, branch: string, base?: string): void {
  fs.mkdirSync(path.dirname(worktree), { recursive: true });
  const exists = tryGit(repoPath, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]) !== undefined;
  if (exists) git(repoPath, ["worktree", "add", worktree, branch]);
  else git(repoPath, ["worktree", "add", "-b", branch, worktree, ...(base ? [base] : [])]);
}

export function removeWorktree(repoPath: string, worktree: string, force = false): void {
  git(repoPath, ["worktree", "remove", ...(force ? ["--force"] : []), worktree]);
}

export function deleteBranch(repoPath: string, branch: string, force = false): void {
  git(repoPath, ["branch", force ? "-D" : "-d", branch]);
}
