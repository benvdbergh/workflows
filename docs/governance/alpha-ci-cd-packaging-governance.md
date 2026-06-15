# Alpha CI/CD Packaging Governance

**Last reviewed:** 2026-06-15

This document defines the governed GitHub Actions release packaging and publish paths for alpha, and maps workflows to required checks, permissions, and operational controls.

## 1) Workflow map (reuse strategy)

- `validate-workflows.yml` (event workflow) calls reusable workflow `.github/workflows/reusable-validate-and-test.yml` on every **push**, on **pull_request** to `main`/`master`, **merge_group**, and **workflow_dispatch**.
- **`release.yml` (primary path)** runs on **push** of tags matching `v*`. Orchestrates quality gates, package artifact upload, trusted npm publish, GitHub Pages docs deploy, and GitHub Release creation. Maintainer gate is **annotated tag push** on a green `master` commit (see `.claude/skills/wf-release/` and [alpha-versioning-and-release-commit-flow.md](alpha-versioning-and-release-commit-flow.md)).
- `release-packaging.yml` (**break-glass** manual workflow) calls the same reusable workflow for quality gates, then executes package build/upload.
- `release-npm-publish.yml` (**break-glass** manual workflow) calls the same reusable workflow for quality gates, then performs trusted npm publish for `@agent-workflow/engine`.
- `docs-publish.yml` (**break-glass** manual workflow) optionally runs quality gates, builds end-user docs from `docs/user/`, and deploys versioned GitHub Pages via `mike` to the `gh-pages` branch.
- Reuse model: one shared validation unit via `workflow_call` to keep gate logic and command set consistent across CI and release packaging.

## 2) Required checks mapping and stable names

For protected branch policy, keep these check names stable:

- `Validate workflow definitions / validate-workflows` (branch and PR merge gate)
- `Release (tag) / release-quality-gates` (tag-triggered release evidence gate)
- `Release (tag) / package-npm-artifact` (tag-triggered artifact generation)
- `Release (tag) / publish-engine-package` (tag-triggered trusted publish)
- `Release (tag) / publish-github-pages` (tag-triggered docs deploy)
- `Release (tag) / create-github-release` (GitHub Release for tag)
- `Release packaging (manual) / release-quality-gates` (break-glass release evidence gate)
- `Release packaging (manual) / package-npm-artifact` (break-glass artifact generation)
- `Release npm publish (manual) / release-quality-gates` (break-glass publish evidence gate)
- `Release npm publish (manual) / publish-engine-package` (break-glass trusted publish)

Policy guidance:

- Treat `Validate workflow definitions / validate-workflows` as required for branch merge.
- Tag-triggered release checks are evidence for shipped versions; keep them non-required for day-to-day PRs.
- Manual release checks remain for break-glass recovery only.
- If branch protection rules are updated, preserve these exact names to avoid accidental policy drift.

## 3) Permissions map (least privilege)

All workflows default to read-only repository scope unless a job has an explicit exception:

- Workflow-level permissions:
  - `contents: read`
- Job-level deltas:
  - `release.yml` `publish-engine` job adds `id-token: write` for npm trusted publishing provenance.
  - `release.yml` `publish-docs` and `create-github-release` jobs add `contents: write` for `gh-pages` deploy and GitHub Release creation.
  - `release-npm-publish.yml` publish job adds `id-token: write` for npm trusted publishing provenance (break-glass).

No job currently requires:

- `packages: write`
- `actions: write`
- `pull-requests: write`

`id-token: write` is only granted to the publish job that performs npm OIDC trusted publishing with `--provenance`.

## 4) Gate and release path design

Release packaging and publish reuse the same core quality gate commands contributors run locally:

1. `npm run check-schema-breaking-change` (PR/push; ack via `SCHEMA_BREAKING_CHANGE_ACK` or `schemas/.schema-breaking-change-ack`)
2. `npm audit --audit-level=high`
3. `npm run check-threat-model-touch` (when MCP/walker sensitive paths change)
4. `npm run validate-workflows`
5. `npm run conformance`
6. `npm test`
4. `npm pack --dry-run`
5. `npm pack`

**Primary release path:** push annotated tag `v*` → `release.yml` runs on that ref. Tag suffix selects defaults:

