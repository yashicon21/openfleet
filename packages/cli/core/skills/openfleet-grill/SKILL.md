---
name: openfleet-grill
description: Interview ("grill") the user to turn a free-text cross-repo request into a complete OpenFleet spec. Suggests repos from repos.json, discovers build/test commands, confirms them with the user, and ends with the spec review question. The grill is the only time OpenFleet asks the user anything.
---

# Grill session

The goal is to collect everything that `openfleet-spec` needs, so that no child has to guess later. **The grill is the user's only input.** After it, the run is hands-off: you will resolve every open point yourself and log it as an assumption. So ask now about anything a child is likely to need: edge cases, error handling, naming, defaults, compatibility. Ask questions in short rounds of 1–4 focused questions. Prefer multiple choice. Recommend a default when you have one. Do not interrogate the user about things you can find yourself in the repos.

## 0. Setup

- Read `openfleet/repos.json` (known repos and packages, with confirmed build/test commands).
- Read the project's `state.json`. If `spec.md` already exists, you are refining it. Start from it.
- If `openfleet/core/extensions.json` lists `pre-spec` agents, run them after step 4 (see the coordinator rules).

## 1. Goal

Restate the user's request in one or two sentences and confirm it. Ask what "done" looks like from the user's point of view.

## 2. Repos and packages

- Suggest likely repos from `repos.json`, based on names, descriptions and a quick search of their code.
- Ask about any other repos the change needs. Accept local paths or git URLs. Repos can live anywhere. The default search root is the workspace root (the folder the user ran `init` in). Look there for sibling checkouts before you ask for a path.
- For monorepos, identify the **packages** involved. Each package becomes its own child (own worktree, branch and PR). The child id is `<repo>:<package-name>`.

## 3. Build and test commands

For each repo or package, discover the commands from `package.json` scripts, `Makefile`, `pyproject.toml`, `Cargo.toml`, `go.mod`, CI workflows, and similar files. Present what you found. Ask the user to confirm or correct it. Record the confirmed commands in `openfleet/repos.json` (set `"confirmed": true`). Add new repos with `path` or `url`, and with `defaultBranch`. Keep the existing entries unchanged except for corrections that the user confirmed.

## 4. Cross-repo contracts and ordering

- Identify every interface that crosses a repo boundary: API shapes, events, shared types, config keys, CLI flags, DB schemas.
- For each contract, agree on the exact shape (use `openfleet-contracts`), who produces it, and who consumes it.
- Agree on ordering dependencies (for example, "the SDK depends on the API"). The default is fully parallel.

## 5. Acceptance criteria

For each child, agree on concrete, verifiable acceptance criteria. The tester checks every criterion.

## 6. Branches, completion mode, scope

- **Branch names:** propose `openfleet/<project>` for single-repo children and `openfleet/<project>-<package>` for monorepo packages. Ask the user to confirm or override.
- **Completion mode:** `staged` (default: changes are left staged in each worktree for review) or `draft-pr` (commit, push, and open draft PRs that link to each other and include a run summary).
- **Out of scope:** list explicitly what this project must NOT change.

## 7. Spec review (final question)

When all of this is answered, write the spec with `openfleet-spec`. Then ask the final question from "Spec review" in `openfleet-spec`: show the summary and ask **"Anything to change before I start?"** The user's answer ends the grill. Apply any changes, log `spec.approved`, set `status: "running"`, and start the run immediately.
