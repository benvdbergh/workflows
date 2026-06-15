# Release preflight checklist

Run from repository root against the **exact commit** you intend to tag.

## 1. Target commit and CI

```bash
git fetch origin master
git log -1 --oneline origin/master
gh run list --branch master --limit 3
```

- [ ] `Validate workflow definitions / validate-workflows` **success** on target SHA
- [ ] No open release-blocking PRs for this cut

## 2. Version intent (alpha `0.y.z`)

Per `docs/releases/alpha-versioning-and-release-commit-flow.md`:

| Commit signal | Default bump |
|---------------|--------------|
| `feat` | minor `0.(y+1).0` |
| `fix` | patch `0.y.(z+1)` |
| breaking (`!`, `BREAKING CHANGE:`) | minor in pre-1.0 |
| docs/test/chore/ci only | usually no bump |

- [ ] Intended tag chosen: baseline `v0.y.z` or iteration `v0.y.z-alpha.N`
- [ ] `packages/engine/package.json` `version` matches tag **base** (`v0.1.3-alpha.2` → `0.1.3`)

## 3. Release narrative

- [ ] Section added to `docs/releases/alpha-release-notes.md` for this version/tag
- [ ] `docs/user/` updated when operator or author guidance changed
- [ ] Breaking/impact notes filled when schema or engine profile changed

## 4. Local quality gates (mirror CI)

```bash
npm run check-engine-schema-sync
npm run validate-workflows
npm run conformance
npm test
npm pack --dry-run --workspace @agent-workflow/engine
```

- [ ] All commands pass
- [ ] Schema breaking change ack present if required (`SCHEMA_BREAKING_CHANGE_ACK` or `schemas/.schema-breaking-change-ack`)

## 5. Merge hygiene

- [ ] Release commit contains version + notes (avoid unrelated changes)
- [ ] Post-merge CI green on release commit

## RC stabilization (optional)

When iteration tags need fixes without merging unfinished work from `master`:

1. `git checkout -b release/v0.y.z origin/master` at cut point
2. Cherry-pick or commit RC fixes only
3. Tag `v0.y.z-alpha.N` on branch tip
4. Merge `release/v0.y.z` back to `master` when baseline is accepted
5. Tag `v0.y.z` on merged `master` commit
