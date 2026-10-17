import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import semver from "semver";
import { copyDir, isDir, isFile, isInside, readJson, readJsonOr, writeJson } from "./fsutil.js";
import { headSha, isGitRepo } from "./git.js";
import { UserError, type Workspace } from "./workspace.js";

export const MANIFEST = "openfleet.extension.json";
export const SLOTS = ["pre-spec", "post-plan", "post-test", "post-run"] as const;
export const ROLES = ["coordinator", "planner", "implementer", "tester"] as const;
export const PERMISSIONS = ["read", "write", "shell", "web"] as const;
export const BUILTIN_COMMANDS = [
  "init",
  "update",
  "new",
  "resume",
  "status",
  "list",
  "clean",
  "add",
  "remove",
  "extensions",
  "event",
  "state",
  "worktree",
  "help",
  "version",
];

export type Slot = (typeof SLOTS)[number];
export type ExtRole = (typeof ROLES)[number];
export type Permission = (typeof PERMISSIONS)[number];

export interface ExtensionManifest {
  name: string;
  version: string;
  description?: string;
  /** Semver range of compatible @openfleet-tools/cli core versions. */
  core: string;
  mode: "phase" | "augment";
  /** Required for mode "phase". */
  slot?: Slot;
  /** Required for mode "augment". */
  role?: ExtRole;
  /** Markdown instructions (relative path). Defaults to "instructions.md". */
  instructions?: string;
  /** CLI command name -> Markdown skill (relative path). */
  commands?: Record<string, string>;
  /** Defaults to ["read"]. */
  permissions?: Permission[];
}

export interface LockEntry {
  name: string;
  /** Git URL or absolute local path the extension was installed from. */
  source: string;
  /** Pinned commit SHA (git sources) or "local". */
  sha: string;
  /** sha256 of installed contents. */
  hash: string;
  version: string;
  enabled: boolean;
  disabledReason?: string;
  installedAt: string;
}

export interface LockFile {
  v: 1;
  extensions: LockEntry[];
}

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const ALLOWED_EXT = new Set([".md", ".json", ".txt", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);
const ALLOWED_BARE = new Set(["LICENSE", "LICENCE", "NOTICE", "COPYING", ".gitignore", ".gitattributes"]);

export function emptyLock(): LockFile {
  return { v: 1, extensions: [] };
}

export function readLock(ws: Workspace): LockFile {
  return readJsonOr<LockFile>(ws.lockFile, emptyLock());
}

export function writeLock(ws: Workspace, lock: LockFile): void {
  writeJson(ws.lockFile, lock);
}

function fail(dir: string, msg: string): never {
  throw new UserError(`Invalid extension at ${dir}: ${msg}`);
}

function relFile(dir: string, rel: unknown, field: string): string {
  if (typeof rel !== "string" || !rel) fail(dir, `"${field}" must be a relative path`);
  const abs = path.resolve(dir, rel);
  if (!isInside(dir, abs)) fail(dir, `"${field}" escapes the extension folder`);
  if (!isFile(abs)) fail(dir, `"${field}" file not found: ${rel}`);
  if (path.extname(abs) !== ".md") fail(dir, `"${field}" must be a Markdown file`);
  return rel;
}

function walk(dir: string, base = dir, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) fail(base, `symlinks are not allowed (${path.relative(base, abs)})`);
    if (entry.isDirectory()) walk(abs, base, out);
    else out.push(abs);
  }
  return out;
}

/** Extensions are instruction-only: reject anything that could execute. */
export function assertInstructionOnly(dir: string): void {
  for (const file of walk(dir)) {
    const rel = path.relative(dir, file);
    const base = path.basename(file);
    const ext = path.extname(file).toLowerCase();
    if (!ALLOWED_EXT.has(ext) && !ALLOWED_BARE.has(base)) {
      fail(dir, `only Markdown/JSON/text/image files are allowed; found ${rel}`);
    }
    if ((fs.statSync(file).mode & 0o111) !== 0) fail(dir, `executable files are not allowed (${rel})`);
  }
}

