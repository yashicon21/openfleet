---
"@openfleet-tools/cli": minor
---

Claude Code is now a fully supported host alongside GitHub Copilot CLI.

- `npx openfleet init` asks which host the workspace uses (Copilot CLI or Claude Code) and saves it as `host` in `openfleet.json`. Pass `--host <copilot|claude>` to skip the question; without a terminal (or in CI) the host is `copilot`. Re-running `init` keeps the saved host unless `--host` is given.
- Launching Claude Code no longer prints a warning. Docs, help text and the grill skill describe both hosts equally.
- New parity tests run the same scenarios against both hosts: launch args, generated plugins, hook payloads and the host binary and version checks.
