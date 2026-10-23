import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { defaultReplayPath, generateReplay } from "../src/commands/replay.js";
import { workspace } from "./helpers.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/report-run", import.meta.url));

function fixtureWorkspace() {
  const ws = workspace();
  fs.cpSync(FIXTURE, path.join(ws.root, "projects", "demo-run"), { recursive: true });
  return ws;
}

function embeddedData(html: string): {
  project: string;
  gaps: unknown[];
  children: Record<string, { kind: string; label: string }>;
  events: { type: string; payload: Record<string, unknown> }[];
} {
  const m = /<script id="openfleet-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m?.[1]) throw new Error("no embedded data");
  return JSON.parse(m[1]) as ReturnType<typeof embeddedData>;
}

describe("openfleet replay", () => {
  it("writes one offline HTML file with the run model's children and gaps", async () => {
    const ws = fixtureWorkspace();
    const cwd = process.cwd();
    process.chdir(ws.root);
    try {
      expect(await run(["replay", "demo-run"])).toBe(0);
    } finally {
      process.chdir(cwd);
    }
    const html = fs.readFileSync(defaultReplayPath(ws, "demo-run"), "utf8");
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href=/);
    const data = embeddedData(html);
    expect(data.project).toBe("demo-run");
    expect(Object.values(data.children).some((c) => c.kind === "integration")).toBe(true);
    expect(data.events.length).toBeGreaterThan(400);
    // Local paths and agent output are never embedded.
    for (const e of data.events) {
      for (const key of ["worktree", "repoPath", "response", "patch"]) expect(e.payload).not.toHaveProperty(key);
    }
    expect(html).not.toContain(ws.root);
  });

  it("honours --out and --gap", async () => {
    const ws = fixtureWorkspace();
    const out = path.join(ws.root, "out", "run.html");
    const cwd = process.cwd();
    process.chdir(ws.root);
    try {
      expect(await run(["replay", "demo-run", "--out", out, "--gap", "1"])).toBe(0);
      await expect(Promise.resolve().then(() => run(["replay", "demo-run", "--gap", "0"]))).rejects.toThrow(/--gap/);
      await expect(Promise.resolve().then(() => run(["replay"]))).rejects.toThrow(/Usage/);
    } finally {
      process.chdir(cwd);
    }
    const tight = embeddedData(fs.readFileSync(out, "utf8"));
    const loose = embeddedData(await generateReplay(ws, "demo-run", { gapMinutes: 600 }));
    expect(tight.gaps.length).toBeGreaterThan(loose.gaps.length);
  });
});
