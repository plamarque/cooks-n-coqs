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
  prepare)
    source_checkout=${2:-}
    [[ -n "$source_checkout" ]] || die "usage: prepare <main-checkout-path>"
    source_root=$(git -C "$source_checkout" rev-parse --show-toplevel 2>/dev/null) || die "source must be a Git checkout"
    [[ "$source_root" != "$root" ]] || die "source checkout must differ from the worktree being prepared"
    [[ "$(git -C "$source_root" branch --show-current)" == "main" ]] || die "source must be the main integration checkout"
    [[ -f "$source_root/.env" ]] || die ".env is required locally in the main integration checkout"
    cp "$source_root/.env" "$root/.env"
    chmod 600 "$root/.env"
    npm ci
    "$root/scripts/story-worktree.sh" verify
    echo "ready: $root"
    ;;
  start|start-from-head)
    mode=$1
    key=${2:-}; slug=${3:-}
    [[ -n "$key" && -n "$slug" ]] || die "usage: $mode <story-key> <slug>"
    branch_name=$(git branch --show-current)
    [[ "$branch_name" == "main" ]] || die "$mode must run from the main integration checkout, not $branch_name"
    if [[ "$mode" == "start" && -n "$(git status --porcelain)" ]]; then
      die "integration checkout must be clean; use start-from-head to create from committed HEAD without copying local changes"
    fi
    [[ -f "$root/.env" ]] || die ".env is required locally before creating a story worktree"
    target="${4:-$(dirname "$root")/$(basename "$root")-$key-$slug}"
    branch="codex/$key-$slug"
    created=false
    cleanup_failed_start() {
      if [[ "$created" == true ]]; then
        git worktree remove --force "$target" >/dev/null 2>&1 || true
        git branch -D "$branch" >/dev/null 2>&1 || true
      fi
    }
    trap cleanup_failed_start ERR
    git worktree add -b "$branch" "$target" HEAD
    created=true
    cp "$root/.env" "$target/.env"
    chmod 600 "$target/.env"
    (cd "$target" && npm ci && "$target/scripts/story-worktree.sh" verify)
    trap - ERR
    echo "ready: $target ($branch)"
    ;;
  handoff)
    key=${2:-}; slug=${3:-}
    [[ -n "$key" && -n "$slug" ]] || die "usage: handoff <story-key> <slug> -- <confirmed-path>..."
    [[ "$key" =~ ^[a-z0-9][a-z0-9-]*$ && "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]] \
      || die "story key and slug must contain only lowercase letters, digits, and hyphens"
    [[ "${4:-}" == "--" ]] || die "usage: handoff <story-key> <slug> -- <confirmed-path>..."
    shift 4
    (( $# > 0 )) || die "no confirmed paths; no worktree was created"
    branch_name=$(git branch --show-current)
    [[ "$branch_name" == "main" ]] || die "handoff must run from the main integration checkout, not $branch_name"
    [[ -f "$root/.env" ]] || die ".env is required locally before creating a story worktree"

    selected=()
    for path in "$@"; do
      [[ -n "$path" && "$path" != . && "$path" != /* && "$path" != .. && "$path" != ../* && "$path" != */.. && "$path" != */../* ]] \
        || die "confirmed paths must be relative paths inside the source checkout: $path"
      [[ -e "$root/$path" || -L "$root/$path" || -n "$(git diff --name-only HEAD -- "$path")" ]] \
        || die "confirmed path does not exist and is not a deletion: $path"
      git check-ignore -q -- "$path" && die "ignored paths cannot be handed off: $path"
      if git diff --quiet HEAD -- "$path" && ! git ls-files --others --exclude-standard -- "$path" | grep -q .; then
        die "confirmed path has no changes: $path"
      fi
      selected+=("$path")
    done

    target="$(dirname "$root")/$(basename "$root")-$key-$slug"
    branch="codex/$key-$slug"
    [[ ! -e "$target" ]] || die "target worktree path already exists: $target"
    git show-ref --verify --quiet "refs/heads/$branch" && die "branch already exists: $branch"
    patch_file=$(mktemp "${TMPDIR:-/tmp}/story-worktree-handoff.XXXXXX")
    cleanup_handoff() {
      rm -f "$patch_file"
      if [[ "${created:-false}" == true ]]; then
        git worktree remove --force "$target" >/dev/null 2>&1 || echo "story-worktree: unable to remove failed worktree: $target" >&2
        git branch -D "$branch" >/dev/null 2>&1 || echo "story-worktree: unable to remove failed branch: $branch" >&2
      fi
    }
    trap cleanup_handoff ERR EXIT
    trap 'cleanup_handoff; exit 130' HUP INT TERM
    git diff --binary HEAD -- "${selected[@]}" > "$patch_file"
    git worktree add -b "$branch" "$target" HEAD
    created=true
    if [[ -s "$patch_file" ]]; then
      git -C "$target" apply --binary "$patch_file"
    fi
    while IFS= read -r file; do
      [[ -n "$file" ]] || continue
      mkdir -p "$target/$(dirname "$file")"
      cp -P "$root/$file" "$target/$file"
    done < <(git ls-files --others --exclude-standard -- "${selected[@]}")
    cp "$root/.env" "$target/.env"
    chmod 600 "$target/.env"
    (cd "$target" && npm ci && "$target/scripts/story-worktree.sh" verify)
    trap - ERR EXIT
    rm -f "$patch_file"
    echo "ready: $target ($branch); selected paths were applied without modifying $root"
    ;;
  stop)
    target=${2:-}
    [[ -n "$target" ]] || die "usage: stop <worktree-path>"
    [[ -d "$target" ]] || die "worktree path does not exist: $target"
    echo "No worktree, branch, process, merge, push, or deployment is removed by stop."
    echo "Review and stop any runtime you started manually in: $target"
    ;;
  *) die "usage: verify | start <story-key> <slug> [path] | start-from-head <story-key> <slug> [path] | handoff <story-key> <slug> -- <confirmed-path>... | prepare <main-checkout-path> | stop <worktree-path>" ;;
esac
