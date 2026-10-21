# @openfleet-tools/cli

Coordinate **one change across many repos** with [GitHub Copilot CLI](https://github.com/github/copilot-cli).

You describe the change once. A **coordinator** agent turns it into a spec with you, then runs a **planner → implementer → tester** pipeline for each repo, monorepo package or path-scoped unit (such as one page of an app), in parallel, each in its own git worktree. A repo with several children gets its own **repo coordinator**, which merges them into one integration branch and one PR. Every agent action is recorded in an append-only event log.

OpenFleet is built from Copilot primitives (custom agents, subagents, hooks, skills). It is not a new agent runtime.

- Website: https://openfleet.tools
- Repository: https://github.com/yashicon21/openfleet
- Docs: [design](https://github.com/yashicon21/openfleet/blob/main/docs/design.md) · [events](https://github.com/yashicon21/openfleet/blob/main/docs/events.md) · [extensions](https://github.com/yashicon21/openfleet/blob/main/docs/extensions.md)

This package provides the `openfleet` command and the Copilot plugin it installs (agents, skills and hooks). Create a workspace with [`@openfleet-tools/create`](https://www.npmjs.com/package/@openfleet-tools/create) rather than installing it directly.

## Workflow at a glance

1. **Grill.** `npx openfleet new <name> "<request>"` starts the coordinator. It asks you questions and writes `spec.md` (repos and children, contracts, shared approach, baselines, branches, parallelism, completion mode). Your answer to the final "anything to change?" question starts the run. Everything after that is hands-off.
2. **Plan.** Every child's planner runs at once. The coordinator validates each plan against the spec.
3. **Gate.** All plans are checked against the spec's shared approach and against each other (per repo, then across repos). Then `plans-ready` extensions run.
4. **Baseline** (optional, per child). Tests for today's behaviour are written and pass on the unchanged code.
5. **Implement → test.** These run in `dependsOn` order, with at most `maxParallel` agents working across the workspace, and failures are retried.
6. **Integrate.** A repo with several children merges them into its integration branch and runs the full build and tests there.
7. **Finalize.** Changes are staged in each worktree, or opened as cross-linked draft PRs. `summary.md` lists assumptions, failures and follow-ups.

See the [flow diagram](https://github.com/yashicon21/openfleet/blob/main/docs/flow.png) for the details.

## Quick start

Requirements: Node.js 20+, git, [Copilot CLI](https://github.com/github/copilot-cli) signed in, and optionally `gh` for draft PRs.

```sh
mkdir my-fleet && cd my-fleet
npm create @openfleet-tools@latest   # or: npx @openfleet-tools/create
npx openfleet new better-auth "Move every service to better-auth"
```

To try it on a toy example first, run `pnpm demo` from a checkout of this repo. See [examples/demo](https://github.com/yashicon21/openfleet/blob/main/examples/demo/README.md).

The coordinator then:

1. **Grills you** about the change, suggests repos from `openfleet/repos.json`, discovers build and test commands, and confirms them with you.
2. Writes `openfleet/projects/<name>/spec.md` (goal, repos, contracts, ordering, acceptance criteria, branches, completion mode). The grill ends with a spec summary and one question, "anything to change?". **Your answer starts the run; after that it is hands-off.**
3. Plans every child at once (read-only planners), validates each plan against the spec, and checks that all plans agree with the spec's shared approach and with each other before anything is implemented (the `plans-ready` gate). Then, in dependency order and with at most `maxParallel` agents working at a time across the workspace (a workspace setting, default 6), it optionally runs a baseline tester (tests for today's behaviour that must pass on the unchanged code, and that the implementer may only change where the spec allows), then an implementer and a tester. Each child gets its own port range so apps and e2e tests can run side by side. A failing test sends the findings to a new implementer, up to 3 retries. Then the coordinator reviews the findings and diff itself and makes one guided attempt; if that fails too, the child is marked `failed`, its dependents `blocked`, and the rest of the run continues.
4. Finishes in the completion mode you chose: changes **staged** in each worktree for your review (default), or **draft PRs** that link to each other.

Child questions go to the coordinator. It answers from the spec, or decides itself and logs an `assumption`. The run summary lists every assumption and every failed child (with findings and worktree paths); `npx openfleet resume <name>` lets you deal with failures later.

### Children, scoped children and repo coordinators

A **child** is one pipeline. Its id is one of:

- `api`: a whole repo;
- `web:ui`: a monorepo package;
- `web/settings` or `web:ui/button`: a **path-scoped** unit that owns `paths` globs such as `app/settings/**`.

During the grill the coordinator can look for units (pages, modules or services; for a Next.js app, the routes under `app/**/page.tsx` or `pages/**`). It proposes one child per unit and lets you group or skip them. For each repo with scoped children it also adds a `<repo>/setup` child for shared config, components and utils. Every scoped child depends on it and must not add shared items itself. A tester fails a scoped child whose diff touches files outside its paths (`npx openfleet scope <project> <child> --check`).

A repo with more than one child is run by its own **repo coordinator** (`openfleet-repo-coordinator`), a subagent of the top coordinator. It:

- runs the repo's pipelines and answers their questions;
- checks their plans against each other;
- merges each finished child into the integration branch, `openfleet/<project>` by default (the setup child first, then the others in the order they finish);
- runs the repo's full build and tests there;
- reports one result.

When a merge conflicts, it rebases the child onto the integration branch and has that child's implementer resolve the conflict. A question that changes a cross-repo contract or the shared approach is escalated to the top coordinator, and only those children wait. The repo gets one PR, from its integration branch. Single-child repos run directly under the top coordinator.

Every spawn first takes a slot with `npx openfleet claim`. It allows at most `maxParallel` working agents across the workspace (`npx openfleet config set maxParallel <n>`; the grill shows the current value and offers to change it) and keeps attribution exact when several coordinators spawn agents at once.

## Workspace

```
openfleet/
  core/                  # installed by the CLI; replaced by `update` (gitignored)
  extensions/            # instruction-only extensions (commit this)
  extensions.lock.json   # source + pinned SHA per extension (commit this)
  extensions.config.json # optional per-workspace extension settings (commit this)
  config.json            # workspace settings, e.g. { "maxParallel": 6 } (commit this)
  repos.json             # known repos/packages, build and test commands (commit this)
  projects/<name>/
    spec.md  state.json  events.jsonl  contracts/  plans/
    patches/<seq>.patch  # gitignored
    worktrees/<child>/   # gitignored; one per child (web:ui/button → web__ui__button),
                         # plus one integration worktree per repo with several children
```

Repos can live anywhere: give a `path` (relative to the workspace root) or a `url`, which is cloned into `openfleet/repos/<key>`.

`e2e` and `env` (names of required env vars and credentials, never values) are recorded by the grill. `copyFiles` lists git-ignored local files (for example `.env.local`) that are copied from the repo's checkout into every worktree. They are never staged or committed, and their values are redacted from the event log.

```json
{
  "v": 1,
  "repos": {
    "api": { "path": "../api", "defaultBranch": "main", "build": "pnpm build", "test": "pnpm test", "confirmed": true },
    "app": {
      "path": "../app",
      "test": "pnpm test",
      "e2e": "pnpm test:e2e",
      "env": ["AUTH_CLIENT_ID", "AUTH_CLIENT_SECRET"],
      "copyFiles": [".env.local"]
    },
    "web": {
      "url": "git@github.com:acme/web.git",
      "packages": { "ui": { "path": "packages/ui", "test": "pnpm -F ui test" } }
    }
  }
}
```

## Commands

| Command                                             | What it does                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `npx openfleet init`                                | Create `openfleet/` in the current directory and install core                            |
| `npx openfleet update`                              | Replace `openfleet/core` with the installed CLI version; disable incompatible extensions |
| `npx openfleet config`                              | Show workspace settings (`openfleet/config.json`)                                        |
| `npx openfleet config set maxParallel <n>`          | Cap working agents across all projects (default 6)                                       |
| `npx openfleet new <name> ["<request>"] [--ask]`    | Create a project and launch the coordinator                                              |
| `npx openfleet resume <name> [--fresh] [--ask]`     | Continue a project in its Copilot session (`--fresh`, or a missing session: a new one)   |
| `npx openfleet status [name] [--json]`              | Children grouped by repo, phases, retries and open questions                             |
| `npx openfleet list`                                | All projects                                                                             |
| `npx openfleet clean <name> [--branches] [--force]` | Remove the project's child and integration worktrees (and branches)                      |
| `npx openfleet add <git-url[#ref]\|path>`           | Install or update an extension and print its permissions                                 |
| `npx openfleet remove <name>`                       | Uninstall an extension                                                                   |
| `npx openfleet extensions`                          | List installed extensions                                                                |
| `npx openfleet ext settings [--unset]`              | List extension settings (`--unset`: only those without a workspace value)                |
| `npx openfleet ext settings set <ext> <key> <val>`  | Set a workspace-level extension setting in `openfleet/extensions.config.json`            |
| `npx openfleet <ext-command> [--ask]`               | Run a command declared by an extension                                                   |

Arguments after `--` go to `copilot` unchanged, for example `npx openfleet new x -- --model claude-sonnet-5.5`.

### Permissions

OpenFleet launches Copilot in interactive mode so you can answer the grill questions. After the grill the coordinator keeps working without asking you anything. By default:

- **Tools are auto-approved** (`--allow-all-tools`), so you are not asked to approve every edit or shell command.
- **File access stays limited.** Path verification stays on. OpenFleet adds `--add-dir` for the workspace, the project's `worktrees/`, cloned repos in `openfleet/repos/` and every local repo in `repos.json`. Access to any other path still prompts.
- **URL access still prompts** (OpenFleet does not pass `--allow-all-urls`).

Pass `--ask` to `new`, `resume` or an extension command to get Copilot's normal per-tool prompts. To allow everything, pass Copilot's own flag: `npx openfleet resume x -- --yolo`.

`new`, `resume` and `status` warn when another active project touches the same repo.

The agents also use the helper commands `state`, `event`, `worktree`, `preflight`, `next`, `gate`, `baseline`, `claim`, `ack`, `scope`, `merge`, `escalate` and `ext plan|result|fail`. See `npx openfleet help`.

## Troubleshooting

### Sandbox

OpenFleet creates a git worktree per child, so git must be able to write inside each repo's `.git` directory (ref locks, `.git/worktrees/`). A sandbox can block these writes with `EPERM` ("Operation not permitted"), for example `fatal: cannot lock ref … Operation not permitted`. Copilot's `--add-dir` only affects path verification; it does not lift a sandbox.

- **Before launching**, `new`, `resume` and extension commands probe these writes from the OpenFleet process itself. If they are denied there, the sandbox is inherited from the shell that started OpenFleet and nothing inside Copilot can fix it, so OpenFleet stops before starting the session. If Copilot's command sandbox looks enabled (`--sandbox`, or `sandbox.enabled` in `~/.copilot/settings.json` or `.github/copilot/settings*.json`), it prints a warning; managed policies cannot be detected, so the in-session check below covers them.
- **In the session**, `npx openfleet preflight <project>` runs the same checks before the spec is approved, at the start of the run and first after `resume`. While it fails, the spec cannot be approved and nothing is spawned.

Likely causes of `EPERM`, in order:

1. **OpenFleet or Copilot was started from a sandboxed shell**, such as an IDE or app-embedded terminal or an agent's shell. The whole process tree is sandboxed. Start `npx openfleet` from a normal terminal.
2. **Copilot's command sandbox is on.** Run `/sandbox disable`, start without `--sandbox` (or pass `-- --no-sandbox`), or add the repo paths to `sandbox.userPolicy.filesystem.readwritePaths` in `~/.copilot/settings.json`. The sandbox may still protect `.git`.
3. **A managed OS policy** on the device. Ask your administrator.

macOS Full Disk Access does not fix this. `EACCES` ("Permission denied") is a plain file-permissions problem: check the owner and mode of the path.

## Events

Each project has an append-only `events.jsonl`. Hooks capture subagent starts and stops, file changes (with full patches) and a git diff snapshot of each worktree when an agent stops. The coordinator logs messages, questions, plans, test runs, contract changes, the assumptions it made on its own (`assumption`), failed children (`child.failed`), plan-gate results, baselines, extension results, escalated questions (`question.escalated`) and merges into integration branches (`child.merged`, `merge.conflict`). Secrets are redacted.

See [docs/events.md](https://github.com/yashicon21/openfleet/blob/main/docs/events.md) for the schema.

## Extensions

Extensions are **instruction-only**: a folder with `openfleet.extension.json` and Markdown, and no executable code. An extension (manifest v2) can run agents at phase slots (`pre-spec`, `post-plan`, `plans-ready`, `pre-implement`, `post-test`, `post-run`), augment a role's instructions (`coordinator`, `repo-coordinator`, `planner`, `baseline`, `implementer` or `tester`), and add CLI commands. Phase entries can be blocking, can run only when certain files exist, and can report outputs (such as a published version or a PR URL) that OpenFleet injects into dependent repos' prompts. Settings are workspace-level: they live in `openfleet/extensions.config.json`, you set them with `npx openfleet ext settings set`, and the grill asks you about any setting that has no value yet. Write and shell access must be declared, and the generated agent's tool allow-list enforces it.

See [docs/extensions.md](https://github.com/yashicon21/openfleet/blob/main/docs/extensions.md).

## License

[MIT](https://github.com/yashicon21/openfleet/blob/main/LICENSE)
