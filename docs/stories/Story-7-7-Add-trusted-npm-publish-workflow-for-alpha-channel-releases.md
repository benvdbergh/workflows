---
kind: story
id: STORY-7-7
title: "Add trusted npm publish workflow for alpha channel releases"
status: done
priority: high
parent: EPIC-7
depends_on:
  - STORY-7-6
traces_to:
  - path: .github/workflows/release-packaging.yml
  - path: .github/workflows/
  - path: docs/releases/alpha-versioning-and-release-commit-flow.md
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "A manual GitHub Actions publish workflow exists for npm release, separated from packaging-only workflow and guarded by existing quality gates."
  - "Publish job uses least-privilege permissions and supports npm trusted publishing with provenance."
  - "Workflow supports explicit dist-tag selection (for example `alpha` vs `latest`) and workspace-targeted publish for the engine package."
  - "Operational prerequisites and failure troubleshooting for npm publish are documented."
epic_title: "Alpha release readiness and community launch"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-7-7: Add trusted npm publish workflow for alpha channel releases

## Description

Introduce a secure GitHub Actions workflow that publishes the engine package to npm for alpha distribution, while preserving the existing packaging artifact workflow.

## User story

As a **release operator**, I want **a trusted and repeatable publish workflow** so that **I can cut alpha npm releases directly from GitHub without local secret handling**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Skill routing

Primary skill: `ci-cd-governance`.
Supporting skills: `release-versioning`, `repo-security-compliance`.

## Technical notes

- Keep packaging and publishing as separate workflows to reduce blast radius.
- Preserve stable required-check naming used by branch/ruleset governance.
- Document npm trusted-publishing setup dependencies in npm and repository settings.

## Dependencies (narrative)

**Hard:** [STORY-7-6](Story-7-6-Make-MCP-engine-package-publishable-for-no-install-consumption.md).

## Related stories

- Next: [STORY-7-8](Story-7-8-Publish-no-install-MCP-distribution-and-operator-runbook.md)

## Delivered

- Added dedicated manual publish workflow: `.github/workflows/release-npm-publish.yml`.
  - Separated publish from packaging workflow to reduce blast radius and preserve packaging-only evidence flow.
  - Reused existing reusable quality gates via `.github/workflows/reusable-validate-and-test.yml` before publish.
- Implemented trusted npm publishing controls in publish job:
  - least privilege baseline (`contents: read`) with scoped `id-token: write` only on publish job,
  - npm provenance-enabled publish using `npm publish --provenance`.
- Added explicit operator-controlled publish inputs:
  - `release_ref` (tag/branch/SHA),
  - `dist_tag` choice input constrained to `alpha` or `latest`.
- Implemented workspace-targeted publish:
  - publish command targets `@agent-workflow-protocol/engine` via npm workspace selector.
- Refreshed release governance docs for prerequisites and troubleshooting:
  - updated trusted publish path, required setup, and failure triage in `docs/releases/alpha-ci-cd-packaging-governance.md`,
  - linked trusted publish workflow into `docs/releases/alpha-versioning-and-release-commit-flow.md`.