| Tag pattern | npm dist-tag | Docs `latest` alias |
|-------------|--------------|---------------------|
| `v0.y.z-alpha.N` | `alpha` | no |
| `v0.y.z` (baseline) | `latest` | yes |

Enforced in CI: tag base version must match `packages/engine/package.json` version; npm publish is skipped when the version already exists on the registry (idempotency).

**Break-glass path:** manual `workflow_dispatch` on packaging/publish/docs workflows with explicit `release_ref` (and `dist_tag` for npm publish).

## 5) Action pinning inventory

Current action dependencies:

- `actions/checkout@v5` (GitHub-maintained)
- `actions/setup-node@v5` (GitHub-maintained)
- `actions/upload-artifact@v4` (GitHub-maintained)

Third-party action usage:

- None.

Pinning policy status:

- Third-party pinning requirement is satisfied (no third-party actions used).
- Full SHA pinning for GitHub-maintained actions is preferred but not yet enforced in this repository; major-version pinning is currently used for maintainability and upstream security patch intake.

## 6) Retention, cache, and cost controls (alpha cadence)

- Artifact retention: default 7 days for release package artifacts (`artifact_retention_days`, override allowed at dispatch).
  - Rationale: alpha cadence favors short-lived verification artifacts over long-term storage.
- Cache strategy: `setup-node` npm cache enabled.
  - Rationale: lower install time and runner minutes while keeping lockfile-resolved installs via `npm ci`.
- Cost controls:
  - Tag-triggered release runs only when maintainers push `v*` tags (human gate).
  - Manual workflows reserved for break-glass (no unattended publish loops).
  - No broad matrix expansion.
  - Job `timeout-minutes` set on reusable, packaging, and publish jobs.
  - Concurrency for `validate-workflows` cancels superseded runs on same ref.

## 7) Trusted publish path (tag-triggered, with break-glass)

Publishing is performed by `release.yml` on tag push. Break-glass republish uses `release-npm-publish.yml`.

Publish prerequisites:

1. npm package `@agent-workflow/engine` is configured for public publish (`publishConfig.access=public`).
2. npm trusted publishing is configured for this repository and package in npm settings.
3. Release operator has repository rights to dispatch manual workflows.
4. Intended version has not already been published for the selected dist-tag.
5. Published package `package.json` includes `repository.url` matching the GitHub repo used for trusted publishing (npm validates this when using `--provenance`; an empty or wrong URL yields `E422`).

Trusted publish runbook (primary):

1. Complete preflight per `.claude/skills/wf-release/` and [alpha-versioning-and-release-commit-flow.md](alpha-versioning-and-release-commit-flow.md).
2. Push annotated tag (`v0.y.z` or `v0.y.z-alpha.N`) on the release commit.
3. Confirm `Release (tag)` workflow jobs succeed (`release-quality-gates`, `publish-engine-package`, `publish-github-pages`, `create-github-release`).
4. Postflight: verify npm version, docs URLs, and GitHub Release body.

Break-glass: trigger `Release npm publish (manual)` with explicit `release_ref` and `dist_tag` when tag automation failed or channel override is required.

Troubleshooting quick reference:

- `E401`/`E403` from `npm publish`:
  - Check npm trusted publishing linkage and repository/package mapping in npm settings.
  - Confirm workflow publish job still has `id-token: write`.
- `cannot publish over previously published version`:
  - Bump `packages/engine/package.json` version and retag per versioning policy.
- Wrong channel published:
  - Confirm `dist_tag` selection at dispatch; use `alpha` for pre-release iterations and reserve `latest` for approved baseline.
- Publish step succeeds but **latest dist-tag** step fails (`E401`):
  - **Cause:** `npm publish --provenance` uses OIDC; `npm dist-tag add` often does not reuse that session in a later step.
  - **Fix (CI):** re-dispatch with repository secret **`NPM_TOKEN`** (npm automation token with publish rights) set, `also_point_latest_dist_tag` true, and `dist_tag` `alpha`; or set `dist_tag` to **`latest`** on publish (no separate promotion).
  - **Fix (local):** after publish, run `npm dist-tag add @agent-workflow/engine@<version> latest` while logged in as a maintainer (`npm login`).
- Combined-step ambiguity:
  - Publish and `latest` pointer are separate steps so logs show whether `npm publish` or `npm dist-tag add` failed ([workflow](https://github.com/benvdbergh/workflows/blob/master/.github/workflows/release-npm-publish.yml)).
