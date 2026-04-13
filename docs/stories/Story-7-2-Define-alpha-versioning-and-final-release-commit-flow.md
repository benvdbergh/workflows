---
kind: story
id: STORY-7-2
title: "Define alpha versioning and final release commit flow"
status: done
priority: high
parent: EPIC-7
depends_on:
  - STORY-7-1
traces_to:
  - path: package.json
  - path: package-lock.json
  - path: docs/brief.md
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "A documented alpha SemVer policy is defined for this repository, including pre-1.0 bump interpretation and release channels."
  - "Commit convention guidance maps commit types to release outcomes and identifies no-release categories."
  - "A final release commit checklist is written, including validation/conformance prerequisites and artifact verification steps."
  - "Release notes template and changelog workflow are defined for repeatable future alpha iterations."
epic_title: "Temporary alpha release readiness and community launch"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-7-2: Define alpha versioning and final release commit flow

## Description

Establish a lightweight but explicit release governance path so alpha tags and release commits are predictable, auditable, and easy to execute repeatedly.

## User story

As a **release owner**, I want **a clear versioning and release-commit process** so that **each alpha cut communicates change impact and can be reproduced without tribal knowledge**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Skill routing

Primary skill: `release-versioning`.

## Technical notes

- Prefer process clarity over heavy automation for the first alpha, but keep the format compatible with later release tooling adoption.
- Align release commit prerequisites with existing conformance and workflow validation commands.
- Keep release notes focused on externally visible behavior and known constraints.

## Dependencies (narrative)

**Hard:** [STORY-7-1](Story-7-1-Build-alpha-documentation-and-release-narrative-pack.md).

## Related stories

- Next: [STORY-7-4](Story-7-4-Implement-governed-CI-CD-npm-release-packaging-pipeline.md)

## Delivered

- Added `docs/releases/alpha-versioning-and-release-commit-flow.md` defining pre-1.0 SemVer policy and alpha channels.
- Added commit-type to release-bump mapping with explicit no-release defaults for low-impact categories.
- Added final release-commit checklist covering workflow validation, conformance, tests, and package verification.
- Added repeatable release notes/changelog template and linked it from release docs navigation.
