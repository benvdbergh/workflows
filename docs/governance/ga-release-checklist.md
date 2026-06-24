# GA release checklist (v1 conformance gate)

**Last reviewed:** 2026-06-24

Use this checklist when cutting a **non-alpha** release tag (`v0.y.z` without `-alpha.N`). Tag-triggered automation (`.github/workflows/release.yml`) promotes npm `latest`, docs `latest`, and creates a GitHub Release only after these gates pass on the tagged commit.

## Preflight (local, exact release commit)

```bash
npm run check-engine-schema-sync
npm run validate-workflows
npm run conformance:v1
npm run e2e:lighthouse
npm run e2e:r3
npm test
npm pack --dry-run --workspace @agent-workflow/engine
```

### v1 conformance pass criteria

`npm run conformance:v1` must:

1. Exit with code **0**
2. Emit JSON summary on stdout with `"status": "pass"` and `"profile": "v1"`
3. Pass every vector in the v1 profile (schema, replay, parity, signing under `conformance/vectors/`, plus sdk-parity-smoke and sqlite-store-smoke)
4. Fail on any `parity-pending` vector (same as full `npm run conformance` in CI)

Vectors without a `profiles` field are included in v1 (backward compatible). Future experimental vectors may set `"profiles": ["alpha-only"]` to exclude them from this gate.

### Real-path audit gate (GA preflight)

Before pushing a GA tag, confirm production-relevant execution paths are exercised (not default stub/mock-only):

- [ ] `npm run conformance:v1` passes (v1 profile conformance)
- [ ] `npm run e2e:lighthouse` passes (host-mediated activity completion)
- [ ] `npm run e2e:r3` passes (real `A2ADelegateExecutor` against mock A2A server; child `run_tests` may use in-process stub)
- [ ] `npm audit --audit-level=high` passes (mirrored in CI reusable workflow)
- [ ] `packages/engine/package.json` version matches tag base (`v0.2.0` → `0.2.0`)
- [ ] Release notes section exists for the tag
- [ ] CI green on target SHA (`Validate workflow definitions / validate-workflows`)

## Automation (tag push)

Push annotated tag `v0.y.z` on green `master`. `release.yml` runs `conformance:v1` (not full conformance) when `promote_latest` is true. Failed v1 conformance blocks npm `latest`, docs promotion, and GitHub Release creation.

| Tag pattern | Conformance in release gates | npm dist-tag |
|-------------|------------------------------|--------------|
| `v0.y.z-alpha.N` | full `npm run conformance` | `alpha` |
| `v0.y.z` | `npm run conformance:v1` | `latest` |

## Postflight

- [ ] `npm view @agent-workflow/engine@<version> version`
- [ ] Docs site shows version with `latest` alias
- [ ] `gh release view v0.y.z`
- [ ] Conformance summary JSON archived in release notes when practical

## Related docs

- [release-process.md](release-process.md) — alpha and GA automation map
- [conformance/README.md](../../conformance/README.md) — harness and profile semantics
- [migration-alpha-to-ga.md](../migration-alpha-to-ga.md) — operator migration guide
- `.claude/skills/wf-release/` — maintainer orchestration skill
