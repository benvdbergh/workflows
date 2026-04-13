---
kind: story
id: STORY-4-1
title: "MCP stdio adapter bootstrap and core port"
status: draft
priority: high
parent: EPIC-4
depends_on:
  - STORY-2-5
  - STORY-3-1
traces_to:
  - path: docs/RFC/rfc-05-integration-interfaces.md
    anchor: "#51-architecture-pattern"
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#81-minimum-viable-engine"
  - path: docs/epics/Epic-4-MCP-stdio-integration-surface.md
slice: vertical
invest_check:
  independent: true
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "A runnable MCP stdio server entrypoint is added under the engine package with documented startup command(s) for local development."
  - "All MCP requests are routed through a dedicated adapter layer that calls stable engine application interfaces (no protocol concerns leaking into core orchestration modules)."
  - "A typed request/response mapping contract is defined for the EPIC-4 minimum tools (`workflow_start`, `workflow_status`, `workflow_resume`) and includes execution identity handling."
  - "Engine failures are translated into structured MCP errors with stable error codes/messages and no unhandled process crashes."
epic_title: "MCP stdio integration surface"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-4-1: MCP stdio adapter bootstrap and core port

## Description

Create the MCP stdio adapter shell and the engine-facing port so EPIC-4 has a clean architectural seam before tool-specific behavior is added.

## User story

As an **engine maintainer**, I want **an MCP adapter that depends on a stable engine application port** so that **transport concerns can evolve without destabilizing deterministic engine behavior**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Keep the architecture aligned with RFC-5 core-plus-adapters guidance: protocol translation in adapter, orchestration rules in core.
- Define error taxonomy at the adapter boundary (validation, missing execution, invalid resume payload, internal failure) and map consistently to MCP error responses.
- Ensure the entrypoint can run in isolation for local contract testing before full host integration.

## Dependencies (narrative)

**Hard:** [STORY-2-5](Story-2-5-Switch-routing-and-interrupt-resume.md), [STORY-3-1](Story-3-1-Replay-history-hydration-and-resume-cursor-derivation.md).

## Related stories

- Next: [STORY-4-2](Story-4-2-Implement-minimal-MCP-tools-start-status-resume.md)
