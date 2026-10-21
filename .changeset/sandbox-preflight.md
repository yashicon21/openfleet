---
"@openfleet-tools/cli": patch
"@openfleet-tools/create": patch
---

Detect sandbox write blocks before a run starts. New `npx openfleet preflight <project>` checks that git can write ref locks and worktree admin dirs in every repo; the grill runs it before spec approval, and the run runs it at start and after `resume`. The launcher probes the same writes before starting Copilot and stops when the sandbox is inherited from the launching shell, and warns when Copilot's command sandbox looks enabled. Git failures show git's stderr with a sandbox hint instead of a stack trace. Agents never read `copyFiles` or `.env*` files.