export function validateManifest(dir: string): ExtensionManifest {
  const file = path.join(dir, MANIFEST);
  if (!isFile(file)) fail(dir, `missing ${MANIFEST}`);
  let m: Record<string, unknown>;
  try {
    m = readJson<Record<string, unknown>>(file);
  } catch (err) {
    fail(dir, `${MANIFEST} is not valid JSON (${(err as Error).message})`);
  }
  if (typeof m.name !== "string" || !NAME.test(m.name)) fail(dir, `"name" must match ${NAME}`);
  if (typeof m.version !== "string" || !semver.valid(m.version)) fail(dir, `"version" must be a semver version`);
  if (typeof m.core !== "string" || !semver.validRange(m.core)) fail(dir, `"core" must be a semver range`);
  if (m.description !== undefined && typeof m.description !== "string") fail(dir, `"description" must be a string`);
  if (m.mode !== "phase" && m.mode !== "augment") fail(dir, `"mode" must be "phase" or "augment"`);
  if (m.mode === "phase" && !SLOTS.includes(m.slot as Slot)) fail(dir, `"slot" must be one of ${SLOTS.join(", ")}`);
  if (m.mode === "augment" && !ROLES.includes(m.role as ExtRole)) fail(dir, `"role" must be one of ${ROLES.join(", ")}`);
  if (m.mode === "phase" && m.role !== undefined) fail(dir, `"role" is only valid for mode "augment"`);
  if (m.mode === "augment" && m.slot !== undefined) fail(dir, `"slot" is only valid for mode "phase"`);
  relFile(dir, m.instructions ?? "instructions.md", "instructions");
  if (m.commands !== undefined) {
    if (typeof m.commands !== "object" || m.commands === null || Array.isArray(m.commands)) {
      fail(dir, `"commands" must be an object of name -> skill.md`);
    }
    for (const [cmd, skill] of Object.entries(m.commands)) {
      if (!NAME.test(cmd)) fail(dir, `command name "${cmd}" must match ${NAME}`);
      if (BUILTIN_COMMANDS.includes(cmd)) fail(dir, `command "${cmd}" collides with a built-in command`);
      relFile(dir, skill, `commands.${cmd}`);
    }
  }
  if (m.permissions !== undefined) {
    if (!Array.isArray(m.permissions) || !m.permissions.every((p) => PERMISSIONS.includes(p as Permission))) {
      fail(dir, `"permissions" must be a subset of ${PERMISSIONS.join(", ")}`);
    }
  }
  assertInstructionOnly(dir);
  return m as unknown as ExtensionManifest;
}

export function permissionsOf(m: ExtensionManifest): Permission[] {
  const set = new Set<Permission>(["read", ...(m.permissions ?? [])]);
  return PERMISSIONS.filter((p) => set.has(p));
}

/** Map declared permissions to a Copilot custom-agent tool allow-list. */
export function toolsFor(perms: Permission[]): string[] {
  const tools = ["read", "search"];
  if (perms.includes("write")) tools.push("edit");
  if (perms.includes("shell")) tools.push("execute");
  if (perms.includes("web")) tools.push("web");
  return tools;
}

export function describePermissions(m: ExtensionManifest): string {
  const perms = permissionsOf(m);
  const lines = perms.map((p) => {
    switch (p) {
      case "read":
        return "  - read: read and search files";
      case "write":
        return "  - write: create and edit files";
      case "shell":
        return "  - shell: run shell commands";
      case "web":
        return "  - web: fetch URLs / search the web";
    }
  });
  return lines.join("\n");
}

export function isCompatible(m: ExtensionManifest, coreVersion: string): boolean {
  return semver.satisfies(coreVersion, m.core, { includePrerelease: true });
}

function hashDir(dir: string): string {
  const h = crypto.createHash("sha256");
  for (const file of walk(dir).sort()) {
    h.update(path.relative(dir, file).split(path.sep).join("/"));
    h.update("\0");
    h.update(fs.readFileSync(file));
    h.update("\0");
  }
  return h.digest("hex");
}

function looksLikePath(source: string): boolean {
  return (
    source.startsWith(".") ||
    source.startsWith("/") ||
    source.startsWith("~") ||
    /^[A-Za-z]:[\\/]/.test(source) ||
    isDir(path.resolve(source))
  );
}

interface Fetched {
  dir: string;
  source: string;
  sha: string;
  cleanup: () => void;
}

