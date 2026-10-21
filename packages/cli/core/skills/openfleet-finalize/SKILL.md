---
name: openfleet-finalize
description: Finish an OpenFleet run. Run post-run extensions, then leave changes staged for review or open cross-linked draft PRs with a run summary, according to the spec's completion mode.
---

# Finalize

Use this skill when the project `status` is `finalizing`. Finalizing is still hands-off: do not ask the user anything. Report problems in the summary.

## 1. Post-run extensions

Run `npx openfleet ext plan <project> post-run` and spawn each entry under `run` in order (for example, an audit). Pass each one the project name. Record each report with `npx openfleet ext result <project> <extension> --slot post-run --report '<json>'`. `post-run` entries are advisory. Collect any report paths they produce for the summary.

## 2. Run summary

Write `openfleet/projects/<project>/summary.md`:

- Goal (from the spec).
- A table of children, grouped by repo (members of a repo with several children under its integration child, with whether they were merged): child id, outcome (`done`, `failed` or `blocked`), branch, worktree, files changed, lines added/removed (from the latest `worktree.snapshot` event of each child), retries, and tester result.
- **Failed and blocked children:** for each one, the reason, the last tester findings, the worktree path, and which children it blocked (from the `child.failed` events). Say that `npx openfleet resume <project>` continues with them.
- **Assumptions:** every `assumption` event, as a list of child, question, decision and rationale. Mark the ones that changed a contract. The user did not see these during the run, so make this list complete.
- **Baselines:** for each child with a baseline, the test files, the command and the results (from `baseline.passed`), and which baseline files changed and why (`npx openfleet baseline <project> <child> --check`).
- **Local files:** copied files per child, and any `copyFiles` that were missing (from `worktree.created`).
- The contracts, and any contract changes during the run.
- The questions asked and how they were answered, including questions escalated by repo coordinators (`question.escalated`) and the decisions.
- Merge conflicts and integration failures per repo (`merge.conflict`, integration tester findings).
- Extension reports, including `extension.skipped` and `extension.failed` events.
- **Follow-ups:** every entry in `children.<id>.followUps` (per child, grouped by extension) and the project-level `followUps`. People must act on these after the run, so list them all.

## 3. Completion mode

**Repos with several children** (path-scoped children or several packages) are finalized **once per repo**, from the repo's integration child (keyed by the repo): its `worktree` and `branch` are the integration worktree and branch, which already contain every merged child. Treat the integration child like any other child below (one staged worktree or one PR per repo), and skip its member children: their own worktrees and branches are only working copies. If the integration child is `failed` or `blocked`, the repo gets no PR; list its members' outcomes, worktrees and branches in the summary.

**Local files never get committed.** Files in a child's `copiedFiles` are hidden from git, so `git add -A` skips them. Still, after every `git add -A` below, run `git -C <worktree> diff --cached --name-only` and, if any copied file is listed, unstage it with `git -C <worktree> reset -q -- <file>` before you commit. Never print their contents.

### Children that already have a PR

An extension can open a PR mid-run (it reports an output named `prUrl`, which is recorded as the child's `prUrl`). For each `done` child that already has `prUrl`, in **either** mode, because those changes are already pushed:

1. `cd <worktree> && git add -A`. If anything is staged, commit it (`git commit -m "<type>: <Subject>"`).
2. `git push origin <branch>` to the **same** branch. Never open a second PR for the child.
3. Update the existing PR body with `gh pr edit <prUrl> --body-file <tmp>`: the child's summary, acceptance criteria and results, a link to `summary.md`, the **Related PRs** list, and a **Follow-ups** list with the child's `followUps`.

Then handle the remaining `done` children with the completion mode below.

### `staged` (default)

For each `done` child without a `prUrl`, run `cd <worktree> && git add -A`. Do **not** commit. Tell the user where each worktree is, and show `git -C <worktree> diff --cached --stat`. Leave `failed` and `blocked` worktrees untouched.

### `draft-pr`

For each `done` child without a `prUrl` (skip `failed` and `blocked` children; they get no PR):

1. `cd <worktree> && git add -A && git commit -m "<type>: <Subject>"`. Use a Conventional Commit with a sentence-case subject that describes this child's change.
2. `git push -u origin <branch>`.
3. Open a draft PR: `gh pr create --draft --base <default branch> --head <branch> --title "<title>" --body-file <tmp>`. The body has the child's summary, its acceptance criteria and their results, a link to `summary.md`, and a **Follow-ups** list with the child's `followUps` (if any).
4. Record `prUrl` on the child.

When all PRs exist (including PRs opened mid-run), edit each PR body (`gh pr edit <url> --body-file …`) to add a **Related PRs** list that links every other PR in the run. Record each `prUrl` in `summary.md`.

If a push or PR command fails, record the error in `summary.md` and in the final report. Do not retry destructively, and do not stop the other children.

## 4. Done

Log `run.completed` with the mode and per-child outcome. Patch `{"status":"done"}`. Then end the run with a final report to the user:

- where to review (worktrees or PR links),
- every assumption you made (child, question, decision),
- every extension follow-up, per child,
- failed and blocked children with their findings and worktree paths,
- `npx openfleet clean <project>` removes the child and integration worktrees after merging (`--branches` also deletes the local branches),
- `npx openfleet resume <project>` continues with failed children or review feedback; or they can start a new project.
