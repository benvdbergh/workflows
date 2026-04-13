---
kind: story
id: STORY-7-6
title: "Make MCP engine package publishable for no-install consumption"
status: done
priority: high
parent: EPIC-7
depends_on:
  - STORY-7-4
traces_to:
  - path: packages/engine/package.json
  - path: packages/engine/src/mcp-stdio-server.mjs
  - path: README.md
slice: vertical
invest_check:
  independent: true
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "The MCP package is publishable to npm (not private), with explicit public access policy and minimal package payload controls."
  - "The no-install execution path is documented using `npx` with both alpha tag and pinned-version examples."
  - "A packaging verification step proves that published artifact contents include required runtime files and MCP entrypoints only."
  - "Known compatibility constraints for host environments (Node version, stdio behavior) are documented for consumers."
epic_title: "Alpha release readiness and community launch"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-7-6: Make MCP engine package publishable for no-install consumption

## Description

Prepare the `@agent-workflow/engine` package to be safely published and consumed directly by MCP hosts through `npx`, without requiring a prior global install.

## User story

As an **MCP host integrator**, I want **a publishable package with a reliable no-install launch path** so that **I can run the server by reference from npm in one command**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Skill routing

Primary skill: `release-versioning`.
Supporting skill: `repo-docs`.

## Technical notes

- Package readiness should include `publishConfig`, package visibility, and file inclusion controls.
- Documentation should provide copy-paste MCP config snippets using `npx`.
- Use `npm pack --dry-run` and `npm pack` evidence to validate tarball payload.

## Dependencies (narrative)

**Hard:** [STORY-7-4](Story-7-4-Implement-governed-CI-CD-npm-release-packaging-pipeline.md).

## Related stories

- Next: [STORY-7-7](Story-7-7-Add-trusted-npm-publish-workflow-for-alpha-channel-releases.md)

## Delivered

- Updated `packages/engine/package.json` for publishable npm distribution:
  - removed private package blocking (`private: true`),
  - added `publishConfig.access: public`,
  - added package payload controls with `files` limited to runtime/package docs.
- Documented no-install execution via `npx` in `packages/engine/README.md`:
  - alpha channel usage example (`@alpha`),
  - pinned version usage example (`@0.0.2`),
  - host compatibility constraints (Node version and stdio expectations).
- Added packaging verification guidance to `packages/engine/README.md` with `npm pack --dry-run` and explicit payload checks.
- Packaging verification evidence path:
  - Guidance and review checklist: `packages/engine/README.md` (`Packaging verification guidance` section).
  - Execution evidence (2026-04-13): `npm pack --dry-run` for `packages/engine` reported 18 files and included required entrypoints (`src/index.mjs`, `src/cli.mjs`, `src/mcp-stdio-server.mjs`).
