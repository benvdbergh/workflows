---
kind: story
id: STORY-7-4
title: "Implement governed CI/CD npm release packaging pipeline"
status: done
priority: high
parent: EPIC-7
depends_on:
  - STORY-7-2
  - STORY-7-3
  - STORY-5-5
traces_to:
  - path: .github/workflows/
  - path: packages/engine/package.json
  - path: docs/brief.md
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: false
  testable: true
acceptance_criteria:
  - "GitHub Actions release workflow for npm packaging is documented and implemented with least-privilege permissions."
  - "Release pipeline defines stable required check names and integrates existing validation/conformance gates before publish steps."
  - "Action dependencies are pinned and reuse strategy (`workflow_call` or shared jobs) is documented for maintainability."
  - "Artifact retention, caching, and cost controls are explicitly configured and justified for alpha cadence."
epic_title: "Temporary alpha release readiness and community launch"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-7-4: Implement governed CI/CD npm release packaging pipeline

## Description

Create a secure, repeatable release packaging path in CI/CD that builds and verifies npm artifacts under governance controls suitable for public alpha distribution.

## User story

As a **maintainer**, I want **a governed release pipeline for npm artifacts** so that **alpha packages can be created consistently with clear controls and minimal manual risk**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Skill routing

Primary skill: `ci-cd-governance`.

## Technical notes

- Keep governance outputs explicit: permission map, action pinning inventory, and required-check mapping.
- Ensure release packaging consumes the same test/validation commands contributors run locally.
- Avoid introducing privileged publish paths that bypass branch protections.

## Dependencies (narrative)

**Hard:** [STORY-7-2](Story-7-2-Define-alpha-versioning-and-final-release-commit-flow.md), [STORY-7-3](Story-7-3-Establish-minimum-repository-security-baseline-for-alpha.md), [STORY-5-5](Story-5-5-Wire-conformance-suite-into-CI-with-coverage-matrix-and-deferral-register.md).

## Delivered

- Added reusable CI quality-gate workflow at `.github/workflows/reusable-validate-and-test.yml` and rewired `.github/workflows/validate-workflows.yml` to consume it via `workflow_call`.
- Added manual-only governed release packaging workflow at `.github/workflows/release-packaging.yml` with explicit quality gates (`validate-workflows`, `conformance`, `test`) before `npm pack`.
- Added governance documentation at `docs/releases/alpha-ci-cd-packaging-governance.md` including workflow map, least-privilege permissions map, stable required-check names, action pinning inventory, and retention/cache/cost control rationale.
- Updated release/versioning/security/index documentation to reference governed packaging and manual handoff model (`README.md`, `docs/README.md`, `docs/releases/alpha-versioning-and-release-commit-flow.md`, `docs/security/alpha-security-baseline.md`).

## Related stories

- Next: [STORY-7-5](Story-7-5-Prepare-community-launch-playbook-and-channel-rollout.md)
