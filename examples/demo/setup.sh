#!/usr/bin/env bash
# Set up a throwaway OpenFleet demo: two toy repos (api + web) and a workspace
# that uses this checkout's local build. Usage: examples/demo/setup.sh [dir]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
TMP_BASE="${TMPDIR:-/tmp}"
DEMO_DIR="${1:-${TMP_BASE%/}/openfleet-demo}"
DEMO_DIR="${DEMO_DIR%/}"
MARKER=".openfleet-demo"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

for cmd in node git pnpm npm; do
  command -v "$cmd" >/dev/null || { echo "error: $cmd is required" >&2; exit 1; }
done

step "Building OpenFleet packages"
(cd "$REPO_ROOT" && pnpm install --frozen-lockfile --silent && pnpm -r --silent run build)

step "Preparing $DEMO_DIR"
if [ -e "$DEMO_DIR" ]; then
  if [ -f "$DEMO_DIR/$MARKER" ]; then
    # Worktrees from a previous run point back into the toy repos; just remove everything.
    rm -rf "$DEMO_DIR"
  elif [ -n "$(ls -A "$DEMO_DIR" 2>/dev/null)" ]; then
    echo "error: $DEMO_DIR exists and is not an OpenFleet demo directory; refusing to wipe it." >&2
    exit 1
  fi
fi
mkdir -p "$DEMO_DIR"
DEMO_DIR="$(cd "$DEMO_DIR" && pwd -P)"
touch "$DEMO_DIR/$MARKER"

make_repo() {
  local name="$1" dest="$DEMO_DIR/$1"
  cp -R "$HERE/template/$name" "$dest"
  git -C "$dest" init -q -b main
  git -C "$dest" add -A
  git -C "$dest" -c user.name="OpenFleet Demo" -c user.email="demo@openfleet.invalid" \
    -c commit.gpgsign=false commit -q -m "Initial commit"
  (cd "$dest" && npm test --silent >/dev/null 2>&1) || { echo "error: $name tests failed" >&2; exit 1; }
  echo "  $name: initial commit on main, tests pass"
}

step "Creating toy repos"
make_repo api
make_repo web

step "Scaffolding OpenFleet workspace (local build)"
WS="$DEMO_DIR/fleet"
# Force npm: under `pnpm demo` the inherited user agent would pick pnpm, which
# would treat the demo dir as part of this pnpm workspace.
npm_config_user_agent="npm/10" node "$REPO_ROOT/packages/create-openfleet/dist/index.js" "$WS" --cli "file:$REPO_ROOT/packages/cli" \
  >"$DEMO_DIR/setup.log" 2>&1 || { cat "$DEMO_DIR/setup.log" >&2; exit 1; }

cat >"$WS/openfleet/repos.json" <<'JSON'
{
  "v": 1,
  "repos": {
    "api": {
      "path": "../api",
      "defaultBranch": "main",
      "description": "Node HTTP service. GET /greeting returns { \"message\": \"Hello\" }.",
      "test": "npm test",
      "confirmed": true
    },
    "web": {
      "path": "../web",
      "defaultBranch": "main",
      "description": "Client that fetches GET /greeting from api and renders the message.",
      "test": "npm test",
      "confirmed": true
    }
  }
}
JSON
echo "  workspace: $WS"
echo "  repos.json pre-seeded with api and web"

PROJECT="greeting-lang"
cat <<EOF

$(printf '\033[1m')Demo ready.$(printf '\033[0m')

  Layout:
    $DEMO_DIR/api     toy API repo (git, main)
    $DEMO_DIR/web     toy client repo (git, main)
    $DEMO_DIR/fleet   OpenFleet workspace

  1. Start the run (opens Copilot CLI; answer the grill, then it runs hands-off):
       cd "$WS" && npx openfleet new $PROJECT "Add a language field to the greeting API and show it in web"

  2. Watch it from another terminal:
       cd "$WS" && npx openfleet status $PROJECT
       tail -f "$WS/openfleet/projects/$PROJECT/events.jsonl"

  3. Review the result (default completion mode stages changes, nothing is committed):
       spec, plans, contracts:  $WS/openfleet/projects/$PROJECT/
       staged diffs:            git -C "$WS/openfleet/projects/$PROJECT/worktrees/<child>" diff --cached
       full patches:            $WS/openfleet/projects/$PROJECT/patches/

  Clean up: cd "$WS" && npx openfleet clean $PROJECT --branches --force   (or re-run this script)
EOF
