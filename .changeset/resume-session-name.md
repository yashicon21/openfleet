---
"@openfleet-tools/cli": patch
"@openfleet-tools/create": patch
---

Fix `npx openfleet resume`: it no longer passes `--name` together with the recorded `--session-id`, which Copilot rejects. Only new sessions are named. When Copilot no longer has the recorded session, `resume` starts a new one, records its id and logs `session.replaced`.
