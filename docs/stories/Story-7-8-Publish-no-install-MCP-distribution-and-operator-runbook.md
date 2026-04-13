---
kind: story
id: STORY-7-8
title: "Publish no-install MCP distribution and operator runbook"
status: done
priority: medium
parent: EPIC-7
depends_on:
  - STORY-7-7
  - STORY-7-5
traces_to:
  - path: README.md
  - path: docs/releases/alpha-release-notes.md
  - path: docs/community-launch-playbook.md
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "Release docs include a no-install MCP quickstart with provider-neutral MCP configuration examples."
  - "Operator runbook defines the publish sequence: package verify, publish dispatch, post-publish smoke check via `npx`, and announcement update."
  - "Forum/community launch templates include copy-paste install commands pinned to alpha tag and exact version."
  - "A rollback or unpublish response note is documented for early alpha incident handling."
epic_title: "Alpha release readiness and community launch"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-7-8: Publish no-install MCP distribution and operator runbook

## Description

Turn the no-install publish mechanics into user-facing and maintainer-facing operating guidance so each alpha drop can be published, validated, and announced consistently.

## User story

As a **maintainer preparing an alpha announcement**, I want **a concise publish and rollout runbook** so that **consumers can immediately run the MCP server via `npx` with low setup friction**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Skill routing

Primary skills: `repo-docs`, `open-source-community`.
Supporting skill: `release-versioning`.

## Technical notes

- Keep config examples generic enough to fit multiple MCP clients while preserving correct command syntax.
- Include both tag-based (`@alpha`) and immutable version (`@x.y.z-alpha.n`) install references.
- Define a minimal smoke check command path for post-publish confidence.

## Dependencies (narrative)

**Hard:** [STORY-7-7](Story-7-7-Add-trusted-npm-publish-workflow-for-alpha-channel-releases.md), [STORY-7-5](Story-7-5-Prepare-community-launch-playbook-and-channel-rollout.md).

## Delivered

- Expanded `docs/releases/alpha-release-notes.md` with:
  - no-install `npx` quickstart commands for `@alpha` and exact pinned version,
  - provider-neutral MCP client configuration examples for both floating and pinned installs,
  - operator publish runbook sequence: package verify -> publish dispatch -> post-publish smoke checks -> announcement update.
- Added early alpha rollback and unpublish incident handling note in release docs with maintainer communication expectations.
- Updated `docs/community-launch-playbook.md` launch message templates with copy-paste install commands for both `@alpha` and exact pinned version.
- Added launch-day checklist items for post-publish `npx` smoke checks and incident-note guardrail before external posting.
- Added cross-links in `README.md` and `docs/README.md` to the no-install quickstart and operator runbook section.
