# OpenFleet

Coordinate **one change across many repos** with [GitHub Copilot CLI](https://github.com/github/copilot-cli).

Website: [openfleet.tools](https://openfleet.tools) · Repository: [github.com/yashicon21/openfleet](https://github.com/yashicon21/openfleet)

You describe the change once. A **coordinator** agent turns it into a spec with you, then runs a **planner → implementer → tester** pipeline for each repo (or monorepo package), in parallel, each in its own git worktree. Every agent action is recorded in an append-only event log.

OpenFleet is built from Copilot primitives (custom agents, subagents, hooks, skills). It is not a new agent runtime.

## How it differs from `/fleet`

|           | Copilot `/fleet`                                   | OpenFleet                                                         |
| --------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| Scope     | Parallel subagents inside **one** session and repo | One change across **many** repos and packages                     |
| Isolation | Shared working tree                                | One git worktree and branch per repo/package                      |
| Process   | Free-form                                          | Spec → plan → implement → test, with retries                      |
| Contracts | —                                                  | Shared contract fixtures in `contracts/`, contract tests per repo |
| Record    | Session transcript                                 | `events.jsonl` with attribution, patches and diff snapshots       |
| Resume    | Session resume                                     | Project state in `state.json`; `openfleet resume <name>`          |

## Quick start

Requirements: Node.js 20+, git, [Copilot CLI](https://github.com/github/copilot-cli) signed in, and optionally `gh` for draft PRs.

```sh
mkdir my-fleet && cd my-fleet
npm create @openfleet-tools@latest   # or: npx @openfleet-tools/create
npx openfleet new better-auth "Move every service to better-auth"
```

To try it on a toy example first, run `pnpm demo` from a checkout of this repo. See [examples/demo](examples/demo/README.md).

The coordinator then:

1. **Grills you** about the change, suggests repos from `openfleet/repos.json`, discovers build and test commands, and confirms them with you.
2. Writes `openfleet/projects/<name>/spec.md` (goal, repos, contracts, ordering, acceptance criteria, branches, completion mode). The grill ends with a spec summary and one question, "anything to change?". **Your answer starts the run; after that it is hands-off.**
3. Plans every repo or package at once (read-only planners), validates each plan against the spec, and checks that all plans agree with the spec's shared approach and with each other before anything is implemented (the `plans-ready` gate). Then, in dependency order, it optionally runs a baseline tester (tests for today's behaviour that must pass on the unchanged code, and that the implementer may only change where the spec allows), then an implementer and a tester. Each child gets its own port range so apps and e2e tests can run side by side. A failing test sends the findings to a new implementer, up to 3 retries. Then the coordinator reviews the findings and diff itself and makes one guided attempt; if that fails too, the child is marked `failed`, its dependents `blocked`, and the rest of the run continues.
4. Finishes in the completion mode you chose: changes **staged** in each worktree for your review (default), or **draft PRs** that link to each other.

Child questions go to the coordinator. It answers from the spec, or decides itself and logs an `assumption`. The run summary lists every assumption and every failed child (with findings and worktree paths); `npx openfleet resume <name>` lets you deal with failures later.

## Workspace

```
openfleet/
  core/                  # installed by the CLI; replaced by `update` (gitignored)
  extensions/            # instruction-only extensions (commit this)
  extensions.lock.json   # source + pinned SHA per extension (commit this)
  extensions.config.json # optional per-workspace extension settings (commit this)
  repos.json             # known repos/packages, build and test commands (commit this)
  projects/<name>/
    spec.md  state.json  events.jsonl  contracts/  plans/
    patches/<seq>.patch  # gitignored
    worktrees/<child>/   # gitignored
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
| `npx openfleet new <name> ["<request>"] [--ask]`    | Create a project and launch the coordinator                                              |
| `npx openfleet resume <name> [--fresh] [--ask]`     | Continue a project (`--fresh` starts a new Copilot session)                              |
| `npx openfleet status [name] [--json]`              | Children, phases, retries and open questions                                             |
| `npx openfleet list`                                | All projects                                                                             |
| `npx openfleet clean <name> [--branches] [--force]` | Remove the project's worktrees (and branches)                                            |
| `npx openfleet add <git-url[#ref]\|path>`           | Install or update an extension and print its permissions                                 |
| `npx openfleet remove <name>`                       | Uninstall an extension                                                                   |
| `npx openfleet extensions`                          | List installed extensions                                                                |
| `npx openfleet <ext-command> [--ask]`               | Run a command declared by an extension                                                   |

Arguments after `--` go to `copilot` unchanged, for example `npx openfleet new x -- --model claude-sonnet-5.5`.

### Permissions

OpenFleet launches Copilot in interactive mode so you can answer the grill questions. After the grill the coordinator keeps working without asking you anything. By default:

- **Tools are auto-approved** (`--allow-all-tools`), so you are not asked to approve every edit or shell command.
- **File access stays limited.** Path verification stays on. OpenFleet adds `--add-dir` for the workspace, the project's `worktrees/`, cloned repos in `openfleet/repos/` and every local repo in `repos.json`. Access to any other path still prompts.
- **URL access still prompts** (OpenFleet does not pass `--allow-all-urls`).

Pass `--ask` to `new`, `resume` or an extension command to get Copilot's normal per-tool prompts. To allow everything, pass Copilot's own flag: `npx openfleet resume x -- --yolo`.

`new`, `resume` and `status` warn when another active project touches the same repo.

The agents also use the helper commands `state`, `event`, `worktree`, `next`, `gate`, `baseline` and `ext`. See `npx openfleet help`.

## Events

Each project has an append-only `events.jsonl`. Hooks capture subagent starts and stops, file changes (with full patches) and a git diff snapshot of each worktree when an agent stops. The coordinator logs messages, questions, plans, test runs, contract changes, the assumptions it made on its own (`assumption`) and failed children (`child.failed`). Secrets are redacted.

See [docs/events.md](docs/events.md) for the schema.

## Extensions

Extensions are **instruction-only**: a folder with `openfleet.extension.json` and Markdown, and no executable code. An extension (manifest v2) can run agents at phase slots (`pre-spec`, `post-plan`, `post-test`, `post-run`), augment a role's instructions, and add CLI commands. Phase entries can be blocking, can run only when certain files exist, and can report outputs (such as a published version or a PR URL) that OpenFleet injects into dependent repos' prompts. Settings can be overridden per workspace in `openfleet/extensions.config.json`. Write and shell access must be declared, and the generated agent's tool allow-list enforces it.

See [docs/extensions.md](docs/extensions.md).

## Development

```sh
pnpm install
pnpm test        # builds, then runs vitest
pnpm typecheck
pnpm lint        # ESLint (typescript-eslint, type-aware)
pnpm format      # Prettier; `pnpm format:check` is what CI runs
```

`pnpm install` sets up [husky](https://typicode.github.io/husky/) git hooks. On commit, [lint-staged](https://github.com/lint-staged/lint-staged) runs `eslint --fix` and Prettier on the staged files, and [commitlint](https://commitlint.js.org/) checks the message. Use [Conventional Commits](https://www.conventionalcommits.org/) with a sentence-case subject and a header of at most 72 characters, for example `feat: Add draft PR support`. Set `HUSKY=0` to skip the hooks.

Packages:

- `packages/cli` is `@openfleet-tools/cli`: the `openfleet` binary, plus `core/` (Copilot plugin: agents, skills, hooks).
- `packages/create` is `@openfleet-tools/create`: the `npm create @openfleet-tools` initializer.

To try a local build, run `node packages/create/dist/index.js ../my-fleet --cli file:$PWD/packages/cli`. Set `OPENFLEET_COPILOT_BIN` to use a different `copilot` binary.

Design notes are in [docs/design.md](docs/design.md), and the flow is in [docs/flow.mmd](docs/flow.mmd).

The website ([openfleet.tools](https://openfleet.tools)) is a single static page in `site/index.html`, with no build step. Pushes to `main` that touch `site/` deploy it to GitHub Pages through [`pages.yml`](.github/workflows/pages.yml).

## Releasing

Releases use [Changesets](https://changesets.dev). `@openfleet-tools/cli` and `@openfleet-tools/create` are a `fixed` group, so they always share a version. `@openfleet-tools/create` installs `@openfleet-tools/cli@^<its own version>` by default.

1. In a PR that changes a package, run `pnpm changeset` and commit the generated file. CI warns (without failing) when a PR has no changeset; use `pnpm changeset --empty` for changes that need no release.
2. On every push to `main`, [`release.yml`](.github/workflows/release.yml) opens or updates a **Version Packages** PR that bumps the versions and writes the `CHANGELOG.md` files.
3. Merging that PR publishes both packages to npm with [Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC, provenance, no `NPM_TOKEN`) and creates GitHub Releases.

### One-time setup

Trusted publishing can only be configured for a package that already exists on npm. So each package needs one manual placeholder publish at `0.0.0` before the first CI release. The repo is at `0.0.0` with an initial `minor` changeset, so the first Version Packages PR releases `0.1.0`.

1. Publish placeholders from an empty directory, signed in with `npm login` as a member of the `openfleet-tools` npm org:

   ```sh
   cd "$(mktemp -d)"
   for name in @openfleet-tools/cli @openfleet-tools/create; do
     printf '{"name":"%s","version":"0.0.0","description":"Placeholder. See https://openfleet.tools","repository":{"type":"git","url":"git+https://github.com/yashicon21/openfleet.git"}}\n' "$name" > package.json
     npm publish --access public
   done
   ```

2. For **each** package on npmjs.com, go to **Settings → Trusted publishing → GitHub Actions** and enter:
   - Organization or user: `yashicon21`
   - Repository: `openfleet`
   - Workflow filename: `release.yml`
   - Environment: leave empty

   A new trusted publisher must complete a publish within 2 days, or it expires and must be recreated. So configure it just before you merge the first Version Packages PR.

3. Optional, recommended: in each package's **Settings → Publishing access**, choose **Require two-factor authentication and disallow tokens**.
4. In the GitHub repo, under **Settings → Actions → General**, enable **Allow GitHub Actions to create and approve pull requests**.
5. The initializer used to be published as `create-openfleet`. Deprecate it so users are pointed to the new name:

   ```sh
   npm deprecate create-openfleet "Renamed to @openfleet-tools/create — use: npm create @openfleet-tools"
   ```

`pnpm release` builds and runs `changeset publish` for a manual local publish. CI does not use it.

## License

[MIT](LICENSE)
