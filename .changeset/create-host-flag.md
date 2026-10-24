---
"@openfleet-tools/create": minor
---

Add `--host <copilot|claude>`, forwarded to `openfleet init`. Without it, `init` asks which agent host the workspace uses (Copilot CLI or Claude Code); without a terminal (or in CI) the host is `copilot`.
