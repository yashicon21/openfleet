import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installedCoreVersion, syncExtensions } from "../src/core.js";
import { findSlotEntry, readCoreIndex } from "../src/coreindex.js";
import {
  addExtension,
  disableIncompatible,
  phaseAgentNames,
  readLock,
  removeExtension,
  resolveSettings,
  toolsFor,
  validateManifest,
} from "../src/extensions.js";
import { writeJson } from "../src/fsutil.js";
import { gitRepo, publishFixture, sh, tmpDir, workspace, writeExtension } from "./helpers.js";

const base = { manifest: 2, version: "1.0.0", core: ">=0.0.0 <1.0.0" };
const phase = (slot: string, extra: Record<string, unknown> = {}) => ({
  phases: [{ slot, instructions: "instructions.md", ...extra }],
});

describe("validateManifest", () => {
  it("accepts phase and augment entries", () => {
    const dir = writeExtension(tmpDir(), { ...base, name: "audit", ...phase("post-test") });
    expect(validateManifest(dir).name).toBe("audit");
    const fixture = validateManifest(publishFixture(tmpDir()));
    expect(fixture.phases?.[0]).toMatchObject({ slot: "post-test", blocking: true, timeoutMinutes: 45 });
    expect(fixture.augments).toEqual([{ role: "implementer", instructions: "pin.md" }]);
  });

  it.each([
    [{ name: "Bad Name", ...phase("post-test") }, /name/],
    [{ name: "x" }, /at least one/],
    [{ name: "x", phases: [], augments: [] }, /at least one/],
    [{ name: "x", ...phase("mid-flight") }, /slot/],
    [{ name: "x", augments: [{ role: "boss", instructions: "instructions.md" }] }, /role/],
    [
      { name: "x", augments: [{ role: "tester", instructions: "instructions.md", slot: "post-test" }] },
      /unknown field/,
    ],
    [{ name: "x", ...phase("post-test", { blocking: "yes" }) }, /blocking/],
    [{ name: "x", ...phase("post-run", { blocking: true }) }, /only supported in the slots/],
    [{ name: "x", ...phase("post-test", { when: { files: [] } }) }, /when/],
    [{ name: "x", ...phase("post-test", { when: { files: ["../up"] } }) }, /when/],
    [{ name: "x", ...phase("post-test", { timeoutMinutes: 0 }) }, /timeoutMinutes/],
    [{ name: "x", ...phase("post-run"), commands: { status: "s.md" } }, /built-in/],
    [{ name: "x", ...phase("post-run"), commands: { ext: "s.md" } }, /built-in/],
    [{ name: "x", ...phase("post-run"), permissions: ["root"] }, /permissions/],
    [{ name: "x", phases: [{ slot: "post-run", instructions: "../escape.md" }] }, /instructions/],
    [{ name: "x", ...phase("post-run"), core: "not a range" }, /core/],
    [{ name: "x", ...phase("post-run"), settings: { label: { default: 1 } } }, /settings.label.default/],
    [{ name: "x", ...phase("post-run"), manifest: 3 }, /"manifest" must be 2/],
    [{ name: "x", ...phase("post-run"), mode: "phase" }, /not a manifest v2 field/],
  ])("rejects %j", (manifest, err) => {
    const dir = writeExtension(tmpDir(), { ...base, ...manifest });
    expect(() => validateManifest(dir)).toThrow(err);
  });

  it("rejects version 1 manifests and shows the v2 equivalent", () => {
    const dir = writeExtension(tmpDir(), {
      name: "old",
      version: "1.0.0",
      core: ">=0.0.0",
      mode: "phase",
      slot: "post-run",
      instructions: "instructions.md",
      permissions: ["read"],
    });
    let message = "";
    try {
      validateManifest(dir);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/manifest version 1/);
    const json = JSON.parse(message.slice(message.indexOf("{"))) as Record<string, unknown>;
    expect(json).toEqual({
      manifest: 2,
      name: "old",
      version: "1.0.0",
      core: ">=0.0.0",
      permissions: ["read"],
      phases: [{ slot: "post-run", instructions: "instructions.md" }],
    });
    const aug = writeExtension(tmpDir(), { name: "a", version: "1.0.0", core: "*", mode: "augment", role: "tester" });
    expect(() => validateManifest(aug)).toThrow(/"augments": \[\s*\{\s*"role": "tester"/);
  });

  it("rejects code and executables", () => {
    const a = writeExtension(tmpDir(), { ...base, name: "x", ...phase("post-run") }, { "run.sh": "echo hi" });
    expect(() => validateManifest(a)).toThrow(/only Markdown/);
    const b = writeExtension(tmpDir(), { ...base, name: "x", ...phase("post-run") });
    fs.chmodSync(path.join(b, "instructions.md"), 0o755);
    expect(() => validateManifest(b)).toThrow(/executable/);
  });

  it("rejects symlinks", () => {
    const dir = writeExtension(tmpDir(), { ...base, name: "x", ...phase("post-run") });
    fs.symlinkSync("/etc/hosts", path.join(dir, "hosts.md"));
    expect(() => validateManifest(dir)).toThrow(/symlink/);
  });
});

describe("phaseAgentNames", () => {
  it("is unique per phase entry", () => {
    const m = validateManifest(
      writeExtension(tmpDir(), {
        ...base,
        name: "multi",
        phases: [
          { slot: "post-plan", instructions: "a.md" },
          { slot: "post-test", instructions: "b.md" },
          { slot: "post-test", instructions: "c.md" },
        ],
      }),
    );
    expect(phaseAgentNames(m)).toEqual([
      "openfleet-ext-multi-post-plan",
      "openfleet-ext-multi-post-test",
      "openfleet-ext-multi-post-test-2",
    ]);
  });
});

describe("toolsFor", () => {
  it("maps permissions to Copilot tool aliases", () => {
    expect(toolsFor(["read"])).toEqual(["read", "search"]);
    expect(toolsFor(["read", "write", "shell", "web"])).toEqual(["read", "search", "edit", "execute", "web"]);
  });
});

describe("settings", () => {
  it("resolves defaults and overrides, and rejects undeclared keys", () => {
    const m = validateManifest(publishFixture(tmpDir()));
    expect(resolveSettings(m, {})).toEqual({ label: "preview", workflow: "preview.yml" });
    expect(resolveSettings(m, { publish: { label: "snap" } })).toEqual({ label: "snap", workflow: "preview.yml" });
    expect(() => resolveSettings(m, { publish: { lable: "x" } })).toThrow(/does not declare setting "lable"/);
  });
});

describe("add / sync / remove", () => {
  it("generates per-entry agents, augments, skills, settings and the index", () => {
    const ws = workspace();
    const audit = writeExtension(
      tmpDir(),
      { ...base, name: "audit", ...phase("post-run"), commands: { report: "report.md" } },
      { "report.md": "# Report\nSummarise events.\n" },
    );
    const style = writeExtension(
      tmpDir(),
      { ...base, name: "style", augments: [{ role: "implementer", instructions: "tabs.md" }] },
      { "tabs.md": "Always use tabs.\n" },
    );
    addExtension(ws, audit, installedCoreVersion(ws)!);
    addExtension(ws, style, installedCoreVersion(ws)!);
    addExtension(ws, publishFixture(tmpDir()), installedCoreVersion(ws)!);
    writeJson(path.join(ws.dir, "extensions.config.json"), { publish: { label: "snap" } });
    syncExtensions(ws);

    expect(readLock(ws).extensions.map((e) => [e.name, e.sha, e.enabled])).toEqual([
      ["audit", "local", true],
      ["style", "local", true],
      ["publish", "local", true],
    ]);
    const agents = path.join(ws.core, "agents");
    const read = (f: string) => fs.readFileSync(path.join(agents, f), "utf8");

    const implementer = read("openfleet-implementer.agent.md");
    expect(implementer).toContain("## Extension: style");
    expect(implementer).toContain("Always use tabs.");
    expect(implementer).toContain("## Extension: publish");
    expect(implementer).toContain("Pin upstream preview versions");
    expect(implementer).toMatch(/### Settings[\s\S]*\| `label` \| snap \|/);
    expect(read("openfleet-tester.agent.md")).not.toContain("## Extension:");

    const publish = read("openfleet-ext-publish-post-test.agent.md");
    expect(publish).toMatch(/name: "openfleet-ext-publish-post-test"/);
    expect(publish).toContain('"execute"');
    expect(publish).not.toContain('"edit"');
    expect(publish).toContain("blocking: yes");
    expect(publish).toContain("`.changeset/config.json`");
    expect(publish).toContain("```openfleet-report");
    expect(publish).toMatch(/## Settings[\s\S]*\| `label` \| snap \| Label that triggers/);
    expect(publish).toMatch(/\| `workflow` \| preview.yml \|/);
    expect(publish).toContain("Commit, push, open a draft PR");

    expect(read("openfleet-ext-audit-post-run.agent.md")).toContain("Do the thing.");
    expect(read("openfleet-ext-audit.agent.md")).toContain("running one of its CLI commands");
    expect(fs.readFileSync(path.join(ws.core, "skills", "openfleet-ext-audit-report", "SKILL.md"), "utf8")).toContain(
      "Summarise events.",
    );
    expect(
      fs.readFileSync(path.join(ws.core, "skills", "openfleet-ext-publish-publish-status", "SKILL.md"), "utf8"),
    ).toMatch(/## Settings[\s\S]*snap/);

    const index = readCoreIndex(ws)!;
    expect(index.v).toBe(2);
    expect(index.slots["post-test"]).toEqual([
      {
        extension: "publish",
        agent: "openfleet:openfleet-ext-publish-post-test",
        blocking: true,
        when: { files: [".changeset/config.json"] },
        timeoutMinutes: 45,
      },
    ]);
    expect(index.slots["post-run"]).toEqual([
      { extension: "audit", agent: "openfleet:openfleet-ext-audit-post-run", blocking: false, timeoutMinutes: 30 },
    ]);
    expect(index.augments.implementer).toEqual(["style", "publish"]);
    expect(index.commands.report).toMatchObject({ extension: "audit", agent: "openfleet:openfleet-ext-audit" });
    expect(index.settings).toEqual({ publish: { label: "snap", workflow: "preview.yml" } });
    expect(findSlotEntry(index, "openfleet-ext-publish-post-test")).toMatchObject({
      extension: "publish",
      slot: "post-test",
    });

    writeJson(path.join(ws.dir, "extensions.config.json"), { publish: { nope: "x" } });
    expect(() => syncExtensions(ws)).toThrow(/does not declare setting "nope"/);
    writeJson(path.join(ws.dir, "extensions.config.json"), {});

    removeExtension(ws, "audit");
    syncExtensions(ws);
    expect(fs.existsSync(path.join(agents, "openfleet-ext-audit-post-run.agent.md"))).toBe(false);
    expect(fs.existsSync(path.join(agents, "openfleet-ext-audit.agent.md"))).toBe(false);
    expect(fs.existsSync(path.join(ws.core, "skills", "openfleet-ext-audit-report"))).toBe(false);
    expect(readCoreIndex(ws)!.commands.report).toBeUndefined();
  });

  it("installs from a git repo at a ref and pins the SHA", () => {
    const ws = workspace();
    const repo = writeExtension(tmpDir(), { ...base, name: "pinned", ...phase("pre-spec") });
    gitRepo(repo, {});
    const sha = sh(repo, "git", ["rev-parse", "HEAD"]).trim();
    sh(repo, "git", ["tag", "v1"]);
    const { entry } = addExtension(ws, `file://${repo}#v1`, "0.1.0");
    expect(entry.sha).toBe(sha);
    expect(fs.existsSync(path.join(ws.extensions, "pinned", ".git"))).toBe(false);
  });

  it("refuses incompatible extensions and disables them on update", () => {
    const ws = workspace();
    const ext = writeExtension(tmpDir(), { ...base, name: "old", ...phase("post-run"), core: "^0.1.0" });
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
