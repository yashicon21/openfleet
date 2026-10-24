---
"@openfleet-tools/cli": minor
"@openfleet-tools/create": minor
---

Flatten the workspace layout. `npm create @openfleet-tools` and `npx openfleet init` no longer create an `openfleet/` subfolder: `core/`, `extensions/`, `projects/`, `repos.json`, `extensions.lock.json` and `extensions.config.json` now sit in the workspace root, next to `package.json` and `node_modules/`. Repos cloned from a `url` go to `repos/<key>`.

- A new root file, `openfleet.json`, marks the workspace (commands walk up from the current folder to find it) and records the core `version`. It replaces `config.json`: workspace settings such as `maxParallel` and `host` live in it, and `npx openfleet config` / `config set` read and write it.
- `init` refuses a folder without `openfleet.json` that already contains any of the entries it would create, and lists them. Use an empty folder or a new subfolder.
- `init` writes a root `.gitignore` (including `node_modules/`, `repos/` and `projects/*/worktrees/`) only if none exists. Otherwise it leaves the file unchanged and prints the lines it lacks.

Existing workspaces are not migrated automatically. To move one by hand, from the workspace root:

1. Move everything in `openfleet/` up one level (`core/` can be deleted instead; `npx openfleet update` reinstalls it).
2. Rename `config.json` to `openfleet.json` (create `{}` if you had no `config.json`), then run `npx openfleet update` to record the version.
3. Cloned repos move from `openfleet/repos/` to `repos/` with step 1. Moving `projects/` and `repos/` breaks the links of existing worktrees: run `git worktree repair <worktree paths>` in each repo, or `npx openfleet clean` finished projects before moving.
4. Merge `openfleet/.gitignore` into the root `.gitignore`, add `node_modules/`, and delete the empty `openfleet/` folder.
