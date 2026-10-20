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

Child phases: `pending → planning → plan-review → planned → [baseline → planned] → implementing → testing → post-test → done`. `planned` means the plan is validated; the child then waits for the `plans-ready` gate and its dependencies. A child can also be `failed` (retries and the guided attempt failed) or `blocked` (a dependency failed). Unknown phases are rejected. A phase change in a patch logs a `phase.changed` event automatically. Moving a child back to `pending`, `planning` or `plan-review` clears its `consistent` flag, so its new plan goes through the consistency check again.

Fields that core sets (do not patch them): `portBase` (the child's port range, assigned when the child is registered), `copiedFiles`, `consistent`, `baselineFiles`, `baselineHashes`, `baselinePassed`, and the project's `plansReady`. Set `baseline` and `baselineCover` when you register a child.

## Scheduling and the gate

```sh
npx openfleet next <project>                                   # next actions: plan, check-consistency, plans-ready, baseline, implement, block, finalize
npx openfleet gate <project> consistent [--child <id>,<id>]    # plans passed the consistency check; logs plans.consistent
npx openfleet gate <project> open                              # open the plans-ready gate (all plans consistent)
npx openfleet baseline <project> <child> --report '<json>'     # baseline passed; logs baseline.passed, phase back to planned
npx openfleet baseline <project> <child> --check               # baseline files changed since the baseline passed
```

## Worktrees

```sh
npx openfleet worktree <project> <child id> --repo <repos.json key> --branch <branch> [--package <path>] [--base <ref>]
```

This command creates `openfleet/projects/<project>/worktrees/<child id>/` from the repo's local checkout (it clones `url` first if there is no local `path`). It also records `worktree`, `branch`, `baseSha` and `repoPath` on the child and logs `worktree.created`. If the worktree already exists, it is reused.

Every run of the command also copies the repo's `copyFiles` from its main checkout into the worktree (refreshing older copies), records them as `copiedFiles`, and hides them from git: tracked files get `git update-index --skip-worktree`, untracked ones are added to the repo's `info/exclude`. Their contents are redacted from events and excluded from snapshots and patches. Missing files are reported as warnings.

## Extension slots

```sh
# slots: pre-spec, post-plan, plans-ready, pre-implement, post-test, post-run
npx openfleet ext plan <project> <slot> [--child <id>]                                   # entries to run; logs extension.skipped
npx openfleet ext result <project> <ext> --slot <slot> [--child <id>] --report '<json>'  # logs extension.ran (+ extension.outputs)
npx openfleet ext fail <project> <ext> --slot <slot> [--child <id>] --reason '<text>'    # child failed, dependents blocked
```

`ext result` stores the report's `outputs` in `children.<id>.outputs.<ext>` and its `followUps` in `children.<id>.followUps.<ext>` (or the project-level `followUps` without `--child`). An output named `prUrl` also sets `children.<id>.prUrl`. Do not write these fields with `state --patch`.

## Events

```sh
npx openfleet event <project> --type <type> [--actor <actor>] [--target <child id>] [--payload '<json>'] [--patch-file <path>]
```

- `actor` defaults to `coordinator`. Children use `<child id>/<role>`. Extensions use `ext:<name>`.
- The helper redacts secrets before it writes.
- **Do not log file edits or agent start/stop events.** The hooks capture those automatically.

Events the coordinator must log:

| When                                                                | type                                                  | payload                                                                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| You send a child a message (spawn prompt, answer, broadcast, retry) | `message.sent`                                        | `{"from":"coordinator","to":"<child>/<role>","text":"<full message>"}`                                                                   |
| A child replies                                                     | `message.sent`                                        | `{"from":"<child>/<role>","to":"coordinator","text":"<full reply>"}`                                                                     |
| A question arrives                                                  | `question.asked`                                      | `{"id":"q3","from":"<child>/<role>","text":"…"}`                                                                                         |
| A question is answered                                              | `question.answered`                                   | `{"id":"q3","answeredBy":"spec\|coordinator","text":"…"}`                                                                                |
| You decide something the spec does not cover                        | `assumption`                                          | `{"child":"<child id>","question":"…","decision":"…","rationale":"…","contractChange":false}`                                            |
| `spec.md` is written or changed                                     | `spec.written`                                        | `{"path":"spec.md","summary":"…"}`                                                                                                       |
| The user answers the spec review question (end of the grill)        | `spec.approved`                                       | `{"changes":"<what changed, or none>"}`                                                                                                  |
| A plan is received, accepted or bounced                             | `plan.submitted` / `plan.validated` / `plan.rejected` | `{"plan":"plans/<child>.md","reasons":[…]}`; `plan.rejected` adds `"reason":"invalid\|inconsistent"` (and `"with":[…]` for inconsistent) |
| Plans pass the consistency check                                    | `plans.consistent`                                    | logged by `npx openfleet gate <project> consistent`                                                                                      |
| A baseline passes                                                   | `baseline.passed`                                     | logged by `npx openfleet baseline <project> <child> --report`                                                                            |
| A contract changes                                                  | `contract.changed`                                    | `{"contract":"contracts/…","affected":["…"],"summary":"…"}`                                                                              |
| A child fails after the guided attempt                              | `child.failed`                                        | `{"reason":"…","retries":4,"findings":["…"],"worktree":"…","blocked":["…"]}`                                                             |
| An extension agent finishes                                         | `extension.ran` (+ `extension.outputs`)               | logged by `npx openfleet ext result` (see below)                                                                                         |
| An extension entry is skipped by `when.files`                       | `extension.skipped`                                   | logged by `npx openfleet ext plan`                                                                                                       |
| A blocking extension entry fails twice                              | `extension.failed` (+ `child.failed`)                 | logged by `npx openfleet ext fail`                                                                                                       |
| The run is finished                                                 | `run.completed`                                       | `{"mode":"staged\|draft-pr","children":{…}}`                                                                                             |
