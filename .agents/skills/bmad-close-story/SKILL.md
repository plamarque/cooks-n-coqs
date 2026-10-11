---
name: bmad-close-story
description: 'Runs the project closure workflow for a completed BMad story, adding the mandatory generated and validated tracker update before commit and merge. Use when the user asks to close, finish, or merge a completed story; not for a mere implementation review.'
---

# BMad closure tracker gate

Use this skill only when the user has requested closure of a completed story. Follow the repository's authoritative local-closure contract in `AGENTS.md` and `docs/DEVELOPMENT.md`: assess the story, commit, merge into `main`, verify, stop its proven runtime, and remove the merged story worktree and branch. Push and deployment remain separate authorizations.

This skill owns the missing operational gate: the tracker is part of the delivery and must be generated, validated, and committed **in the story branch before the merge**. Never hand-edit `sprint-status.yaml`.

## Before the normal commit step

1. Resolve the exact story key and its worktree. Stop if it is ambiguous, if the tracker entry does not exist, or if the current story changes cannot be separated from unrelated work.
2. Complete the closure evidence required by the project contract. A passed build alone is not evidence that the story is done.
3. From the story worktree, regenerate the tracker with only this story promoted to `done`, then validate it.

Use the authoritative epic file(s); the usual single-file invocation is:

```bash
UV_CACHE_DIR=/private/tmp/cooks-n-coqs-uv-cache uv run .agents/skills/bmad-sprint-planning/scripts/sprint_plan.py generate \
  --epic-file _bmad-output/planning-artifacts/epics.md \
  --status-file _bmad-output/implementation-artifacts/sprint-status.yaml \
  --stories-dir _bmad-output/implementation-artifacts \
  --project cooks-n-coqs --date "MM-DD-YYYY HH:MM" \
  --set "{story-key}=done"
UV_CACHE_DIR=/private/tmp/cooks-n-coqs-uv-cache uv run .agents/skills/bmad-sprint-planning/scripts/sprint_plan.py validate \
  --status-file _bmad-output/implementation-artifacts/sprint-status.yaml
```

Use every authoritative `--epic-file` when planning is sharded. Read the JSON reports and inspect the tracker diff. Stop for unresolved warnings, dropped orphans, invalid output, or any change beyond the justified status transition. If the tracker cannot be generated, follow the BMad sprint-planning repair flow; do not merge around it.

Stage the tracker explicitly with `git add -f _bmad-output/implementation-artifacts/sprint-status.yaml` alongside only the confirmed story paths. Its commit must be reachable from the merge commit.

After integration, confirm `main` contains the `done` tracker entry as part of the normal post-merge verification. Report the tracker generation/validation and any recovery separately from the closure result.

If the feature was already merged while the tracker remained stale, report a recovery rather than a successful gate. With the user's authorization, regenerate, validate, and commit the tracker on `main`; record that the pre-merge gate was missed.
