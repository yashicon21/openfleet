# @openfleet-tools/create

## 0.3.0

### Minor Changes

- [#14](https://github.com/yashicon21/openfleet/pull/14) [`0807b15`](https://github.com/yashicon21/openfleet/commit/0807b159bc239a225b38f0faf4136591e780a052) Thanks [@yashicon21](https://github.com/yashicon21)! - Plan every child up front behind a `plans-ready` gate with a cross-plan consistency check, add optional baseline tests that pass on the unchanged code and stay protected, copy local env files into worktrees (`copyFiles`, never committed or logged), give each child its own port range, and add the `plans-ready` and `pre-implement` extension slots.

- [#19](https://github.com/yashicon21/openfleet/pull/19) [`40896ed`](https://github.com/yashicon21/openfleet/commit/40896ede2ae5f76d9e1c3502f7bd49f2090c4ef1) Thanks [@yashicon21](https://github.com/yashicon21)! - Add path-scoped children and repo coordinators: a repo can have many children (`<repo>/<unit>` with `paths`), run by a repo coordinator that merges them into one integration branch and opens one PR per repo. Adds `claim` (workspace-wide `maxParallel`), `ack`, `scope --check`, `merge` and `escalate`, repo-level and child-level `dependsOn`, and a `repo-coordinator` extension role.

## 0.2.0

### Minor Changes

- [#11](https://github.com/yashicon21/openfleet/pull/11) [`3af02ac`](https://github.com/yashicon21/openfleet/commit/3af02ac0a77ab2c241680eb68ebf9c7bd56e163b) Thanks [@yashicon21](https://github.com/yashicon21)! - Add extension manifest v2: multiple `phases` and `augments` per extension, blocking phases with one retry, `when.files` conditions, timeouts, report `outputs` injected into dependent children as "Upstream outputs", mid-run PRs via a `prUrl` output, `followUps`, and per-workspace `settings` in `openfleet/extensions.config.json`. Version 1 manifests are rejected with their v2 equivalent.

## 0.1.1

### Patch Changes

- [#6](https://github.com/yashicon21/openfleet/pull/6) [`5b05b27`](https://github.com/yashicon21/openfleet/commit/5b05b275de4acadf558221285e7553803149f42a) Thanks [@yashicon21](https://github.com/yashicon21)! - Add package READMEs for npm.

## 0.1.0

### Minor Changes

- [#2](https://github.com/yashicon21/openfleet/pull/2) [`ac32d3c`](https://github.com/yashicon21/openfleet/commit/ac32d3cd5081692ee725a0b4f2bde0cc2f94e412) Thanks [@yashicon21](https://github.com/yashicon21)! - Initial release of OpenFleet: coordinate one change across many repos with GitHub Copilot CLI.
