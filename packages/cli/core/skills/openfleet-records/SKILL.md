---
name: openfleet-records
description: How OpenFleet agents update state.json, append events.jsonl entries and create worktrees through the `npx openfleet` helper commands. Use whenever you change project state or need to log something.
---

# OpenFleet records

Run every command below **from the workspace root** (the session's starting directory). Never edit `state.json` or `events.jsonl` by hand. The helpers take file locks, which concurrent hooks and agents depend on.

## State

```sh
npx openfleet state <project>                      # print state.json
npx openfleet state <project> --patch '<json>'     # RFC 7396 merge patch (null deletes a key)
```

Useful patches:

```sh
# project status: specifying | running | finalizing | done | cancelled  (unknown values are rejected)
npx openfleet state p --patch '{"status":"running","specApproved":true,"completionMode":"staged"}'

# register a child (child id = "<repo>" or "<repo>:<package>")
npx openfleet state p --patch '{"children":{"api":{"repo":"api","phase":"pending","dependsOn":[],"retries":0,"agentIds":{}}}}'

# right before spawning a subagent for a child
npx openfleet state p --patch '{"children":{"api":{"phase":"planning","pendingSpawn":"planner"}}}'

# after the spawn returns an agent id
npx openfleet state p --patch '{"children":{"api":{"agentIds":{"planner":"<agent id>"}}}}'

# open / answer questions
npx openfleet state p --patch '{"questions":[ … full array … ]}'
```

Arrays replace the old value. To change `questions` or `dependsOn`, send the full new array.

Child phases: `pending → planning → plan-review → implementing → testing → post-test → done`. A child can also be `failed` (retries and the guided attempt failed) or `blocked` (a dependency failed). Unknown phases are rejected. A phase change in a patch logs a `phase.changed` event automatically.

## Worktrees

```sh
npx openfleet worktree <project> <child id> --repo <repos.json key> --branch <branch> [--package <path>] [--base <ref>]
```

This command creates `openfleet/projects/<project>/worktrees/<child id>/` from the repo's local checkout (it clones `url` first if there is no local `path`). It also records `worktree`, `branch`, `baseSha` and `repoPath` on the child and logs `worktree.created`. If the worktree already exists, the command does nothing.

## Events

```sh
npx openfleet event <project> --type <type> [--actor <actor>] [--target <child id>] [--payload '<json>'] [--patch-file <path>]
```

- `actor` defaults to `coordinator`. Children use `<child id>/<role>`. Extensions use `ext:<name>`.
- The helper redacts secrets before it writes.
- **Do not log file edits or agent start/stop events.** The hooks capture those automatically.

Events the coordinator must log:

| When | type | payload |
| --- | --- | --- |
| You send a child a message (spawn prompt, answer, broadcast, retry) | `message.sent` | `{"from":"coordinator","to":"<child>/<role>","text":"<full message>"}` |
| A child replies | `message.sent` | `{"from":"<child>/<role>","to":"coordinator","text":"<full reply>"}` |
| A question arrives | `question.asked` | `{"id":"q3","from":"<child>/<role>","text":"…"}` |
| A question is answered | `question.answered` | `{"id":"q3","answeredBy":"spec\|coordinator","text":"…"}` |
| You decide something the spec does not cover | `assumption` | `{"child":"<child id>","question":"…","decision":"…","rationale":"…","contractChange":false}` |
| `spec.md` is written or changed | `spec.written` | `{"path":"spec.md","summary":"…"}` |
| The user answers the spec review question (end of the grill) | `spec.approved` | `{"changes":"<what changed, or none>"}` |
| A plan is received, accepted or bounced | `plan.submitted` / `plan.validated` / `plan.rejected` | `{"plan":"plans/<child>.md","reasons":[…]}` |
| A contract changes | `contract.changed` | `{"contract":"contracts/…","affected":["…"],"summary":"…"}` |
| A child fails after the guided attempt | `child.failed` | `{"reason":"…","retries":4,"findings":["…"],"worktree":"…","blocked":["…"]}` |
| An extension agent finishes | `extension.ran` | `{"extension":"…","slot":"…","summary":"…"}` |
| The run is finished | `run.completed` | `{"mode":"staged\|draft-pr","children":{…}}` |
