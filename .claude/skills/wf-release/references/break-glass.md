# Break-glass manual release workflows

Use when tag automation failed, for republish recovery, or when intentionally bypassing the orchestrator.

## Manual workflows (workflow_dispatch)

| Workflow | When |
|----------|------|
| `Release packaging (manual)` | Inspect tarball artifact only |
| `Release npm publish (manual)` | Republish or channel override with explicit `release_ref` |
| `Docs publish (manual)` | Docs-only recovery |

GitHub Actions → select workflow → **Run workflow** → set `release_ref` to tag or SHA.

## Common failures

| Symptom | Action |
|---------|--------|
| Quality gates failed on tag | Fix on `master`, new patch version, new tag (do not move tags) |
| npm "cannot publish over previously published version" | Bump version; published versions are immutable |
| `npm dist-tag add` E401 after OIDC publish | Set `NPM_TOKEN` secret or promote locally (`npm dist-tag add … latest`) |
| Docs deploy failed | Re-run `Docs publish (manual)` with same `release_ref` |
| Wrong tag pushed | Do not delete published npm versions; publish corrective version if needed |

## Re-tag policy

- **Never** force-move a tag that others may have pulled
- If tag points at wrong commit and nothing was published: delete remote tag, fix, re-push
- If npm version was published: forward-fix with a new patch version
