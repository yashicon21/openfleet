#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

type PM = "pnpm" | "yarn" | "bun" | "npm";

export function ownVersion(): string {
  const pkg = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  return (JSON.parse(fs.readFileSync(pkg, "utf8")) as { version: string }).version;
}

export function detectPackageManager(dir: string, userAgent = process.env.npm_config_user_agent ?? ""): PM {
  for (const [file, pm] of [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lockb", "bun"],
    ["bun.lock", "bun"],
    ["package-lock.json", "npm"],
  ] as const) {
    if (fs.existsSync(path.join(dir, file))) return pm;
  }
  const agent = userAgent.split("/")[0];
  return agent === "pnpm" || agent === "yarn" || agent === "bun" ? agent : "npm";
}

export function installArgs(pm: PM, spec: string): string[] {
  return pm === "npm" ? ["install", "--save-dev", spec] : ["add", "-D", spec];
}

export function ensurePackageJson(dir: string): boolean {
  const file = path.join(dir, "package.json");
  if (fs.existsSync(file)) return false;
  const name = path.basename(dir).toLowerCase().replace(/[^a-z0-9-._~]/g, "-") || "openfleet-workspace";
  fs.writeFileSync(file, JSON.stringify({ name, private: true }, null, 2) + "\n");
  return true;
}

const HELP = `create-openfleet — set up an OpenFleet workspace

Usage: npm create openfleet@latest [dir] [-- --cli <spec>] [--skip-install]

  dir              Target directory (default: current directory)
  --cli <spec>     @openfleet/cli version or spec to install (default: ^${ownVersion()})
  --skip-install   Do not install @openfleet/cli or run \`openfleet init\`
`;

export function main(argv = process.argv.slice(2)): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { cli: { type: "string" }, "skip-install": { type: "boolean" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const dir = path.resolve(positionals[0] ?? ".");
  fs.mkdirSync(dir, { recursive: true });
  if (ensurePackageJson(dir)) process.stdout.write(`Created ${path.join(dir, "package.json")}\n`);
  if (values["skip-install"]) {
    process.stdout.write("Skipped install. Run `npm i -D @openfleet/cli && npx openfleet init` when ready.\n");
    return 0;
  }
  const raw = values.cli ?? `^${ownVersion()}`;
  const spec = /^(file:|link:|https?:|git\+|@openfleet\/cli)/.test(raw) ? raw : `@openfleet/cli@${raw}`;
  const pm = detectPackageManager(dir);
  process.stdout.write(`Installing ${spec} with ${pm}…\n`);
  const install = spawnSync(pm, installArgs(pm, spec), { cwd: dir, stdio: "inherit", shell: process.platform === "win32" });
  if (install.status !== 0) {
    process.stderr.write(`create-openfleet: ${pm} install failed.\n`);
    return install.status ?? 1;
  }
  const bin = path.join(dir, "node_modules", ".bin", process.platform === "win32" ? "openfleet.cmd" : "openfleet");
  try {
    execFileSync(bin, ["init"], { cwd: dir, stdio: "inherit", shell: process.platform === "win32" });
  } catch {
    return 1;
  }
  return 0;
}

const invoked = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    process.exitCode = main();
  } catch (err) {
    process.stderr.write(`create-openfleet: ${(err as Error).message}\n`);
    process.exitCode = 1;
  }
}
