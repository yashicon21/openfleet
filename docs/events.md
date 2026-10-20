# Event log schema (v1)

Each project records an append-only log at `openfleet/projects/<name>/events.jsonl`, one JSON object per line. Do not edit the file by hand. Writers append under a file lock (`.events.lock`), so `seq` is unique and increases within a project.

```json
{
  "v": 1,
  "ts": "2026-10-14T06:50:36.956Z",
  "seq": 7,
  "actor": "api/implementer",
  "type": "file.edited",
  "target": "api",
  "payload": {
    "path": "src/a.ts",
    "kind": "edited",
    "lines": { "added": 2, "removed": 1 },
    "tool": "edit",
    "patch": "patches/7.patch"
  }
}
```

| Field     | Type            | Meaning                                                                                                                                                                 |
| --------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v`       | `1`             | Schema version. Breaking changes increment it.                                                                                                                          |
| `ts`      | ISO 8601 string | When the action happened (the hook timestamp when there is one).                                                                                                        |
| `seq`     | integer         | Unique within the project, increasing from 1. Use it for ordering, because `ts` can tie.                                                                                |
| `actor`   | string          | Who acted: `coordinator`, `<child>/<role>` (e.g. `api/implementer`, `web:ui/tester`), `ext:<name>`, `cli` or `user`. An unattributed child appears as `unknown/<role>`. |
| `type`    | string          | One of the types below. Consumers must ignore unknown types.                                                                                                            |
| `target`  | string \| null  | The child id the event is about (`<repo>` or `<repo>:<package>`), or `null` for project-level events.                                                                   |
| `payload` | object          | Type-specific data. When there is a patch, `payload.patch` is the path of the patch file relative to the project directory.                                             |

Patches are stored in `patches/<seq>.patch` (gitignored) and are not inlined. Payloads, messages and patches pass through secret redaction: tokens, keys, credentials and private keys become `[REDACTED]`.

## Event types

| Type                                                  | Written by           | Payload                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project.created`                                     | CLI                  | `sessionId`                                                                                                                                                                                                                               |
| `session.started` / `session.ended`                   | hook                 | `sessionId`, `source` / `reason`                                                                                                                                                                                                          |
| `agent.spawned`                                       | hook                 | `agentName`, `agentDisplayName`                                                                                                                                                                                                           |
| `agent.stopped`                                       | hook                 | `agentId`, `agentName`, `response` (full text)                                                                                                                                                                                            |
| `message.sent`                                        | coordinator          | `from`, `to`, `text` (full message)                                                                                                                                                                                                       |
| `file.added` / `file.edited` / `file.deleted`         | hook (postToolUse)   | `path` (relative to the worktree), `kind`, `lines.added`, `lines.removed`, `tool`, `patch` (cumulative diff of the file vs HEAD)                                                                                                          |
| `worktree.snapshot`                                   | hook (agent stop)    | `worktree`, `base`, `files[]` (`path`, `kind`, `added`, `removed`, `binary?`), `totals`, `patch`. Ground truth for the diff since the child's base commit. Skipped when nothing has changed since the last snapshot.                      |
| `worktree.created` / `worktree.removed`               | CLI                  | `repo`, `repoPath`, `worktree`, `branch`, `base`, `baseSha`; `worktree.created` adds `copiedFiles[]` and `missingCopyFiles[]` (names only, never contents)                                                                                |
| `phase.changed`                                       | state updates        | `scope` (`project` \| `child`), `from`, `to`                                                                                                                                                                                              |
| `question.asked` / `question.answered`                | coordinator          | `id`, `from`, `text` / `id`, `answeredBy` (`spec` \| `coordinator`), `text`                                                                                                                                                               |
| `assumption`                                          | coordinator          | `child`, `question`, `decision`, `rationale`, `contractChange` (bool). A decision the coordinator made without the user because the spec did not cover it. The run summary lists every assumption.                                        |
| `contract.changed`                                    | coordinator          | `contract`, `affected[]`, `summary`                                                                                                                                                                                                       |
| `spec.written` / `spec.approved`                      | coordinator          | `path`, `summary` / `changes` (the user's answer to the spec review question that ends the grill)                                                                                                                                         |
| `plan.submitted` / `plan.validated` / `plan.rejected` | coordinator          | `plan`, `reasons[]`. `plan.rejected` adds `reason`: `invalid` (fails the spec) or `inconsistent` (differs from the Shared approach or another plan; then `with[]` lists the other children)                                               |
| `plans.consistent`                                    | coordinator (helper) | `children[]`, `plans` (child → plan path), `gateOpen`. Logged by `npx openfleet gate <project> consistent` once the listed plans agree with the Shared approach and each other.                                                           |
| `baseline.passed`                                     | baseline (helper)    | `files[]` (baseline test files, relative to the worktree), `command`, `results`, `summary`. Logged by `npx openfleet baseline <project> <child> --report`; actor `<child>/baseline`.                                                      |
| `test.run`                                            | tester (via helper)  | `command`, `exitCode`, `passed`, `summary`                                                                                                                                                                                                |
| `child.failed`                                        | coordinator          | `reason`, `retries`, `findings[]`, `worktree`, `blocked[]` (dependents now `blocked`). Logged when 3 retries and one coordinator-guided attempt all fail.                                                                                 |
| `extension.ran`                                       | coordinator (helper) | `extension`, `slot`, `status` (`done` \| `failed`), `summary`. Logged by `npx openfleet ext result`; `target` is the child for per-child slots.                                                                                           |
| `extension.skipped`                                   | coordinator (helper) | `extension`, `agent`, `slot`, `reason`, `checked[]` (directories searched). Logged by `npx openfleet ext plan` when none of the entry's `when.files` exist.                                                                               |
| `extension.outputs`                                   | coordinator (helper) | `extension`, `slot`, `outputs` (flat key → string), `followUps[]`. Stored in `state.json`; dependents get the outputs as "Upstream outputs". `outputs.prUrl` sets the child's `prUrl`.                                                    |
| `extension.failed`                                    | coordinator (helper) | `extension`, `slot`, `reason`, `attempts` (2), `blocked[]`. A blocking entry failed twice (or timed out). In a per-child slot the child is `failed` and a `child.failed` event follows; in `plans-ready` every active child is `blocked`. |
| `run.completed`                                       | coordinator          | `mode` (`staged` \| `draft-pr`), `children`                                                                                                                                                                                               |

Hooks capture `file.*` events only for paths inside a child worktree. File writes by shell commands are not visible to tool hooks; `worktree.snapshot` covers them.

**Copied local files** (a repo's `copyFiles`, for example `.env.local`) never reach the log: `file.*` events for them carry `copiedFile: true` and no `patch`, `worktree.snapshot` leaves them out of `files` and `patch`, and every event payload and patch is also scrubbed of the values found in those files (env, YAML and JSON style `key = value` lines; values shorter than 6 characters, booleans and numbers are left alone) before it is written.

## Attribution

- **Spawns.** Before spawning a child agent, the coordinator sets `pendingSpawn: <role>` on the child in `state.json`. The `subagentStart` hook takes it, records the role, and injects the child's assignment (worktree, branch, spec, contracts) into the subagent's prompt.
- **File changes.** The hook maps the absolute file path to the child whose worktree contains it (longest match), then takes the role from the child's current `role` or phase.
- **Extension agents.** `openfleet-ext-*` agents are attributed to their extension (`ext:<name>`) through `core/extensions.json`.
- **Upstream outputs.** When it injects a planner, baseline, implementer or tester assignment, the `subagentStart` hook also adds an "Upstream outputs" table with every extension output recorded on the children this child depends on, directly or transitively. Planners run before the `plans-ready` gate, so they usually see none.
- **Runtime context.** For baseline, implementer and tester agents the hook also injects the child's port range (`PORT` / `OPENFLEET_PORT_BASE`), the copied local files (never to be committed or printed), what the baseline covers (baseline agent), and the protected baseline test files (implementer and tester).
- **Stops.** The hook matches the child by recorded agent id, or by the unique child with that role. It then records the agent id and takes a diff snapshot.
