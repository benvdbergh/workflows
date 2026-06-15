# Tag push and automated publish

## Human gate: annotated tag

```bash
# Baseline alpha cut
git tag -a v0.1.3 -m "v0.1.3"
git push origin v0.1.3

# Iteration candidate
git tag -a v0.1.3-alpha.1 -m "v0.1.3-alpha.1"
git push origin v0.1.3-alpha.1
```

Use `-s` instead of `-a` when GPG-signed tags are required by branch policy.

## Automation: `release.yml`

Trigger: `push` tags matching `v*`.

| Job | Purpose |
|-----|---------|
| `resolve-release` | Derive `dist_tag`, `promote_latest`, base version from tag |
| `release-quality-gates` | Reusable validate/conformance/test |
| `package-npm-artifact` | `npm pack` artifact upload |
| `publish-engine-package` | OIDC `npm publish` (skips if version already on registry) |
| `publish-github-pages` | mike deploy to `gh-pages` |
| `create-github-release` | GitHub Release with notes excerpt |

## Tag → channel defaults

| Tag pattern | npm dist-tag | Docs `latest` alias |
|-------------|--------------|---------------------|
| `v0.y.z-alpha.N` | `alpha` | no (version-only deploy) |
| `v0.y.z` (baseline) | `latest` | yes |

## Monitor

```bash
gh run list --workflow release.yml --limit 3
gh run watch
```

## Preconditions enforced in CI

- Tag base version must equal `packages/engine/package.json` version
- Quality gates must pass before publish jobs run
- npm publish skipped when `@agent-workflow/engine@<version>` already exists (idempotency)
