import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installedCoreVersion, syncExtensions } from "../src/core.js";
import { readCoreIndex } from "../src/coreindex.js";
import {
  addExtension,
  disableIncompatible,
  readLock,
  removeExtension,
  toolsFor,
  validateManifest,
} from "../src/extensions.js";
import { gitRepo, sh, tmpDir, workspace, writeExtension } from "./helpers.js";

const base = { version: "1.0.0", core: ">=0.0.0 <1.0.0" };

describe("validateManifest", () => {
  it("accepts a phase extension", () => {
    const dir = writeExtension(tmpDir(), { ...base, name: "audit", mode: "phase", slot: "post-test" });
    expect(validateManifest(dir).name).toBe("audit");
  });

  it.each([
    [{ name: "Bad Name", mode: "phase", slot: "post-test" }, /name/],
    [{ name: "x", mode: "phase", slot: "mid-flight" }, /slot/],
    [{ name: "x", mode: "augment", role: "boss" }, /role/],
    [{ name: "x", mode: "augment", role: "tester", slot: "post-test" }, /slot/],
    [{ name: "x", mode: "phase", slot: "post-run", commands: { status: "s.md" } }, /built-in/],
    [{ name: "x", mode: "phase", slot: "post-run", permissions: ["root"] }, /permissions/],
    [{ name: "x", mode: "phase", slot: "post-run", instructions: "../escape.md" }, /instructions/],
    [{ name: "x", mode: "phase", slot: "post-run", core: "not a range" }, /core/],
  ])("rejects %j", (manifest, err) => {
    const dir = writeExtension(tmpDir(), { ...base, ...manifest });
    expect(() => validateManifest(dir)).toThrow(err);
  });

  it("rejects code and executables", () => {
    const a = writeExtension(
      tmpDir(),
      { ...base, name: "x", mode: "phase", slot: "post-run" },
      { "run.sh": "echo hi" },
    );
    expect(() => validateManifest(a)).toThrow(/only Markdown/);
    const b = writeExtension(tmpDir(), { ...base, name: "x", mode: "phase", slot: "post-run" });
    fs.chmodSync(path.join(b, "instructions.md"), 0o755);
    expect(() => validateManifest(b)).toThrow(/executable/);
  });

  it("rejects symlinks", () => {
    const dir = writeExtension(tmpDir(), { ...base, name: "x", mode: "phase", slot: "post-run" });
    fs.symlinkSync("/etc/hosts", path.join(dir, "hosts.md"));
    expect(() => validateManifest(dir)).toThrow(/symlink/);
  });
});

describe("toolsFor", () => {
  it("maps permissions to Copilot tool aliases", () => {
    expect(toolsFor(["read"])).toEqual(["read", "search"]);
    expect(toolsFor(["read", "write", "shell", "web"])).toEqual(["read", "search", "edit", "execute", "web"]);
  });
});

describe("add / sync / remove", () => {
  it("installs from a local path, generates agents, skills and the index", () => {
    const ws = workspace();
    const audit = writeExtension(
      tmpDir(),
      {
        ...base,
        name: "audit",
        mode: "phase",
        slot: "post-test",
        permissions: ["shell"],
        commands: { report: "report.md" },
      },
      { "report.md": "# Report\nSummarise events.\n" },
    );
    const style = writeExtension(
      tmpDir(),
      { ...base, name: "style", mode: "augment", role: "implementer" },
      {
        "instructions.md": "Always use tabs.\n",
      },
    );
    addExtension(ws, audit, installedCoreVersion(ws)!);
    addExtension(ws, style, installedCoreVersion(ws)!);
    syncExtensions(ws);

    const lock = readLock(ws);
    expect(lock.extensions.map((e) => [e.name, e.sha, e.enabled])).toEqual([
      ["audit", "local", true],
      ["style", "local", true],
    ]);
    const agents = path.join(ws.core, "agents");
    const implementer = fs.readFileSync(path.join(agents, "openfleet-implementer.agent.md"), "utf8");
    expect(implementer).toContain("## Extension: style");
    expect(implementer).toContain("Always use tabs.");
    const auditAgent = fs.readFileSync(path.join(agents, "openfleet-ext-audit.agent.md"), "utf8");
    expect(auditAgent).toMatch(/name: "openfleet-ext-audit"/);
    expect(auditAgent).toContain('"execute"');
    expect(auditAgent).not.toContain('"edit"');
    expect(fs.readFileSync(path.join(ws.core, "skills", "openfleet-ext-audit-report", "SKILL.md"), "utf8")).toContain(
      "Summarise events.",
    );

    const index = readCoreIndex(ws)!;
    expect(index.slots["post-test"]).toEqual([{ extension: "audit", agent: "openfleet:openfleet-ext-audit" }]);
    expect(index.augments.implementer).toEqual(["style"]);
    expect(index.commands.report).toMatchObject({ extension: "audit", agent: "openfleet:openfleet-ext-audit" });

    removeExtension(ws, "audit");
    syncExtensions(ws);
    expect(fs.existsSync(path.join(agents, "openfleet-ext-audit.agent.md"))).toBe(false);
    expect(fs.existsSync(path.join(ws.core, "skills", "openfleet-ext-audit-report"))).toBe(false);
    expect(readCoreIndex(ws)!.commands).toEqual({});
  });

  it("installs from a git repo at a ref and pins the SHA", () => {
    const ws = workspace();
    const repo = writeExtension(tmpDir(), { ...base, name: "pinned", mode: "phase", slot: "pre-spec" });
    gitRepo(repo, {});
    const sha = sh(repo, "git", ["rev-parse", "HEAD"]).trim();
    sh(repo, "git", ["tag", "v1"]);
    const { entry } = addExtension(ws, `file://${repo}#v1`, "0.1.0");
    expect(entry.sha).toBe(sha);
    expect(fs.existsSync(path.join(ws.extensions, "pinned", ".git"))).toBe(false);
  });

  it("refuses incompatible extensions and disables them on update", () => {
    const ws = workspace();
    const ext = writeExtension(tmpDir(), { ...base, name: "old", mode: "phase", slot: "post-run", core: "^0.1.0" });
    expect(() => addExtension(ws, ext, "2.0.0")).toThrow(/requires core/);
    addExtension(ws, ext, "0.1.0");
    expect(disableIncompatible(ws, "0.2.0")).toEqual(["old"]);
    expect(readLock(ws).extensions[0]).toMatchObject({
      enabled: false,
      disabledReason: expect.stringMatching(/requires core/) as string,
    });
    syncExtensions(ws);
    expect(readCoreIndex(ws)!.slots["post-run"]).toEqual([]);
  });

  it("errors when removing an unknown extension", () => {
    expect(() => removeExtension(workspace(), "nope")).toThrow(/not installed/);
  });
});
