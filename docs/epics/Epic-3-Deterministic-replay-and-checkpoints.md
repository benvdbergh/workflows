---
kind: epic
id: EPIC-3
title: "Deterministic replay and checkpoints"
status: draft
priority: high
parent: ""
depends_on:
  - EPIC-2
traces_to:
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#43-deterministic-replay"
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#82-conformance-tests"
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: false
  testable: true
acceptance_criteria:
  - "Given a persisted event history, the engine can resume (or cold-start replay) and reproduce the same orchestration decisions without re-executing completed activities."
  - "Documented or tested behavior for at least one crash-in-the-middle scenario: process stops after partial history; restart yields consistent terminal state."
  - "Obvious orchestration divergence vs history fails with a defined error (minimal nondeterminism detection per POC scope)."
  - "Checkpoints or sequence boundaries are written per agreed POC policy and referenced from events or store metadata."
project: workflows
created: 2026-04-12
updated: 2026-04-12
---

# Epic-3: Deterministic replay and checkpoints

## Description

Reload history from SQLite, re-drive orchestration, skip completed activities per recorded events, minimal nondeterminism detection, and checkpoint policy sufficient for a crash-in-the-middle demonstration.

## Objectives

- Make the **replay** property—the main differentiator from ad hoc agent loops—demonstrable and testable.
- Align checkpoint semantics with the execution model so adapters (MCP) see a stable correlation id and history.

## User stories (links)

- To be added under `docs/stories/` (replay loop, checkpoint writer, failure modes).

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Dependencies (narrative)

**Hard:** [EPIC-2](Epic-2-Core-durable-execution-engine.md) — requires a persisted command/event stream and activity completion records.

## Related sources (PRD, ADR, specs)

- [Execution Model — deterministic replay](../RFC/rfc-04-execution-model.md)
- [Execution Model — command and event taxonomies](../RFC/rfc-04-execution-model.md)
- [Reference Implementation — replay tests](../RFC/rfc-08-reference-implementation.md)

## Notes

POC may scope **nondeterminism detection** to a single class of mistakes (e.g. command mismatch); full production hardening is out of scope.
