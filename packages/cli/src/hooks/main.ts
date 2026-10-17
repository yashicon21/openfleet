#!/usr/bin/env node
// Entry point invoked by core/hooks.json: `node lib/hooks/main.js <event>`.
// Never fails the Copilot session: errors are logged and the hook exits 0.
import fs from "node:fs";
import path from "node:path";
import { resolveContext, runHook, type HookPayload } from "./handlers.js";

function readStdin(): string {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main(): void {
  const event = process.argv[2] ?? "";
  let payload: HookPayload = {};
  try {
    const raw = readStdin();
    payload = raw.trim() ? (JSON.parse(raw) as HookPayload) : {};
    const out = runHook(event, payload);
    if (out.additionalContext) process.stdout.write(JSON.stringify(out));
  } catch (err) {
    try {
      const ctx = resolveContext(payload);
      if (ctx) {
        fs.appendFileSync(
          path.join(ctx.ws.dir, ".hook-errors.log"),
          `${new Date().toISOString()} ${event}: ${(err as Error).stack ?? String(err)}\n`,
        );
      }
    } catch {
      // ignore
    }
  }
}

main();
