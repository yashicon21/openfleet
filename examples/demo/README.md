# Demo: one change across two repos

A repeatable toy example for watching OpenFleet run end to end.

```sh
pnpm demo                      # or: examples/demo/setup.sh [dir]
pnpm demo --host claude        # experimental: run the demo in Claude Code
```

The script:

1. Builds the packages in this checkout.
2. Creates a fresh demo directory (default `${TMPDIR:-/tmp}/openfleet-demo`). Re-running wipes it; the script refuses to wipe a non-demo directory.
3. Creates two git repos from [`template/`](template), each with an initial commit on `main` and a passing `npm test` (`node:test`, no dependencies):
   - `api`: an HTTP service with `GET /greeting` → `{ "message": "Hello" }`.
   - `web`: a client that fetches `/greeting` and renders the message (its tests mock the API).
4. Scaffolds an OpenFleet workspace in `fleet/` with the local build (`@openfleet-tools/create --cli file:…/packages/cli`) and pre-seeds `repos.json` with both repos and their test commands.
5. With `--host claude`, runs `npx openfleet config set host claude` in the workspace.
6. Prints the next commands.

## Run it

```sh
cd "${TMPDIR:-/tmp}/openfleet-demo/fleet"
npx openfleet new greeting-lang "Add a language field to the greeting API and show it in web"
```

The coordinator should suggest `api` and `web`, agree a contract for the new `language` field, and finish the grill by showing the spec and asking if anything should change. Your answer starts the run: it then plans, implements and tests both repos in parallel without asking you anything more. Tool use is auto-approved and file access is limited to the workspace and the two repos, so the only prompts you should see are the grill questions and any URL access (add `--ask` to approve each tool yourself).

Watch from another terminal:

```sh
npx openfleet status greeting-lang
tail -f projects/greeting-lang/events.jsonl
```

In the default completion mode, changes are staged (not committed) in each worktree:

```sh
git -C projects/greeting-lang/worktrees/api diff --cached
git -C projects/greeting-lang/worktrees/web diff --cached
```

The spec, plans and contracts are in `projects/greeting-lang/`, and full patches are in its `patches/`.

Requirements: Node.js 20+, git, pnpm and a signed-in [Copilot CLI](https://github.com/github/copilot-cli). Running the project uses Copilot requests. With `--host claude`, you need a signed-in [Claude Code](https://code.claude.com) 2.1.219 or later instead (experimental; see [Hosts](../../README.md#hosts)).
