// Kept dependency-free: hooks import this from the copied core/lib.
import path from "node:path";
import type { ExtRole, Slot } from "./extensions.js";
import { isFile, readJson } from "./fsutil.js";
import type { Workspace } from "./workspace.js";

export interface CoreIndex {
  v: 1;
  coreVersion: string;
  slots: Record<Slot, { extension: string; agent: string }[]>;
  augments: Record<ExtRole, string[]>;
  commands: Record<string, { extension: string; agent: string; skill: string }>;
}

export function readCoreIndex(ws: Workspace): CoreIndex | undefined {
  const file = path.join(ws.core, "extensions.json");
  return isFile(file) ? readJson<CoreIndex>(file) : undefined;
}
