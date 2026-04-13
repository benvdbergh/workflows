---
kind: epic
id: EPIC-7
title: "Alpha release readiness and community launch"
status: draft
priority: high
parent: ""
depends_on:
  - EPIC-5
  - EPIC-6
traces_to:
  - path: docs/brief.md
  - path: docs/RFC/rfc-08-reference-implementation.md
  - path: packages/engine/README.md
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: false
  testable: true
acceptance_criteria:
  - "Repository-facing docs are launch-ready: clear value proposition, quickstart, alpha caveats, release notes, and contribution/support paths."
  - "A documented alpha release policy exists with SemVer mapping, commit convention guidance, and a repeatable checklist for creating the release commit and tags."
  - "Minimum open-source security baseline is present (security policy, disclosure path, dependency/code scanning posture, and documented accepted gaps)."
  - "CI/CD can produce and validate npm release artifacts through a governed pipeline with least privilege and stable required checks."
  - "Community-sharing package is prepared with target channels, posting message templates, maintainer response expectations, and feedback intake flow."
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Epic-7: Temporary alpha release readiness and community launch

## Description

Prepare the POC repository for a public alpha share-out by tightening docs and release notes, codifying release commit/versioning behavior, establishing baseline security and CI/CD governance, and packaging community launch operations.

## Objectives

- Make the repo trustworthy and understandable to first-time external readers.
- Ensure alpha releases are reproducible, governed, and low-friction to execute.
- Protect early adopters and maintainers with baseline security posture and clear support boundaries.
- Enable confident sharing in open-source channels with structured feedback loops.

## User stories (links)

- [STORY-7-1: Build alpha documentation and release narrative pack](../stories/Story-7-1-Build-alpha-documentation-and-release-narrative-pack.md)
- [STORY-7-2: Define alpha versioning and final release commit flow](../stories/Story-7-2-Define-alpha-versioning-and-final-release-commit-flow.md)
- [STORY-7-3: Establish minimum repository security baseline for alpha](../stories/Story-7-3-Establish-minimum-repository-security-baseline-for-alpha.md)
- [STORY-7-4: Implement governed CI/CD npm release packaging pipeline](../stories/Story-7-4-Implement-governed-CI-CD-npm-release-packaging-pipeline.md)
- [STORY-7-5: Prepare community launch playbook and channel rollout](../stories/Story-7-5-Prepare-community-launch-playbook-and-channel-rollout.md)
- [STORY-7-6: Make MCP engine package publishable for no-install consumption](../stories/Story-7-6-Make-MCP-engine-package-publishable-for-no-install-consumption.md)
- [STORY-7-7: Add trusted npm publish workflow for alpha channel releases](../stories/Story-7-7-Add-trusted-npm-publish-workflow-for-alpha-channel-releases.md)
- [STORY-7-8: Publish no-install MCP distribution and operator runbook](../stories/Story-7-8-Publish-no-install-MCP-distribution-and-operator-runbook.md)

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Dependencies (narrative)

- **EPIC-5:** conformance must remain a release gate before public alpha packaging.
- **EPIC-6:** lighthouse demo assets are core launch proof points for forum sharing.

Initial sequence completed: **7-1 -> 7-2 -> 7-3 -> 7-4 -> 7-5**.
No-install publication extension sequence: **7-6 -> 7-7 -> 7-8**.

## Related sources (PRD, ADR, specs)

- [Project brief](../brief.md)
- [Reference implementation](../RFC/rfc-08-reference-implementation.md)
- [Engine package README](../../packages/engine/README.md)

## Outcome

- Launch-facing docs and release narrative are in place (`README.md`, `docs/README.md`, release docs).
- Alpha versioning and release-commit governance is documented and reusable.
- Baseline security posture and disclosure/gap tracking are established.
- CI/CD includes governed npm packaging workflow plus reusable quality gates.
- Community launch playbook, support boundaries, and contributor intake/triage flows are published.
- No-install packaging and trusted publish track is planned under stories 7-6 through 7-8.

