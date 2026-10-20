---
name: openfleet-orchestrate
description: The hands-off OpenFleet run loop after the grill. Create worktrees, then for each child run planner → plan validation → implementer → tester in parallel. The coordinator answers child questions itself (logged as assumptions), broadcasts contract changes, retries up to 3 times plus one guided attempt, and marks children failed without asking the user.
---

# Orchestrate the run

Use this skill when the project `status` is `running`. Use `openfleet-records` for every state change and log entry.

**This loop is hands-off.** The user is not watching. Never ask the user anything and never use `ask_user`. Do not end your turn while any child is still pending or in progress: keep waiting with `read_agent` and acting on reports until every child is `done`, `failed` or `blocked`, then go to completion.

## 1. Worktrees

For each child that has no `worktree` yet:

```sh
npx openfleet worktree <project> <child id> --repo <repo key> --branch <branch from spec> [--package <pkg path>]
```

A monorepo gets one worktree per package child, even when two children share a repo.

## 2. Scheduling

A child is **ready** when every id in its `dependsOn` has phase `done`. If any dependency is `failed` or `blocked`, the child can never become ready: mark it `blocked` (see "Failed children"). Start every ready child at the same time. When a child reaches `done`, re-check the children that depend on it. Use background subagents and collect results with `read_agent`. Do not block on one child while others could make progress.

Spawn subagents of the same role one at a time: patch `pendingSpawn`, spawn, record the agent id, then move to the next child. Children of different roles, or children that are already running, proceed in parallel.

## 3. Per-child pipeline

### Plan

1. Patch `{"phase":"planning","pendingSpawn":"planner"}`. Spawn `openfleet:openfleet-planner` with: "Plan child `<id>` of project `<project>`." Log the prompt as `message.sent`.
2. When it reports `done`, save the plan to `openfleet/projects/<project>/plans/<child id>.md`. Patch `{"phase":"plan-review","plan":"<abs path>"}` and log `plan.submitted`.
3. **Validate the plan against the spec yourself:**
   - Every acceptance criterion for this child is mapped.
   - Every contract it produces or consumes has a contract test.
   - Nothing is out of scope or touches another child's repo.
   - The build and test commands match the spec.

   If the plan fails, log `plan.rejected` with reasons. Send the reasons to the **same** planner with `write_agent`. Log that message. Wait for the revision. Repeat until the plan passes. Do not ask the user.

   If the plan passes, log `plan.validated`.

4. Run the `post-plan` slot for the child (see "Extension slots" below).

### Implement

5. Patch `{"phase":"implementing","pendingSpawn":"implementer"}`. Spawn `openfleet:openfleet-implementer`: "Implement the approved plan for child `<id>` of project `<project>`." On a retry, append the tester's findings verbatim.

### Test

6. When the implementer reports `done`, patch `{"phase":"testing","pendingSpawn":"tester"}` and spawn `openfleet:openfleet-tester`: "Verify child `<id>` of project `<project>`."
7. **Pass** (`status: "done"`): patch `{"phase":"post-test"}` and run the `post-test` slot for the child (see "Extension slots" below). Patch `{"phase":"done"}` only after every `post-test` entry has finished. If a blocking entry failed twice, the child is already `failed`; do not mark it `done`.
8. **Fail**: increment `retries`.
   - If `retries < 3`: patch `{"phase":"implementing","retries":n,"pendingSpawn":"implementer"}` and spawn a **new** implementer with the findings (step 5).
   - If `retries` reaches 3: **guided attempt.** Do not ask the user. Review the problem yourself:
     1. Read the tester findings from all three attempts and the diff (`git -C <worktree> diff <baseSha>`).
     2. Work out the root cause. Is the implementation wrong, a test wrong, the plan wrong, or does the spec or a contract conflict with the code?
     3. Write concrete guidance: the cause, the approach to take, the files to change, and what to stop doing. If the fix needs a decision the spec does not cover, make it and log an `assumption` (see section 4).
     4. Patch `{"phase":"implementing","retries":3,"pendingSpawn":"implementer"}` and spawn **one** more new implementer with your guidance and the latest findings. Log the prompt as `message.sent`.
   - If the guided attempt also fails (`retries` reaches 4): the child has **failed**. Follow "Failed children" below.