function fetchSource(source: string, cwd: string): Fetched {
  if (looksLikePath(source)) {
    const abs = path.resolve(cwd, source.replace(/^~(?=$|\/)/, os.homedir()));
    if (!isDir(abs)) throw new UserError(`Extension path not found: ${abs}`);
    const sha = isGitRepo(abs) ? (headSha(abs) ?? "local") : "local";
    return { dir: abs, source: abs, sha, cleanup: () => {} };
  }
  const [url, ref] = source.split("#") as [string, string | undefined];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openfleet-ext-"));
  const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true });
  try {
    execFileSync("git", ["clone", "--quiet", url, tmp], { stdio: ["ignore", "ignore", "pipe"] });
    if (ref) execFileSync("git", ["checkout", "--quiet", ref], { cwd: tmp, stdio: ["ignore", "ignore", "pipe"] });
    const sha = headSha(tmp);
    if (!sha) throw new Error("could not resolve HEAD");
    return { dir: tmp, source: url, sha, cleanup };
  } catch (err) {
    cleanup();
    const stderr = String((err as { stderr?: unknown }).stderr ?? (err as Error).message).trim();
    throw new UserError(`Failed to fetch extension from ${source}: ${stderr}`);
  }
}

export interface AddResult {
  entry: LockEntry;
  manifest: ExtensionManifest;
  replaced: boolean;
}

export function addExtension(ws: Workspace, source: string, coreVersion: string, cwd = process.cwd()): AddResult {
  const fetched = fetchSource(source, cwd);
  try {
    const manifest = validateManifest(fetched.dir);
    if (!isCompatible(manifest, coreVersion)) {
      throw new UserError(
        `Extension "${manifest.name}" requires core ${manifest.core}, but installed core is ${coreVersion}.`,
      );
    }
    const dest = path.join(ws.extensions, manifest.name);
    fs.rmSync(dest, { recursive: true, force: true });
    copyDir(fetched.dir, dest, (rel) => rel === ".git" || rel.startsWith(`.git${path.sep}`));
    const lock = readLock(ws);
    const entry: LockEntry = {
      name: manifest.name,
      source: fetched.source,
      sha: fetched.sha,
      hash: hashDir(dest),
      version: manifest.version,
      enabled: true,
      installedAt: new Date().toISOString(),
    };
    const idx = lock.extensions.findIndex((e) => e.name === manifest.name);
    if (idx >= 0) lock.extensions[idx] = entry;
    else lock.extensions.push(entry);
    writeLock(ws, lock);
    return { entry, manifest, replaced: idx >= 0 };
  } finally {
    fetched.cleanup();
  }
}

export function removeExtension(ws: Workspace, name: string): void {
  const lock = readLock(ws);
  const idx = lock.extensions.findIndex((e) => e.name === name);
  if (idx < 0 && !isDir(path.join(ws.extensions, name))) {
    throw new UserError(`Extension "${name}" is not installed.`);
  }
  if (idx >= 0) lock.extensions.splice(idx, 1);
  writeLock(ws, lock);
  fs.rmSync(path.join(ws.extensions, name), { recursive: true, force: true });
}

export interface LoadedExtension {
  entry: LockEntry;
  manifest: ExtensionManifest;
  dir: string;
}

/** Enabled, valid extensions in lock order. Invalid ones are reported via `warn`. */
export function loadExtensions(ws: Workspace, warn: (msg: string) => void = () => {}): LoadedExtension[] {
  const out: LoadedExtension[] = [];
  for (const entry of readLock(ws).extensions) {
    if (!entry.enabled) continue;
    const dir = path.join(ws.extensions, entry.name);
    try {
      out.push({ entry, manifest: validateManifest(dir), dir });
    } catch (err) {
      warn(`Skipping extension "${entry.name}": ${(err as Error).message}`);
    }
  }
  return out;
}

/** Disable extensions whose `core` range excludes `coreVersion`. Returns names disabled. */
export function disableIncompatible(ws: Workspace, coreVersion: string): string[] {
  const lock = readLock(ws);
  const disabled: string[] = [];
  for (const entry of lock.extensions) {
    if (!entry.enabled) continue;
    const dir = path.join(ws.extensions, entry.name);
    let reason: string | undefined;
    try {
      const m = validateManifest(dir);
      if (!isCompatible(m, coreVersion)) reason = `requires core ${m.core}, installed core is ${coreVersion}`;
    } catch (err) {
      reason = (err as Error).message;
    }
    if (reason) {
      entry.enabled = false;
      entry.disabledReason = reason;
      disabled.push(entry.name);
    }
  }
  if (disabled.length) writeLock(ws, lock);
  return disabled;
}
