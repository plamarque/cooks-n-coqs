#!/usr/bin/env bash
set -euo pipefail

die() { echo "story-worktree: $*" >&2; exit 1; }

root=$(git rev-parse --show-toplevel 2>/dev/null) || die "run inside the integration checkout"
command -v uv >/dev/null || die "uv is required to render BMAD workflows"
expected=$(tr -d '[:space:]' < "$root/.node-version")
if [[ -x "/opt/homebrew/opt/node@$expected/bin/node" ]]; then
  export PATH="/opt/homebrew/opt/node@$expected/bin:$PATH"
fi
actual=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)
[[ "$actual" == "$expected" ]] || die "Node $expected is required; active Node is ${actual:-unavailable}"

render() {
  local skill=$1
  uv run --no-cache "$root/_bmad/scripts/render_skill.py" --project-root "$root" --skill "$skill"
}

case "${1:-}" in
  verify)
    [[ -f "$root/.env" ]] || die ".env is required locally for a runnable story worktree"
    [[ -f "$root/package-lock.json" ]] || die "package-lock.json is missing"
    render "$root/.agents/skills/bmad-build"
    render "$root/.claude/skills/bmad-build-auto"
    ;;
  start)
    key=${2:-}; slug=${3:-}
    [[ -n "$key" && -n "$slug" ]] || die "usage: start <story-key> <slug>"
    [[ -z "$(git status --porcelain)" ]] || die "integration checkout must be clean"
    [[ -f "$root/.env" ]] || die ".env is required locally before creating a story worktree"
    target="${4:-$(dirname "$root")/$(basename "$root")-$key-$slug}"
    branch="codex/$key-$slug"
    git worktree add -b "$branch" "$target" HEAD
    cp "$root/.env" "$target/.env"
    chmod 600 "$target/.env"
    (cd "$target" && npm ci && "$target/scripts/story-worktree.sh" verify)
    echo "ready: $target ($branch)"
    ;;
  stop)
    target=${2:-}
    [[ -n "$target" ]] || die "usage: stop <worktree-path>"
    [[ -d "$target" ]] || die "worktree path does not exist: $target"
    echo "No worktree, branch, process, merge, push, or deployment is removed by stop."
    echo "Review and stop any runtime you started manually in: $target"
    ;;
  *) die "usage: verify | start <story-key> <slug> [path] | stop <worktree-path>" ;;
esac
