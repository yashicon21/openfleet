// Workspace-level settings in openfleet.json, the workspace root marker. They apply to every
// project in the workspace. Agents change them only through `npx openfleet config set`.
// openfleet.json also records the core `version` the workspace was last initialized or updated with.
import fs from "node:fs";
import { readJson, writeJson } from "./fsutil.js";
import { DEFAULT_HOST, HOSTS, isHost, type Host } from "./hosts.js";
import { withLock } from "./lock.js";
import { UserError, type Workspace } from "./workspace.js";

export interface WorkspaceConfig {
  /** Children with a running or claimed planner, baseline, implementer or tester, across all projects. */
  maxParallel: number;
  /** Agent host new projects launch in (`--host` overrides it for one run). */
  host: Host;
}

export const DEFAULT_MAX_PARALLEL = 6;
export const DEFAULT_CONFIG: WorkspaceConfig = { maxParallel: DEFAULT_MAX_PARALLEL, host: DEFAULT_HOST };
const KEYS = Object.keys(DEFAULT_CONFIG) as (keyof WorkspaceConfig)[];

/** Non-setting keys openfleet.json may hold. */
const META_KEYS = ["version"];

export function configFile(ws: Workspace): string {
  return ws.marker;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseMaxParallel(value: unknown): number {
  const n = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1) {
    throw new UserError(`maxParallel must be a positive integer (got ${JSON.stringify(value)}).`);
  }
  return n;
}

export function parseHost(value: unknown): Host {
  if (typeof value === "string" && isHost(value)) return value;
  throw new UserError(`host must be one of ${HOSTS.join(", ")} (got ${JSON.stringify(value)}).`);
}

const PARSERS: { [K in keyof WorkspaceConfig]: (value: unknown) => WorkspaceConfig[K] } = {
  maxParallel: parseMaxParallel,
  host: parseHost,
};

function validate(raw: unknown, file: string): Partial<WorkspaceConfig> {
  if (!isPlainObject(raw)) throw new UserError(`${file} must be a JSON object.`);
  if (raw.version !== undefined && typeof raw.version !== "string") {
    throw new UserError(`${file}: version must be a string.`);
  }
  const unknown = Object.keys(raw).filter((k) => !(KEYS as string[]).includes(k) && !META_KEYS.includes(k));
  if (unknown.length) {
    throw new UserError(`${file}: unknown key(s) ${unknown.join(", ")}. Known keys: ${KEYS.join(", ")}.`);
  }
  const out: Record<string, unknown> = {};
  for (const key of KEYS) if (raw[key] !== undefined) out[key] = PARSERS[key](raw[key]);
  return out;
}

/** The effective workspace config: openfleet.json over the defaults (a missing file means defaults). */
export function readConfig(ws: Workspace): WorkspaceConfig {
  const file = configFile(ws);
  if (!fs.existsSync(file)) return { ...DEFAULT_CONFIG };
  return { ...DEFAULT_CONFIG, ...validate(readJson(file), file) };
}

/** Validate and write one key under a workspace lock. Returns the new effective config. */
export function setConfig(ws: Workspace, key: string, value: string): WorkspaceConfig {
  if (!(KEYS as string[]).includes(key)) {
    throw new UserError(`Unknown config key "${key}". Known keys: ${KEYS.join(", ")}.`);
  }
  const parsed = PARSERS[key as keyof WorkspaceConfig](value);
  const next = updateMarker(ws, (current) => ({ ...current, [key]: parsed }));
  return { ...DEFAULT_CONFIG, ...validate(next, configFile(ws)) };
}

/** Record the core version in openfleet.json, creating it with the default settings if missing. */
export function writeWorkspaceVersion(ws: Workspace, version: string): void {
  updateMarker(ws, (current) => {
    const settings = { ...current };
    delete settings.version;
    return { version, ...DEFAULT_CONFIG, ...settings };
  });
}

/** Read-modify-write openfleet.json under its lock, keeping keys the change does not touch. */
function updateMarker(
  ws: Workspace,
  change: (current: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown> {
  const file = configFile(ws);
  return withLock(`${file}.lock`, () => {
    const current = fs.existsSync(file) ? readJson(file) : {};
    validate(current, file);
    const next = change(current as Record<string, unknown>);
    writeJson(file, next);
    return next;
  });
}
