---
name: openfleet-finalize
description: Finish an OpenFleet run. Run post-run extensions, then leave changes staged for review or open cross-linked draft PRs with a run summary, according to the spec's completion mode.
---

# Finalize

Use this skill when the project `status` is `finalizing`. Finalizing is still hands-off: do not ask the user anything. Report problems in the summary.

## 1. Post-run extensions

Run each `post-run` agent from `openfleet/core/extensions.json` in order (for example, audit or pattern-extractor). Pass each one the project name. Log `extension.ran` for each. Collect any report paths they produce for the summary.

## 2. Run summary

Write `openfleet/projects/<project>/summary.md`:

- Goal (from the spec).
- A table of children: child id, outcome (`done`, `failed` or `blocked`), branch, worktree, files changed, lines added/removed (from the latest `worktree.snapshot` event of each child), retries, and tester result.
- **Failed and blocked children:** for each one, the reason, the last tester findings, the worktree path, and which children it blocked (from the `child.failed` events). Say that `npx openfleet resume <project>` continues with them.
- **Assumptions:** every `assumption` event, as a list of child, question, decision and rationale. Mark the ones that changed a contract. The user did not see these during the run, so make this list complete.
- The contracts, and any contract changes during the run.
- The questions asked and how they were answered.
- Extension reports.

## 3. Completion mode

### `staged` (default)

For each `done` child, run `cd <worktree> && git add -A`. Do **not** commit. Tell the user where each worktree is, and show `git -C <worktree> diff --cached --stat`. Leave `failed` and `blocked` worktrees untouched.

### `draft-pr`

For each `done` child (skip `failed` and `blocked` children; they get no PR):

1. `cd <worktree> && git add -A && git commit -m "<type>: <Subject>"`. Use a Conventional Commit with a sentence-case subject that describes this child's change.
2. `git push -u origin <branch>`.
3. Open a draft PR: `gh pr create --draft --base <default branch> --head <branch> --title "<title>" --body-file <tmp>`. The body has the child's summary, its acceptance criteria and their results, and a link to `summary.md`.
4. Record `prUrl` on the child.

When all PRs exist, edit each PR body (`gh pr edit <url> --body-file …`) to add a **Related PRs** list that links every other PR in the run. Record each `prUrl` in `summary.md`.

If a push or PR command fails, record the error in `summary.md` and in the final report. Do not retry destructively, and do not stop the other children.

## 4. Done

Log `run.completed` with the mode and per-child outcome. Patch `{"status":"done"}`. Then end the run with a final report to the user:

- where to review (worktrees or PR links),
- every assumption you made (child, question, decision),
- failed and blocked children with their findings and worktree paths,
- `npx openfleet clean <project>` removes the worktrees after merging (`--branches` also deletes the local branches),
- `npx openfleet resume <project>` continues with failed children or review feedback; or they can start a new project.
