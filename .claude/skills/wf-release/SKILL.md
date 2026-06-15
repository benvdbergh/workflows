---
name: wf-release
description: >-
  Orchestrates alpha release preflight, version-tag creation, and postflight
  verification for the workflows repository. Guides maintainers through
  checklist gates, tag push to trigger automated packaging/npm/docs/GitHub
  Release, and break-glass recovery. Use when cutting a release, preparing
  v0.y.z or v0.y.z-alpha.N tags, running release preflight, verifying publish
  outcomes, or recovering a failed release workflow.
license: MIT
metadata:
  author: workflows
  version: 1.0.0
---

# wf-release

**Workflows-specific release orchestration** for `@agent-workflow/engine` on `benvdbergh/workflows`. It coordinates human gates before automation and verification after tag push. It does **not** replace SemVer policy (`release-versioning`) or planning cadence (`wf-plan`).

## Project context

- **Integration branch:** `master` (CI required check: `Validate workflow definitions / validate-workflows`)
- **Release identity:** annotated git tag `v*` on a green `master` commit (or short-lived `release/v0.y.z` tip for RC iterations)
- **Automation trigger:** push tag → `.github/workflows/release.yml` (gates → pack → npm → docs → GitHub Release)
- **Break-glass:** manual `release-packaging.yml`, `release-npm-publish.yml`, `docs-publish.yml`
- **Policy docs:** `docs/releases/alpha-versioning-and-release-commit-flow.md`, `docs/releases/alpha-ci-cd-packaging-governance.md`

## Scope

### Owns

- Release preflight checklist on a target commit SHA.
- Version/tag alignment with `packages/engine/package.json`.
- Release-notes and docs readiness before tag.
- Tag creation/push instructions and postflight verification (npm, docs, GitHub Release).
- Break-glass routing when tag-triggered automation fails.

### Does not own

- SemVer interpretation or commit-convention policy (escalate to **`release-versioning`**).
- Release slice planning and milestone taxonomy (escalate to **`wf-plan`**).
- Feature implementation or PR merge hygiene (defer to **`wf-execute`**).
- CI workflow authoring standards (escalate to **`ci-cd-governance`**).

See `references/skill-escalation.md`.

## Tool usage

| Step | Tool | Purpose |
|------|------|---------|
| Preflight gates | Shell (`npm run …`) | Mirror CI quality gates locally |
| CI status | `gh run list`, `gh run view` | Confirm green on target SHA |
| Tag push | `git tag`, `git push origin` | Human release gate |
| Postflight | `gh release view`, `npm view` | Verify automation outcomes |
| Milestone close | Linear MCP (optional) | Align backlog with shipped cut |

No MCP server is required for the default release path.

## Workflow routing

### 1) Preflight (before tag)

1. Identify target commit on `master` (or `release/v0.y.z` for RC).
2. Confirm CI green on that SHA (`gh run list --branch master --limit 5`).
3. Compute intended version per alpha policy (`references/preflight-checklist.md`).
4. Verify `packages/engine/package.json` version matches tag base (e.g. tag `v0.1.3-alpha.1` → package `0.1.3`).
5. Update `docs/releases/alpha-release-notes.md` and `docs/user/` when operator guidance changes.
6. Run local gates: `check-engine-schema-sync`, `validate-workflows`, `conformance`, `test`, `npm pack --dry-run --workspace @agent-workflow/engine`.
7. Open PR for version + release notes (preferred) or confirm working tree is release-only.
8. Merge and re-confirm CI green on the release commit.

**Triggers:** "release preflight", "prepare release", "ready to cut v0.x"

### 2) Tag and publish (human gate → automation)

1. Create annotated tag on the release commit:

   ```bash
   git tag -a v0.1.3 -m "v0.1.3"
   git push origin v0.1.3
   ```

   For iteration candidates: `v0.1.3-alpha.1` (npm `alpha`, docs without `latest` promotion).

2. Monitor `.github/workflows/release.yml` (`gh run watch`).

3. Tag suffix drives automation defaults (`references/tag-and-publish.md`):
   - `v0.y.z-alpha.N` → npm `alpha`, docs version only
   - `v0.y.z` → npm `latest`, docs `latest` alias

**Triggers:** "push release tag", "cut release", "publish v0.x"

### 3) Postflight (after workflow success)

1. Verify npm: `npm view @agent-workflow/engine@<version> version`
2. Verify docs URLs in release notes template (`references/postflight-verification.md`).
3. Verify GitHub Release exists: `gh release view v0.1.3`
4. Update Linear milestone / release-close items (optional; coordinate with `wf-execute`).
5. Announce per `docs/community-launch-playbook.md` when appropriate.

**Triggers:** "verify release", "postflight", "release published?"

### 4) Break-glass recovery

If tag workflow fails or republish is needed:

1. Inspect failed job logs (`gh run view <id> --log-failed`).
2. Fix root cause on `master`, re-tag only if version was not published (npm is immutable per version).
3. Use manual workflows with explicit `release_ref` — see `references/break-glass.md`.

**Triggers:** "release failed", "republish", "manual npm publish"

## Escalation

| Trigger | Escalate to |
|---------|-------------|
| Version bump / SemVer / changelog policy | `release-versioning` |
| Release scope, milestone, carryover | `wf-plan`, `wf-execute` |
| Workflow permissions, gate design | `ci-cd-governance` |
| Community announcement templates | `docs/community-launch-playbook.md` |

## Examples

- "Run release preflight for v0.1.3 on latest master."
- "Prepare iteration tag v0.1.3-alpha.1 and list what's left before push."
- "Tag v0.1.3 was pushed — verify npm, docs, and GitHub Release."
- "Release workflow failed on publish step — triage and break-glass options."