### Extension slots

For `post-plan` and `post-test`, per child:

1. `npx openfleet ext plan <project> <slot> --child <id>`. Run only the entries under `run`; skipped entries are already logged as `extension.skipped`.
2. For each entry, in order: spawn its `agent` with "Run `<slot>` for child `<id>` of project `<project>`. Worktree: `<worktree>`." Wait for it with `read_agent`. If it is still running after `timeoutMinutes`, stop it and treat the attempt as failed.
3. Record its `openfleet-report` block: `npx openfleet ext result <project> <extension> --slot <slot> --child <id> --report '<json from the block>'`. Pass `outputs` and `followUps` through exactly as reported; the helper validates them (flat string values only). An output named `prUrl` becomes the child's `prUrl`.
4. If the attempt failed (report `status: "failed"`, no report, or a timeout):
   - **advisory** entry: record it and continue.
   - **blocking** entry: spawn one **fresh** agent for the same entry and try again. If the retry also fails, run `npx openfleet ext fail <project> <extension> --slot <slot> --child <id> --reason '<why>'` and stop this child's pipeline. The helper marks the child `failed`, marks its not-yet-done dependents `blocked`, and logs `extension.failed` and `child.failed`.

Dependents are scheduled only when this child is `done`, so they start after every blocking `post-test` entry succeeds. The spawn hook then injects the recorded outputs into their planner, implementer and tester prompts under **Upstream outputs** (direct and transitive dependencies). You do not need to relay them yourself.

### Failed children

1. Patch the child `{"phase":"failed","retries":4,"notes":"<one-line cause>"}`.
2. Find every child that depends on it, directly or transitively. Patch each one that is not `done` to `{"phase":"blocked","notes":"dependency <id> failed"}`. If one of them has an agent running, stop it.
3. Log `child.failed` with `{"reason":"…","retries":4,"findings":["…"],"worktree":"<abs path>","blocked":["<dependent ids>"]}`.
4. Keep the worktree as it is. Continue with every other child. Do not ask the user. The final summary reports the failure, and the user can deal with it later with `npx openfleet resume`.

## 4. Questions from children

When a child reports `status: "question"`:

1. Add the question to `questions` with status `open`, and log `question.asked`.
2. **If `spec.md` or `contracts/` answers it,** reply with `write_agent`, quoting the relevant spec lines. Set `answeredBy: "spec"`.
3. **Otherwise, decide yourself.** Do not ask the user. Choose the option that best fits the goal, the existing code, the contracts and the out-of-scope list. When in doubt, prefer the smallest, most conventional and backward-compatible choice. Reply with `write_agent` and set `answeredBy: "coordinator"`. Log an `assumption` event:

   ```sh
   npx openfleet event <project> --type assumption --target <child id> --payload '{"child":"<child id>","question":"…","decision":"…","rationale":"…","contractChange":false}'
   ```

4. Mark the question `answered` and log `question.answered`. Log the reply as `message.sent`.
5. If your decision changes a contract (`contractChange: true`), follow "Changing a contract" in `openfleet-contracts`, including the broadcast to affected children. If it changes the scope, update `spec.md` and log `spec.written`.

Answer questions as they arrive. Do not hold a question back while you wait for others.

## 5. Completion

When every child is `done`, `failed` or `blocked`, patch the project `{"status":"finalizing"}` and use `openfleet-finalize`. Do this even when some children failed: finalize the ones that are `done`.

## Resuming

On resume, read `state.json`. For each child:

- `planning`, `implementing` or `testing` with a recorded agent id: try `read_agent` on that id. If the agent is gone, re-spawn that role. Implementers continue from the worktree's current contents.
- `plan-review`: re-validate the saved plan.
- Answer any `open` questions first.
