---
kind: epic
id: EPIC-2
title: "Core durable execution engine"
status: draft
priority: high
parent: ""
depends_on:
  - EPIC-1
traces_to:
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#42-phases"
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#81-minimum-viable-engine"
slice: vertical
invest_check:
  independent: false
  negotiable: false
  valuable: true
  estimable: true
  small: false
  testable: true
acceptance_criteria:
  - "Engine loads a POC workflow definition, validates it against the EPIC-1 schema subset, and rejects invalid documents with actionable errors."
  - "Running an execution produces a monotonic append-only command and event stream persisted to SQLite (or agreed store) keyed by execution id."
  - "Phases through graph walk are implemented for the POC subset (e.g. linear flow plus agreed branch/parallel/interrupt minimal forms per contract)."
  - "Activities (tool/LLM or stubs) execute outside pure orchestration; results are recorded as events suitable for later replay."
project: workflows
created: 2026-04-12
updated: 2026-04-12
---

# Epic-2: Core durable execution engine

## Description

Implement validate–start–walk phases: graph traversal for the POC node subset, append-only command/event stream, SQLite persistence, and an activity boundary with stubbed or mock tool and LLM execution.

## Objectives

- Prove the protocol’s **durable execution** story on a laptop-grade deployment.
- Establish the internal API surface that replay, MCP, and conformance will attach to.

## User stories (links)

- To be added under `docs/stories/` (e.g. engine bootstrap, persistence layer, activity executor).

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Dependencies (narrative)

**Hard:** [EPIC-1](Epic-1-POC-execution-contract-and-artifacts.md) — schema and golden fixtures define what “valid” and “runnable” mean.

## Related sources (PRD, ADR, specs)

- [Execution Model — phases, commands, events](../RFC/rfc-04-execution-model.md)
- [Reference Implementation — MVP engine, SQLite](../RFC/rfc-08-reference-implementation.md)
- [Workflow Definition Schema](../RFC/rfc-03-workflow-definition-schema.md)

## Notes

Language choice (Rust, Go, or other) is left to implementers; the POC value is **behavior** (persisted history, clear activity boundary), not a specific binary layout.
