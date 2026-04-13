# Alpha CI/CD Packaging Governance

**Last reviewed:** 2026-04-13

This document defines the governed GitHub Actions release packaging path for alpha and maps workflows to required checks, permissions, and operational controls.

## 1) Workflow map (reuse strategy)

- `validate-workflows.yml` (event workflow) calls reusable workflow `.github/workflows/reusable-validate-and-test.yml`.
- `release-packaging.yml` (manual workflow) calls the same reusable workflow for quality gates, then executes package build/upload.
- Reuse model: one shared validation unit via `workflow_call` to keep gate logic and command set consistent across CI and release packaging.

## 2) Required checks mapping and stable names

For protected branch policy, keep these check names stable:

- `Validate workflow definitions / validate-workflows` (branch and PR merge gate)
- `Release packaging (manual) / release-quality-gates` (manual release evidence gate)
- `Release packaging (manual) / package-npm-artifact` (artifact generation stage)

Policy guidance:

- Treat `Validate workflow definitions / validate-workflows` as required for branch merge.
- Keep release checks non-required for day-to-day PRs; use them for release operations and audit evidence.
- If branch protection rules are updated, preserve these exact names to avoid accidental policy drift.

## 3) Permissions map (least privilege)

All workflows default to read-only repository scope:

- Workflow-level permissions:
  - `contents: read`
- Job-level deltas:
  - None beyond `contents: read`.

No job currently requires:

- `id-token: write`
- `packages: write`
- `actions: write`
- `pull-requests: write`

Because this pipeline is packaging-only and intentionally avoids auto-publish.

## 4) Gate and release path design

Release packaging uses the same core commands contributors run locally:

1. `npm run validate-workflows`
2. `npm run conformance`
3. `npm test`
4. `npm pack --dry-run`
5. `npm pack`

The release path is manual (`workflow_dispatch`) and requires an explicit `release_ref` input (tag/branch/SHA).

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
  - Manual release trigger only (no automated publish loops).
  - No broad matrix expansion.
  - Job `timeout-minutes` set on reusable and packaging jobs.
  - Concurrency for `validate-workflows` cancels superseded runs on same ref.

## 7) Manual publish handoff (explicitly out of automation)

This pipeline does **not** run `npm publish`.

Maintainer handoff after artifact creation:

1. Validate tarball contents from workflow artifact.
2. Confirm release notes and versioning policy alignment.
3. Perform manual publish from trusted maintainer environment with least-privilege npm token.
4. Record publish decision and tag/release notes update.
