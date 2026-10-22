# @openfleet-tools/create

Set up an [OpenFleet](https://openfleet.tools) workspace. OpenFleet coordinates one change across many repos with [GitHub Copilot CLI](https://github.com/github/copilot-cli).

## Usage

```sh
npm create @openfleet-tools@latest [dir]   # or: npx @openfleet-tools/create [dir]
```

This creates `package.json` in `dir` (default: the current directory) if it's missing, installs [`@openfleet-tools/cli`](https://www.npmjs.com/package/@openfleet-tools/cli) as a dev dependency with your package manager, and runs `openfleet init`.

| Option           | What it does                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `--cli <spec>`   | Version or spec of `@openfleet-tools/cli` to install, e.g. `0.2.0` or `file:../openfleet/packages/cli`. Default: `^<this package's version>` |
| `--skip-install` | Only create `package.json`; don't install the CLI or run `openfleet init`                                                                    |

With `npm create`, pass options after `--`: `npm create @openfleet-tools@latest my-fleet -- --cli 0.2.0`.

Then start a project:

```sh
npx openfleet new <name> "<what you want to change>"
```

See [`@openfleet-tools/cli`](https://www.npmjs.com/package/@openfleet-tools/cli) and the [repository](https://github.com/yashicon21/openfleet) for the full guide.

## License

[MIT](https://github.com/yashicon21/openfleet/blob/main/LICENSE)
