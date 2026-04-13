---
kind: story
id: STORY-4-2
title: "Implement minimal MCP tools: start, status, resume"
status: draft
priority: high
parent: EPIC-4
depends_on:
  - STORY-4-1
  - STORY-3-3
traces_to:
  - path: docs/RFC/rfc-05-integration-interfaces.md
    anchor: "#52-mcp-server-interface"
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#81-minimum-viable-engine"
  - path: docs/poc-scope.md
    anchor: "#6-execution-model-subset-commands-and-events"
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "MCP tools `workflow_start`, `workflow_status`, and `workflow_resume` are implemented and invoke engine behavior equivalent to existing CLI/library flows."
  - "`workflow_start` returns a stable `execution_id` and enough metadata for follow-up tool calls."
  - "`workflow_status` returns at minimum phase/current cursor and last error details when present, using deterministic projection from persisted history/checkpoint state."
  - "`workflow_resume` validates interrupt payload shape and returns deterministic failure responses for invalid or stale resumes without process crashes."
  - "Adapter-level tests (unit or integration) verify happy-path and representative failure-path behavior for all three tools."
epic_title: "MCP stdio integration surface"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-4-2: Implement minimal MCP tools: start, status, resume

## Description

Deliver the minimum useful MCP tool surface for EPIC-4 by mapping start/status/resume operations to deterministic engine capabilities and persisting identity across calls.

## User story

As an **assistant integrator**, I want **a minimal MCP tool set that can start a run, observe progress, and resume interrupts** so that **the POC engine can be exercised from MCP-capable hosts without custom glue code**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Preserve single source of truth for status by deriving from command/event history and checkpoints instead of adapter-local mutable state.
- Keep input contracts strict and explicit; fail fast on invalid definitions or resume payloads with actionable errors.
- Design test fixtures to include at least one interrupt-resume scenario and one engine-level failure surfaced through MCP.

## Dependencies (narrative)

**Hard:** [STORY-4-1](Story-4-1-MCP-stdio-adapter-bootstrap-and-core-port.md), [STORY-3-3](Story-3-3-Checkpoint-persistence-policy-and-recovery-loading.md).

## Related stories

- Previous: [STORY-4-1](Story-4-1-MCP-stdio-adapter-bootstrap-and-core-port.md)
- Next: [STORY-4-3](Story-4-3-MCP-host-smoke-path-and-operator-docs.md)
