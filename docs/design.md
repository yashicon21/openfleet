# OpenFleet — Design Decisions (grill sessions 2026-10-13/14)

## Positioning

- Open-source (MIT) framework that coordinates one change across many repos using GitHub Copilot CLI. Claude Code support later.
- Layers on existing Copilot primitives (custom agents, subagents, hooks, write_agent). Not a new runtime.
- README contrasts with built-in `/fleet` (cross-repo vs in-session).

## Terminology

- **Project** = a unit of work the user wants done (e.g. "refactor auth to use better-auth").
- **Repo / package** = code target touched by a project (a repo, or a package inside a monorepo).
- **Extension** = instruction-only add-on.

## Distribution & CLI

- npm name `openfleet` is taken → scoped `@openfleet-tools/create` (init, `npm create @openfleet-tools`) + `@openfleet-tools/cli`; npm org `@openfleet-tools` (matches https://openfleet.tools). After init, `npx openfleet …` resolves to the local install.
- Commands (v1): `init`, `update`, `new <name>`, `resume <name>`, `status [name]`, `list`, `clean <name>` (worktrees, optional branches), `add <git-url|path>`, `remove <ext>`, plus extension-declared commands.
- CLI launches Copilot itself (`copilot --agent openfleet-coordinator` + plugin dir = `openfleet/core`). No global install. Same wrapper later launches `claude`.
- Launch permissions: interactive (not `--autopilot`), `--allow-all-tools`; path verification stays on with `--add-dir` for the workspace root, the project's `worktrees/`, `openfleet/repos/` and the local repos in `repos.json`; URLs still prompt (no `--allow-all-urls`). `--ask` on `new`/`resume`/extension commands keeps per-tool prompts; args after `--` (e.g. `--yolo`) pass through.

## Workspace layout (`npm create @openfleet-tools` in any cwd)

```
openfleet/
  core/                 # installed app, fully replaced by `update`; users never edit (gitignored)
  extensions/           # instruction-only extensions (committed)
  extensions.lock.json  # git URL + SHA per extension (committed)
  repos.json            # known repos/packages + confirmed build/test cmds (committed)
  projects/<name>/      # committed except worktrees/ and patches/
    spec.md
    state.json
    contracts/
    events.jsonl
    patches/<seq>.patch # gitignored
    worktrees/<repo>/   # gitignored
```

- Repos may live anywhere (path or git URL to clone); init cwd = default search root for the grill.

## Core contents

- Agents: `openfleet-coordinator`, `openfleet-planner`, `openfleet-implementer`, `openfleet-tester` (planner/tester read-only on source).
- Skills, hooks (Node scripts), per-host adapter → normalized event schema, event capture/writer.

## Flow

1. `npx openfleet new <name>` → coordinator grill session (suggests repos from `repos.json`, auto-discovers build/test cmds, confirms with user, adds new repos to `repos.json`).
2. Output `projects/<name>/spec.md`: goal, repos/packages, cross-repo contracts, ordering deps, per-repo acceptance criteria, build/test cmds, branch names (asked; default `openfleet/<slug>[-<pkg>]`), completion mode, out-of-scope.
3. User input happens only in the grill. Its last question shows the spec summary and asks "anything to change?"; the answer ends the grill (changes applied, `spec.approved`, `status: running`). After that the run is fully hands-off until `done`.
4. Per repo/package: planner → coordinator auto-validates plan vs spec (bounces on mismatch) → implementer → tester.
5. Parallel by default; honour ordering deps. No concurrency cap.
6. Tester failure → new implementer with findings, max 3 retries → coordinator reviews findings + diff, writes guidance, spawns one more implementer → if that fails, child `failed` (`child.failed` event), dependents `blocked`, other children continue. Final summary reports failures; user handles them later via `resume`.
7. Child questions → coordinator (write_agent/read_agent) → answers from spec, otherwise decides itself and logs an `assumption` event (listed in the final summary); contract changes broadcast to affected children. The coordinator never ends its turn while children are pending or running.
8. Completion mode chosen in grill: default staged changes for review; optional draft PRs cross-linked with run summary.

- Monorepo: one worktree + branch + PR per package.
- Multiple projects may be active concurrently, even on same repo; CLI warns on overlap.

## Testing

- v1 contract tests only. Coordinator writes shared fixtures to `contracts/`; planners include contract tests; implementers write; testers verify existence + pass.

## State & resume

- `state.json`: per child phase, worktree, branch, agent ids, open questions. Updated on every child event; `resume` continues from it.

## Events / audit (core, always on)

- `events.jsonl` append-only, `v: 1`: `ts, seq (global, file-locked), actor (coordinator | <repo>/<role> | ext:<name>), type, target, payload`.
- Types: agent.spawned/stopped, message.sent, file.added/edited/deleted (path + kind + lines ±), phase.changed, question.asked, test.run, …
- Full patches in `patches/<seq>.patch`; messages logged in full with secret redaction.
- Capture: hooks (`subagentStart/Stop`, `postToolUse`; attribution cwd→worktree→repo, role via agentName/state.json) + git diff snapshot per worktree on agent stop (ground truth) + coordinator logs messages.
- Hooks no-op unless cwd is under an OpenFleet workspace.
- No viewer in v1; schema documented/versioned for future viewer/animation.

## Extensions (instruction-only)

- Folder with `openfleet.extension.json` + Markdown skills/agent instructions. No executable scripts.
- Manifest v2 (`"manifest": 2`; v1 `mode`/`slot`/`role` manifests are rejected with the v2 equivalent in the error): `core` semver range; `phases: [{slot, instructions, blocking?=false, when?: {files}, timeoutMinutes?=30}]` (slot `pre-spec|post-plan|post-test|post-run`, each entry runs as its own agent `openfleet-ext-<name>-<slot>`); `augments: [{role, instructions}]` (appended to the role's prompt); at least one phase or augment entry. Top-level `commands: {name: skill.md}` (CLI launches Copilot with that skill) and `permissions` (default read-only; write/shell must be declared, enforced via one tool allow-list for all of the extension's phase agents; augments use the role's own tools).
- Blocking phases (`post-plan`/`post-test` only): a failure or timeout gets one retry with a fresh agent, then `extension.failed`, the child is `failed` and its dependents `blocked`. A child is `done` only after its `post-test` entries finish, so dependents wait for blocking post-test work. Advisory phases never block.
- `when.files`: `npx openfleet ext plan` checks the paths in the child's package dir and repo root; no match → the entry is skipped and `extension.skipped` is logged.
- Outputs: a phase report may include flat string `outputs` and `followUps`. `npx openfleet ext result` stores them in `state.json` (`children[id].outputs[ext]`, `followUps`) and logs `extension.outputs`. The `subagentStart` hook injects an "Upstream outputs" table into the planner/implementer/tester prompts of every child that depends on it, directly or transitively. An output `prUrl` sets the child's `prUrl`; finalize then commits, pushes to the same branch and updates that PR (also in `staged` mode) instead of opening a second one. Follow-ups are listed in `summary.md`, PR bodies and the final report.
- Settings: the manifest declares `settings: {key: {default, description}}`; the workspace overrides them in `openfleet/extensions.config.json` (`{ext: {key: value}}`, undeclared keys rejected). Core injects a `## Settings` table into the extension's phase agents, augment sections and command skills.
- Install from git URL or local path; `add` pins SHA in lock file and prints declared permissions. Same-slot ordering = lock order, then manifest order.
- `update` disables incompatible extensions (core semver range) with a warning.
- Planned official extensions:
  - **audit**: post-run summary / replay narrative over `events.jsonl`.
  - **pattern-extractor**: post-run phase detecting duplicated code across changed repos → suggests shared npm package (report); optional "make it a project" feeds into `new`.

## Known facts (research)

- Copilot CLI hooks via plugin `hooks.json`; tool hooks lack agent id; built-in `general-purpose` agent emits no subagent hooks (→ custom agents). Nested subagents (depth 4, 32 concurrent default); `write_agent` multi-turn supported.
- Claude Code tool hooks include `agent_id`/`agent_type`; plugin hooks supported.
- Copilot namespaces plugin agents as `<plugin>:<agent>` (e.g. `openfleet:openfleet-coordinator`) in `--agent`, the task tool's `agent_type`, and hook `agentName`. `${PLUGIN_ROOT}` and the launcher's env vars are available to plugin hooks (verified with Copilot CLI 1.0.95).
