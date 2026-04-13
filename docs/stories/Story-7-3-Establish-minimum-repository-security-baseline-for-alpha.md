---
kind: story
id: STORY-7-3
title: "Establish minimum repository security baseline for alpha"
status: done
priority: medium
parent: EPIC-7
depends_on:
  - STORY-7-1
traces_to:
  - path: SECURITY.md
  - path: .github/
  - path: docs/brief.md
slice: horizontal
invest_check:
  independent: true
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "Security policy and vulnerability disclosure path are present and discoverable to external users."
  - "Baseline dependency and code scanning posture is documented and enabled where feasible for the current repository setup."
  - "Secret scanning and push-protection expectations are documented, including any org-level prerequisites."
  - "Accepted security gaps are explicitly listed with ownership and follow-up trigger dates."
epic_title: "Temporary alpha release readiness and community launch"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-7-3: Establish minimum repository security baseline for alpha

## Description

Deliver a practical baseline security posture suitable for a public alpha, prioritizing disclosure readiness and transparent controls over enterprise-grade completeness.

## User story

As a **potential contributor or adopter**, I want **clear security reporting and baseline protections** so that **I can evaluate project safety and report issues responsibly**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Skill routing

Primary skill: `repo-security-compliance`.

## Technical notes

- Focus on baseline presence and clarity, not full compliance depth.
- Capture org-controlled settings (for example branch rulesets or push protection) as documented prerequisites when direct repo changes are not possible.
- Keep policy language short and actionable for alpha stage.

## Dependencies (narrative)

**Hard:** [STORY-7-1](Story-7-1-Build-alpha-documentation-and-release-narrative-pack.md).

## Related stories

- Next: [STORY-7-4](Story-7-4-Implement-governed-CI-CD-npm-release-packaging-pipeline.md)

## Delivered

- Added `SECURITY.md` with external disclosure path and baseline security policy.
- Added `docs/security/alpha-security-baseline.md` documenting enabled controls, pending controls, and org prerequisites.
- Added `docs/security/security-gap-register.md` listing accepted gaps, owners, and trigger dates for review.
- Added security discoverability links in `README.md` and `docs/README.md`.
