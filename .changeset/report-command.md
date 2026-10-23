---
"@openfleet-tools/cli": minor
---

Add `npx openfleet report <project> [--out <file>] [--open] [--gap <min>]`. It writes `projects/<project>/report.html`, a single self-contained HTML report of a finished or running project, built from `events.jsonl`, `state.json`, `spec.md`, `summary.md` and git without an agent: active and wall-clock time (pauses longer than `--gap` minutes, default 15, are collapsed), how the work was split, a timeline of every child's phases, the plan gate, agents at once and spawns by role, lines changed and test runs per child, and the `Coverage`, `Assumptions`, `Follow-ups` and `Lessons` sections of `summary.md`.

- Token usage by role and model is read from the host's transcripts on this machine (Claude Code or Copilot CLI) and counts each API message once. Cost is shown only when `openfleet.json` has a new optional `pricing` table (USD per million tokens per model); OpenFleet ships no prices.
- Finalize now writes the summary under the `## Coverage`, `## Assumptions`, `## Follow-ups` and `## Lessons` headings, runs `openfleet report` at the end of every run, and links `report.html` from `summary.md`.
