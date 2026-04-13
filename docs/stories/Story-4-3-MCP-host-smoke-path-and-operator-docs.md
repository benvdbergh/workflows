---
kind: story
id: STORY-4-3
title: "MCP host smoke path and operator docs"
status: draft
priority: medium
parent: EPIC-4
depends_on:
  - STORY-4-2
traces_to:
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#82-conformance-tests"
  - path: docs/RFC/rfc-05-integration-interfaces.md
    anchor: "#52-mcp-server-interface"
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
  - "Repository docs include a copy-paste runnable guide to launch the MCP stdio server, connect from one MCP-capable host, and execute a full start→status→resume flow."
  - "A reproducible smoke test (scripted or manual checklist with expected outputs) is added and linked from EPIC-4 evidence."
  - "The smoke path includes at least one structured error assertion showing adapter error mapping behavior."
  - "POC security posture is documented for this adapter (for example local-only usage assumptions and deferred auth hardening references to RFC-7)."
epic_title: "MCP stdio integration surface"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-4-3: MCP host smoke path and operator docs

## Description

Package EPIC-4 for adoption by adding a practical host-integration smoke path and clear operator documentation that demonstrates and verifies the minimal MCP contract.

## User story

As a **developer evaluating the protocol**, I want **documented, reproducible MCP host steps** so that **I can verify the engine integration surface quickly and trust the behavior before deeper adoption**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Prefer automation for smoke coverage where feasible, but keep a deterministic manual fallback with expected response examples.
- Ensure docs reference the same tool names and payload shapes implemented in `STORY-4-2` to avoid drift.
- Explicitly mark non-goals (production auth, multi-tenant hardening) to keep POC scope crisp.

## Dependencies (narrative)

**Hard:** [STORY-4-2](Story-4-2-Implement-minimal-MCP-tools-start-status-resume.md).

## Related stories

- Previous: [STORY-4-1](Story-4-1-MCP-stdio-adapter-bootstrap-and-core-port.md), [STORY-4-2](Story-4-2-Implement-minimal-MCP-tools-start-status-resume.md)
