#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/story-worktree-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

fake_bin="$tmp/bin"
mkdir -p "$fake_bin"
cat > "$fake_bin/node" <<'EOF'
#!/usr/bin/env bash
echo 99
EOF
cat > "$fake_bin/npm" <<'EOF'
#!/usr/bin/env bash
[[ "${FAIL_NPM:-}" != 1 ]]
EOF
cat > "$fake_bin/uv" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$fake_bin/node" "$fake_bin/npm" "$fake_bin/uv"

repo="$tmp/cnc"
mkdir -p "$repo/scripts" "$repo/.agents/skills/bmad-build" "$repo/.claude/skills/bmad-build-auto" "$repo/_bmad/scripts"
cp "$root/scripts/story-worktree.sh" "$repo/scripts/story-worktree.sh"
chmod +x "$repo/scripts/story-worktree.sh"
printf '99\n' > "$repo/.node-version"
printf 'fixture-secret\n' > "$repo/.env"
printf '{}\n' > "$repo/package-lock.json"
printf 'base\n' > "$repo/tracked.txt"
printf 'remove me\n' > "$repo/deleted.txt"
printf 'drafts/.env.local\n' > "$repo/.gitignore"
git -C "$repo" init -q -b main
git -C "$repo" config user.email test@example.invalid
git -C "$repo" config user.name 'Story worktree test'
git -C "$repo" add .
git -C "$repo" commit -qm fixture

printf 'changed\n' > "$repo/tracked.txt"
git -C "$repo" add tracked.txt
rm "$repo/deleted.txt"
printf 'new\n' > "$repo/new.txt"
mkdir "$repo/drafts"
printf 'keep\n' > "$repo/drafts/note.md"
printf 'never copy\n' > "$repo/drafts/.env.local"
source_status=$(git -C "$repo" status --porcelain)

(cd "$repo" && PATH="$fake_bin:$PATH" ./scripts/story-worktree.sh handoff 9-9 fixture -- tracked.txt deleted.txt new.txt drafts)

target="$tmp/cnc-9-9-fixture"
[[ -f "$target/.env" ]]
[[ "$(<"$target/tracked.txt")" == changed ]]
[[ ! -e "$target/deleted.txt" ]]
[[ "$(<"$target/new.txt")" == new ]]
[[ "$(<"$target/drafts/note.md")" == keep ]]
[[ ! -e "$target/drafts/.env.local" ]]
[[ "$(git -C "$target" status --porcelain)" == *"tracked.txt"* ]]
[[ "$(git -C "$target" status --porcelain)" == *"deleted.txt"* ]]
[[ "$(git -C "$target" status --porcelain)" == *"new.txt"* ]]
[[ "$(git -C "$repo" status --porcelain)" == "$source_status" ]]

if (cd "$repo" && PATH="$fake_bin:$PATH" ./scripts/story-worktree.sh handoff 9-10 empty -- unchanged.txt); then
  echo 'handoff with an unchanged path unexpectedly succeeded' >&2
  exit 1
fi
[[ ! -e "$tmp/cnc-9-10-empty" ]]
[[ "$(git -C "$repo" status --porcelain)" == "$source_status" ]]

if (cd "$repo" && PATH="$fake_bin:$PATH" ./scripts/story-worktree.sh handoff 9-10 root -- .); then
  echo 'handoff from checkout root unexpectedly succeeded' >&2
  exit 1
fi
[[ ! -e "$tmp/cnc-9-10-root" ]]

if (cd "$repo" && FAIL_NPM=1 PATH="$fake_bin:$PATH" ./scripts/story-worktree.sh handoff 9-11 cleanup -- tracked.txt); then
  echo 'handoff with a failed bootstrap unexpectedly succeeded' >&2
  exit 1
fi
[[ ! -e "$tmp/cnc-9-11-cleanup" ]]
! git -C "$repo" show-ref --verify --quiet refs/heads/codex/9-11-cleanup
[[ "$(git -C "$repo" status --porcelain)" == "$source_status" ]]

echo 'story-worktree handoff tests passed'
