---
kind: epic
id: EPIC-4
title: "MCP stdio integration surface"
status: draft
priority: medium
parent: ""
depends_on:
  - EPIC-3
traces_to:
  - path: docs/RFC/rfc-05-integration-interfaces.md
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#81-minimum-viable-engine"
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: false
  testable: true
acceptance_criteria:
  - "MCP server over stdio is buildable and runnable from repo instructions; it talks to the same engine process or RPC surface as local CLI tests."
  - "Minimal tool set covers starting an execution, querying status or history slice, and submitting an interrupt resume (per POC subset)."
  - "At least one manual or automated smoke path documented: attach from a host that supports MCP (e.g. assistant client) and complete a short run."
  - "Errors from the engine are surfaced through MCP in a structured way (not opaque crashes)."
project: workflows
created: 2026-04-12
updated: 2026-04-13
---

# Epic-4: MCP stdio integration surface

## Description

Ship an MCP server (stdio) exposing the minimal tool set from [Integration Interfaces](../RFC/rfc-05-integration-interfaces.md) so assistants can start runs, poll status, and submit interrupt resumes against the same engine.

## Objectives

- Make the POC **visible** outside a developer’s terminal—aligned with how MCP normalized tool use across clients.
- Validate that the wire contract is small enough to implement alongside the engine.

## User stories (links)

- [STORY-4-1](../stories/Story-4-1-MCP-stdio-adapter-bootstrap-and-core-port.md) — bootstrap stdio adapter and engine-facing port with structured error mapping.
- [STORY-4-2](../stories/Story-4-2-Implement-minimal-MCP-tools-start-status-resume.md) — implement minimal tool surface (`start`, `status`, `resume`) against deterministic engine behavior.
- [STORY-4-3](../stories/Story-4-3-MCP-host-smoke-path-and-operator-docs.md) — add host smoke path and operator-facing integration documentation.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Dependencies (narrative)

**Hard:** [EPIC-3](Epic-3-Deterministic-replay-and-checkpoints.md) — stable execution identity, history, and resume behavior must exist before a useful MCP surface.

## Related sources (PRD, ADR, specs)

- [Integration Interfaces](../RFC/rfc-05-integration-interfaces.md)
- [Reference Implementation — MCP adapter](../RFC/rfc-08-reference-implementation.md)
- [Interoperability — MCP composition](../RFC/rfc-06-interoperability.md)

## Notes

Security hardening (authZ, secret handling) may remain **document-only** for POC; reference [Security Model](../RFC/rfc-07-security-model.md) for follow-on work.

## Evidence

- Story-4-3 smoke path and operator runbook: [MCP stdio host smoke path](../architecture/mcp-stdio-host-smoke.md)
