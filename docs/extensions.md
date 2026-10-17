# Writing extensions

An extension is a folder of **instructions only**: `openfleet.extension.json` plus Markdown. It may also contain JSON, text, images, `LICENSE` and similar files. Scripts, executables and symlinks are rejected at install time.

```
my-extension/
  openfleet.extension.json
  instructions.md
  report.md
```

## Manifest

```json
{
  "name": "audit",
  "version": "1.0.0",
  "description": "Summarise a finished run from events.jsonl",
  "core": ">=0.1.0 <1.0.0",
  "mode": "phase",
  "slot": "post-run",
  "instructions": "instructions.md",
  "commands": { "report": "report.md" },
  "permissions": ["read"]
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | `^[a-z0-9][a-z0-9-]*$`, unique in the workspace |
| `version` | yes | semver |
| `core` | yes | semver range of compatible `@openfleet/cli` versions. `update` disables the extension when the new core is outside the range. |
| `mode` | yes | `phase` or `augment` |
| `slot` | `phase` only | `pre-spec`, `post-plan`, `post-test` or `post-run` |
| `role` | `augment` only | `coordinator`, `planner`, `implementer` or `tester` |
| `instructions` | no | Markdown file. Default `instructions.md`. |
| `commands` | no | `{ "<command>": "<skill>.md" }`. The command name must not collide with a built-in command. |
| `permissions` | no | Subset of `read`, `write`, `shell`, `web`. `read` is always included. |

## Modes

- **phase**: the extension runs as its own agent, `openfleet:openfleet-ext-<name>`, at its slot. The coordinator runs the agents for a slot in lock-file order and logs `extension.ran`. Phase extensions are advisory: a failure is reported and never blocks the run.
- **augment**: the extension's instructions are appended to the target role's agent prompt under `## Extension: <name>`. Copilot limits an agent prompt to 30,000 characters, so keep augments short.

## Commands

Each `commands` entry becomes a skill. `npx openfleet <command> [args]` launches Copilot with the extension's agent and tells it to follow that skill, passing the arguments.

## Permissions

Permissions are mapped to Copilot tool aliases in the generated agent's `tools` allow-list:

| Permission | Tools |
|---|---|
| `read` | `read`, `search` |
| `write` | `edit` |
| `shell` | `execute` |
| `web` | `web` |

`npx openfleet add` prints the declared permissions so you can review them.

## Installing

```sh
npx openfleet add ../my-extension                       # local path
npx openfleet add https://github.com/acme/audit.git#v1  # git URL, optional #ref
npx openfleet remove audit
```

Git sources are pinned to a commit SHA in `extensions.lock.json`. Running `add` again with the same name updates the extension. Commit `openfleet/extensions/` and `openfleet/extensions.lock.json`.
