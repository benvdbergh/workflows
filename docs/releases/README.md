# Release process (alpha)

**Last reviewed:** 2026-06-15

Governed release path for `@agent-workflow/engine` from `benvdbergh/workflows`.

## Quick path

1. **Preflight** — `.claude/skills/wf-release/` (`references/preflight-checklist.md`)
2. **Merge** version + release notes to `master`; CI green
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

## Related docs

- [alpha-versioning-and-release-commit-flow.md](alpha-versioning-and-release-commit-flow.md) — SemVer, checklist, release notes template
- [alpha-ci-cd-packaging-governance.md](alpha-ci-cd-packaging-governance.md) — workflow permissions, check names, troubleshooting
- [alpha-release-notes.md](alpha-release-notes.md) — shipped version history
