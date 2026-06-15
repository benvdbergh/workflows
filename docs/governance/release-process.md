# Release process (alpha)

**Last reviewed:** 2026-06-16

Governed release path for `@agent-workflow/engine` from `benvdbergh/workflows`.

## Quick path

1. **Preflight** — `.claude/skills/wf-release/` (`references/preflight-checklist.md`)
2. **Merge** version + changelog to `master`; CI green
3. **Tag** — `git tag -a v0.y.z -m "v0.y.z" && git push origin v0.y.z`
4. **Automation** — `.github/workflows/release.yml` runs on tag push
5. **Postflight** — verify npm, docs, GitHub Release (`wf-release` postflight)

## Automation map

| Trigger | Workflow | Result |
|---------|----------|--------|
| Push tag `v*` | `release.yml` | Gates → tarball artifact → npm → docs → GitHub Release |
| Manual dispatch | `release-packaging.yml` | Break-glass pack only |
| Manual dispatch | `release-npm-publish.yml` | Break-glass npm publish |
| Manual dispatch | `docs-publish.yml` | Break-glass docs deploy |

## Tag → channel defaults

| Tag | npm | Docs |
|-----|-----|------|
| `v0.y.z-alpha.N` | `alpha` | version deploy only |
| `v0.y.z` | `latest` | `latest` alias updated |

## Incident and rollback

If an alpha release is broken or mislabeled: stop promotion, document the impacted version in the [changelog](../releases/alpha-release-notes.md), deprecate or supersede on npm if needed, and run `wf-release` postflight checks before announcing a replacement.

## Related docs

- [alpha-versioning-and-release-commit-flow.md](alpha-versioning-and-release-commit-flow.md) — SemVer, checklist, changelog template
- [alpha-ci-cd-packaging-governance.md](alpha-ci-cd-packaging-governance.md) — workflow permissions, check names, troubleshooting
- [alpha-release-notes.md](../releases/alpha-release-notes.md) — shipped version history (feeds GitHub Releases)
