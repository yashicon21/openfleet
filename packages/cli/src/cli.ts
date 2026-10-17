import { parseArgs } from "node:util";
import { packageVersion } from "./core.js";
import { cmdAdd, cmdExtensions, cmdRemove, runExtensionCommand } from "./commands/extensions.js";
import { cmdEvent, cmdState, cmdWorktree } from "./commands/internal.js";
import { out } from "./commands/output.js";
import { cmdClean, cmdList, cmdNew, cmdResume, cmdStatus } from "./commands/project.js";
import { cmdInit, cmdUpdate } from "./commands/workspace.js";
import { UserError } from "./workspace.js";

export const HELP = `openfleet — coordinate one change across many repos with GitHub Copilot CLI

Usage: npx openfleet <command> [options] [-- <copilot args>]

Workspace
  init                         Create openfleet/ in the current directory and install core
  update                       Replace openfleet/core with this CLI version and re-sync extensions

Projects
  new <name> ["<request>"] [--ask]
                               Create a project and launch the coordinator
  resume <name> [--fresh] [--ask]
                               Continue a project (--fresh starts a new Copilot session)
  status [name] [--json]       Show a project's children, phases and open questions
  list                         List projects
  clean <name> [--branches] [--force]
                               Remove the project's worktrees (and branches)

Extensions
  add <git-url[#ref]|path>     Install or update an extension
  remove <name>                Uninstall an extension
  extensions                   List installed extensions

Agent helpers (used by OpenFleet agents)
  state <project> [--patch <json>] [--actor <a>]
  event <project> --type <t> [--actor <a>] [--target <child>] [--payload <json>] [--patch-file <f>]
  worktree <project> <child> --repo <key> --branch <b> [--package <p>] [--base <ref>]

  help, version
Sessions auto-approve tool use (\`--allow-all-tools\`). File access stays limited to the workspace,
its worktrees and known repos, and URL access still prompts. Pass \`--ask\` to \`new\`, \`resume\` or an
extension command to be prompted for every tool instead.
Arguments after \`--\` are passed to copilot unchanged (e.g. \`-- --yolo\`).
`;

function splitPassthrough(argv: string[]): [string[], string[]] {
  const i = argv.indexOf("--");
  return i < 0 ? [argv, []] : [argv.slice(0, i), argv.slice(i + 1)];
}

function parse<T extends Record<string, { type: "string" | "boolean"; short?: string }>>(args: string[], options: T) {
  return parseArgs({ args, options, allowPositionals: true, strict: true });
}

export function run(argv: string[]): number {
  const [args, passthrough] = splitPassthrough(argv);
  const [command, ...rest] = args;
  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      out(HELP);
      return 0;
    case "version":
    case "--version":
    case "-v":
      out(packageVersion());
      return 0;
    case "init":
      return cmdInit();
    case "update":
      return cmdUpdate();
    case "new": {
      const { values, positionals } = parse(rest, { ask: { type: "boolean" } });
      return cmdNew(positionals, passthrough, { ask: values.ask });
    }
    case "resume": {
      const { values, positionals } = parse(rest, { fresh: { type: "boolean" }, ask: { type: "boolean" } });
      return cmdResume(positionals, passthrough, { fresh: values.fresh, ask: values.ask });
    }
    case "status": {
      const { values, positionals } = parse(rest, { json: { type: "boolean" } });
      return cmdStatus(positionals, { json: values.json });
    }
    case "list":
      return cmdList();
    case "clean": {
      const { values, positionals } = parse(rest, { branches: { type: "boolean" }, force: { type: "boolean" } });
      return cmdClean(positionals, values);
    }
    case "add":
      return cmdAdd(parse(rest, {}).positionals);
    case "remove":
      return cmdRemove(parse(rest, {}).positionals);
    case "extensions":
      return cmdExtensions();
    case "state": {
      const { values, positionals } = parse(rest, { patch: { type: "string" }, actor: { type: "string" } });
      return cmdState(positionals, values);
    }
    case "event": {
      const { values, positionals } = parse(rest, {
        type: { type: "string" },
        actor: { type: "string" },
        target: { type: "string" },
        payload: { type: "string" },
        "patch-file": { type: "string" },
      });
      return cmdEvent(positionals, values);
    }
    case "worktree": {
      const { values, positionals } = parse(rest, {
        repo: { type: "string" },
        branch: { type: "string" },
        package: { type: "string" },
        base: { type: "string" },
      });
      return cmdWorktree(positionals, values);
    }
    default: {
      const ask = rest.includes("--ask");
      const code = runExtensionCommand(command, rest.filter((a) => a !== "--ask"), passthrough, { ask });
      if (code === undefined) throw new UserError(`Unknown command "${command}". Run \`npx openfleet help\`.`);
      return code;
    }
  }
}

export function main(argv = process.argv.slice(2)): void {
  try {
    process.exitCode = run(argv);
  } catch (err) {
    const isUser = err instanceof UserError || (err as { code?: string }).code?.startsWith("ERR_PARSE_ARGS");
    process.stderr.write(`openfleet: ${isUser ? (err as Error).message : (err as Error).stack ?? String(err)}\n`);
    process.exitCode = 1;
  }
}
