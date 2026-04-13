---
kind: story
id: STORY-7-1
title: "Build alpha documentation and release narrative pack"
status: done
priority: high
parent: EPIC-7
depends_on:
  - STORY-6-3
traces_to:
  - path: README.md
  - path: docs/architecture/lighthouse-mcp-host-guided-demo-walkthrough.md
  - path: docs/brief.md
slice: vertical
invest_check:
  independent: true
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "README and docs IA clearly separate quickstart/onboarding from deep architecture and operations content."
  - "Alpha release notes are drafted with user-visible highlights, known limitations, and upgrade/usage caveats."
  - "Repository discoverability metadata checklist is completed (description/topics/social preview tracked even if applied outside repo files)."
  - "Core docs include explicit freshness markers (last reviewed date and cadence guidance)."
epic_title: "Temporary alpha release readiness and community launch"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-7-1: Build alpha documentation and release narrative pack

## Description

Harden the repository's documentation surface so external readers can quickly understand value, run the POC, and evaluate alpha readiness without internal context.

## User story

As a **new external evaluator**, I want **clear alpha-ready documentation and release notes** so that **I can validate what works today, what is deferred, and how to get started quickly**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Skill routing

Primary skill: `repo-docs`.

## Technical notes

- Reuse existing architecture walkthroughs and conformance docs as canonical references instead of duplicating procedural content.
- Keep README concise and move deep operational details into `docs/`.
- Treat release notes as audience-facing communication, not internal changelog fragments.

## Dependencies (narrative)

**Hard:** [STORY-6-3](Story-6-3-Publish-MCP-host-guided-demo-walkthrough.md).

## Related stories

- Next: [STORY-7-2](Story-7-2-Define-alpha-versioning-and-final-release-commit-flow.md)
- Next: [STORY-7-5](Story-7-5-Prepare-community-launch-playbook-and-channel-rollout.md)

## Delivered

- Updated `README.md` with clearer alpha positioning, onboarding path, and explicit docs split.
- Added `docs/README.md` as docs index and IA map for onboarding vs deep reference content.
- Added `docs/releases/alpha-release-notes.md` with highlights, known limitations, and caveats.
- Added `docs/repository-metadata-checklist.md` to track description/topics/social preview updates in GitHub settings.
