# Alpha CI/CD Packaging Governance

**Last reviewed:** 2026-04-13

This document defines the governed GitHub Actions release packaging and publish paths for alpha, and maps workflows to required checks, permissions, and operational controls.

## 1) Workflow map (reuse strategy)

- `validate-workflows.yml` (event workflow) calls reusable workflow `.github/workflows/reusable-validate-and-test.yml`.
- `release-packaging.yml` (manual workflow) calls the same reusable workflow for quality gates, then executes package build/upload.
- `release-npm-publish.yml` (manual workflow) calls the same reusable workflow for quality gates, then performs trusted npm publish for `@agent-workflow/engine`.
- Reuse model: one shared validation unit via `workflow_call` to keep gate logic and command set consistent across CI and release packaging.

## 2) Required checks mapping and stable names

For protected branch policy, keep these check names stable:

- `Validate workflow definitions / validate-workflows` (branch and PR merge gate)
- `Release packaging (manual) / release-quality-gates` (manual release evidence gate)
- `Release packaging (manual) / package-npm-artifact` (artifact generation stage)
- `Release npm publish (manual) / release-quality-gates` (manual publish evidence gate)
- `Release npm publish (manual) / publish-engine-package` (trusted publish stage)

Policy guidance:

- Treat `Validate workflow definitions / validate-workflows` as required for branch merge.
- Keep release checks non-required for day-to-day PRs; use them for release operations and audit evidence.
- If branch protection rules are updated, preserve these exact names to avoid accidental policy drift.

## 3) Permissions map (least privilege)

All workflows default to read-only repository scope unless a job has an explicit exception:

- Workflow-level permissions:
  - `contents: read`
- Job-level deltas:
  - `release-npm-publish.yml` publish job adds `id-token: write` for npm trusted publishing provenance.

No job currently requires:

- `packages: write`
- `actions: write`
- `pull-requests: write`

`id-token: write` is only granted to the publish job that performs npm OIDC trusted publishing with `--provenance`.

## 4) Gate and release path design

Release packaging and publish reuse the same core quality gate commands contributors run locally:

1. `npm run validate-workflows`
2. `npm run conformance`
3. `npm test`
4. `npm pack --dry-run`
5. `npm pack`

The release path is manual (`workflow_dispatch`) and requires an explicit `release_ref` input (tag/branch/SHA).
The publish path is also manual (`workflow_dispatch`) and requires both explicit `release_ref` and `dist_tag` (`alpha`/`latest`) inputs.

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
  - Manual release/publish triggers only (no automated publish loops).
  - No broad matrix expansion.
  - Job `timeout-minutes` set on reusable, packaging, and publish jobs.
  - Concurrency for `validate-workflows` cancels superseded runs on same ref.

## 7) Trusted publish path (manual, in automation)

Publishing is performed by `release-npm-publish.yml` and is intentionally separated from packaging.

Publish workflow prerequisites:

1. npm package `@agent-workflow/engine` is configured for public publish (`publishConfig.access=public`).
2. npm trusted publishing is configured for this repository and package in npm settings.
3. Release operator has repository rights to dispatch manual workflows.
4. Intended version has not already been published for the selected dist-tag.
5. Published package `package.json` includes `repository.url` matching the GitHub repo used for trusted publishing (npm validates this when using `--provenance`; an empty or wrong URL yields `E422`).

Trusted publish runbook:

1. Trigger `Release npm publish (manual)` with:
   - `release_ref`: intended tag/branch/SHA
   - `dist_tag`: `alpha` for channel builds, `latest` for accepted baseline promotions
2. Confirm `release-quality-gates` passes.
3. Verify `publish-engine-package` success and capture npm publish logs in release evidence.
4. Update release notes/tag metadata with published version and dist-tag.

Troubleshooting quick reference:

- `E401`/`E403` from `npm publish`:
  - Check npm trusted publishing linkage and repository/package mapping in npm settings.
  - Confirm workflow publish job still has `id-token: write`.
- `cannot publish over previously published version`:
  - Bump `packages/engine/package.json` version and retag per versioning policy.
- Wrong channel published:
  - Confirm `dist_tag` selection at dispatch; use `alpha` for pre-release iterations and reserve `latest` for approved baseline.
