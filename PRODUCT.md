# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, equally important:

- **Developers whose one change spans many repos.** A rename, an API change or a library swap has to land in a service, its SDKs and every client, across separate repos or packages in a monorepo. Today they make the same change by hand, repo by repo, and keep the pieces in step themselves.
- **Platform and infrastructure teams** running org-wide changes: migrations, renames, dependency upgrades and auth swaps across many repos at once.

Both want to describe the change once, settle the open questions up front, and come back to reviewed, tested work in every repo.

## Product Purpose

OpenFleet is an open-source (MIT) framework that turns one prompt into a coordinated, multi-agent change across many repos. A coordinator agent grills the user, writes a spec, then runs a planner → implementer → tester pipeline for each repo or package, in parallel, each in its own git worktree. Success is a run that ends with every repo changed, tested and ready for a person to review, with every decision recorded.

## Positioning

- **One change, many repos.** Not parallel agents inside one session and one repo: one coordinated change across many repos and packages, each isolated in its own worktree and branch.
- **The person decides only at the start.** User input happens in the grill. The approved spec starts a hands-off run that ends in `done`.
- **Every step is on the record.** An append-only `events.jsonl` attributes every action, with patches and diff snapshots, so a run can be audited, replayed and resumed.
- **Built from existing agent-CLI primitives**, not a new runtime.

## Operating Context

- Started from a terminal: `npm create @openfleet-tools` sets up a workspace, then `npx openfleet new <name>` opens the grill.
- Workspace files: `openfleet/repos.json`, `projects/<name>/spec.md`, `state.json`, `contracts/`, `plans/`, `events.jsonl`, and `worktrees/`.
- Runs finish in one of two completion modes, chosen in the grill: changes **staged** in each worktree (default) or cross-linked **draft PRs** (needs `gh`).
- Failures are recovered later with `npx openfleet resume <name>`. Worktrees and branches are removed with `npx openfleet clean <name>`.

## Capabilities and Constraints

- Packages: `@openfleet-tools/create` and `@openfleet-tools/cli`. Requires Node.js 20+ and git.
- Agents: coordinator, planner (read-only), implementer, tester (read-only on source).
- Parallel by default, honouring ordering dependencies. No concurrency cap.
- A failing test triggers up to 3 implementer retries, then one coordinator-guided attempt. After that the child is `failed`, its dependents `blocked`, and the rest of the run continues.
- Child questions go to the coordinator. It answers from the spec, or decides itself and logs an `assumption`. Contract changes are broadcast to affected repos.
- v1 testing is contract tests over shared fixtures in `contracts/`.
- Extensions are instructions that can have code attached for the agent to run. They extend the run rather than being plain prompts.
- **Agent host:** runs on GitHub Copilot CLI today, with Claude Code support planned. Public-facing surfaces (the website) stay host-neutral and do not name a host until more than one is supported. The README and docs may name Copilot as the current requirement.
- Website: static HTML in `site/`, deployed to GitHub Pages at openfleet.tools by GitHub Actions. Browser JavaScript stays inline in the HTML. Every file must pass the repo's Prettier check.

## Brand Commitments

- Name: **OpenFleet**. Domain openfleet.tools. npm scope `@openfleet-tools`.
- Open source, MIT licensed.
- Terminology used consistently: **project** (a unit of work), **repo / package** (a code target), **coordinator**, **planner**, **implementer**, **tester**, **grill**, **spec**, **contract**, **assumption**, **worktree**, **run**.
- Voice: plain, specific and technical. Name real commands, files and events rather than abstract benefits.

## Evidence on Hand

- The code, the docs (`docs/design.md`, `docs/events.md`, `docs/extensions.md`, `docs/flow.mmd`) and the toy example in `examples/demo` (`pnpm demo`).
- The website's account-id example run is mocked and is labelled illustrative on the page.
- **No users, GitHub stars, testimonials, logos, benchmarks or case studies exist yet.** Do not invent or imply any. Any example run that is not a real recorded run must say it is illustrative.

## Product Principles

1. **One prompt, coordinated work.** The product earns its place by making many repos move as one change. Lead with the coordination, not the individual agents.
2. **Decide up front, then hands-off.** Put every question to the user in the grill. Never design flows that interrupt a running fleet.
3. **Show the record.** Events, specs, contracts and diffs are the proof. Prefer showing real artefacts and real commands over claims.
4. **Review stays human.** Runs end staged or as draft PRs. Nothing merges without a person.
5. **Honest about scope.** State what is mocked, what is planned and what is not yet supported.
