---
name: openfleet-spec
description: Format of an OpenFleet project spec.md (the single source of truth that planners, implementers and testers work from) and the spec review question that ends the grill and starts the run.
---

# spec.md

Write the spec to `openfleet/projects/<project>/spec.md` with exactly these sections. Children read only this file and `contracts/`, so they must not need to guess anything.

```markdown
# <Project title>

## Goal

What changes and why, in 2–5 sentences.

## Children

| Child id | Repo | Package     | Path / URL | Branch                 | Depends on |
| -------- | ---- | ----------- | ---------- | ---------------------- | ---------- |
| api      | api  | —           | ../api     | openfleet/<project>    | —          |
| web:ui   | web  | packages/ui | ../web     | openfleet/<project>-ui | api        |

## Contracts

| Contract              | File                         | Producer | Consumers |
| --------------------- | ---------------------------- | -------- | --------- |
| Session token payload | contracts/session-token.json | api      | web:ui    |

## Per-child requirements

### api

- **Scope:** …
- **Build:** `pnpm build`
- **Test:** `pnpm test`
- **Acceptance criteria:**
  1. …
- **Contract tests:** produces `session-token.json`: the API response must validate against the fixture.
- **Baseline:** no

### web:ui

- …
- **E2E:** `pnpm test:e2e`
- **Env (names only):** `AUTH_CLIENT_ID`, `AUTH_CALLBACK_URL`
- **Baseline:** yes. Cover: sign-in, sign-out and the profile page. Allowed changes: the sign-in button label.

…

## Shared approach

What must be the same in every child (config shape, patterns, env var names, versions, naming), or "None".

## Ordering

The DAG in plain words, or "All children run in parallel."

## Completion mode

`staged` | `draft-pr`

## Out of scope

- …
```

## Rules

- Every child in **Children** has a section in **Per-child requirements** with build, test, at least one acceptance criterion, and its contract tests.
- Every contract file listed exists in `contracts/` (see `openfleet-contracts`).
- **Baseline** is `yes` or `no` for every child. With `yes`, it says what to cover and which baseline behaviours may change ("Allowed changes: none" is valid).
- **E2E** and **Env** lines appear for children that need them. Env lists names only, never values.
- Branch names default to `openfleet/<project>` or `openfleet/<project>-<package>`, unless the user chose otherwise.

## Spec review: the last grill question

The spec review is part of the grill, not a separate gate. The project stays `specifying` until the user answers.

1. Log `spec.written`. Register every child in `state.json` with `phase: "pending"`, its `dependsOn`, and, for children with a baseline, `"baseline": true` and `"baselineCover": "<what to cover>"`. Set the project `completionMode` (see `openfleet-records`). Keep `status: "specifying"`.
2. Ask the final grill question. Show a short summary (children, contracts, ordering, completion mode, out of scope), give the path to the full spec, and ask: **"Anything to change before I start?"**
3. The user's answer ends the grill:
   - If they asked for changes, apply them to `spec.md` and `contracts/` and log `spec.written` again. Do not ask them to confirm the result. Only if a requested change is too unclear to apply, ask one short follow-up, then apply it.
   - Log `spec.approved` with `{"changes":"<what changed, or none>"}`.
   - Patch `{"status":"running","specApproved":true}`.
4. Continue straight into `openfleet-orchestrate`. From here the run is hands-off: do not ask the user anything until the run is `done`.
