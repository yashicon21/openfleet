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

| Type                                                  | Written by          | Payload                                                                                                                                                                                                              |
| ----------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project.created`                                     | CLI                 | `sessionId`                                                                                                                                                                                                          |
| `session.started` / `session.ended`                   | hook                | `sessionId`, `source` / `reason`                                                                                                                                                                                     |
| `agent.spawned`                                       | hook                | `agentName`, `agentDisplayName`                                                                                                                                                                                      |
| `agent.stopped`                                       | hook                | `agentId`, `agentName`, `response` (full text)                                                                                                                                                                       |
| `message.sent`                                        | coordinator         | `from`, `to`, `text` (full message)                                                                                                                                                                                  |
| `file.added` / `file.edited` / `file.deleted`         | hook (postToolUse)  | `path` (relative to the worktree), `kind`, `lines.added`, `lines.removed`, `tool`, `patch` (cumulative diff of the file vs HEAD)                                                                                     |
| `worktree.snapshot`                                   | hook (agent stop)   | `worktree`, `base`, `files[]` (`path`, `kind`, `added`, `removed`, `binary?`), `totals`, `patch`. Ground truth for the diff since the child's base commit. Skipped when nothing has changed since the last snapshot. |
| `worktree.created` / `worktree.removed`               | CLI                 | `repo`, `repoPath`, `worktree`, `branch`, `base`, `baseSha`                                                                                                                                                          |
| `phase.changed`                                       | state updates       | `scope` (`project` \| `child`), `from`, `to`                                                                                                                                                                         |
| `question.asked` / `question.answered`                | coordinator         | `id`, `from`, `text` / `id`, `answeredBy` (`spec` \| `coordinator`), `text`                                                                                                                                          |
| `assumption`                                          | coordinator         | `child`, `question`, `decision`, `rationale`, `contractChange` (bool). A decision the coordinator made without the user because the spec did not cover it. The run summary lists every assumption.                   |
| `contract.changed`                                    | coordinator         | `contract`, `affected[]`, `summary`                                                                                                                                                                                  |
| `spec.written` / `spec.approved`                      | coordinator         | `path`, `summary` / `changes` (the user's answer to the spec review question that ends the grill)                                                                                                                    |
| `plan.submitted` / `plan.validated` / `plan.rejected` | coordinator         | `plan`, `reasons[]`                                                                                                                                                                                                  |
| `test.run`                                            | tester (via helper) | `command`, `exitCode`, `passed`, `summary`                                                                                                                                                                           |
| `child.failed`                                        | coordinator         | `reason`, `retries`, `findings[]`, `worktree`, `blocked[]` (dependents now `blocked`). Logged when 3 retries and one coordinator-guided attempt all fail.                                                            |
| `extension.ran`                                       | coordinator         | `extension`, `slot`, `summary`                                                                                                                                                                                       |
| `run.completed`                                       | coordinator         | `mode` (`staged` \| `draft-pr`), `children`                                                                                                                                                                          |

Hooks capture `file.*` events only for paths inside a child worktree. File writes by shell commands are not visible to tool hooks; `worktree.snapshot` covers them.

## Attribution

- **Spawns.** Before spawning a child agent, the coordinator sets `pendingSpawn: <role>` on the child in `state.json`. The `subagentStart` hook takes it, records the role, and injects the child's assignment (worktree, branch, spec, contracts) into the subagent's prompt.
- **File changes.** The hook maps the absolute file path to the child whose worktree contains it (longest match), then takes the role from the child's current `role` or phase.
- **Stops.** The hook matches the child by recorded agent id, or by the unique child with that role. It then records the agent id and takes a diff snapshot.
