---
kind: epic
id: EPIC-2
title: "Core durable execution engine"
status: done
priority: high
parent: ""
depends_on:
  - EPIC-1
traces_to:
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#42-phases"
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#81-minimum-viable-engine"
  - path: docs/poc-scope.md
  - path: packages/engine/README.md
  - path: packages/engine/src/index.mjs
  - path: CLAUDE.md
  - path: README.md
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
  - "Phases through graph walk are implemented for the POC subset per docs/poc-scope.md (linear flow, switch branching, interrupt/resume; parallel and other deferred node types remain out of scope)."
  - "Activities (tool/LLM or stubs) execute outside pure orchestration; results are recorded as events suitable for later replay."
project: workflows
created: 2026-04-12
updated: 2026-04-13
---

# Epic-2: Core durable execution engine

## Description

Implement validate–start–walk phases: graph traversal for the POC node subset, append-only command/event stream, SQLite persistence, and an activity boundary with stubbed or mock tool and LLM execution.

## Objectives

- Prove the protocol’s **durable execution** story on a laptop-grade deployment.
- Establish the internal API surface that replay, MCP, and conformance will attach to.

## User stories (links)

- [STORY-2-1 — Engine bootstrap and POC workflow validation](../stories/Story-2-1-Engine-bootstrap-and-POC-workflow-validation.md)
- [STORY-2-2 — SQLite append-only command and event persistence](../stories/Story-2-2-SQLite-append-only-command-and-event-persistence.md)
- [STORY-2-3 — Orchestration phases and linear graph walk](../stories/Story-2-3-Orchestration-phases-and-linear-graph-walk.md)
- [STORY-2-4 — Activity boundary with stubbed tool and LLM execution](../stories/Story-2-4-Activity-boundary-with-stubbed-tool-and-llm-execution.md)
- [STORY-2-5 — Switch routing and interrupt resume](../stories/Story-2-5-Switch-routing-and-interrupt-resume.md)

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Dependencies (narrative)

**Hard:** [EPIC-1](Epic-1-POC-execution-contract-and-artifacts.md) — schema and golden fixtures define what “valid” and “runnable” mean.

## Related sources (PRD, ADR, specs)

- [Execution Model — phases, commands, events](../RFC/rfc-04-execution-model.md)
- [Reference Implementation — MVP engine, SQLite](../RFC/rfc-08-reference-implementation.md)
- [Workflow Definition Schema](../RFC/rfc-03-workflow-definition-schema.md)

## Notes

RFC-08 still envisions a Rust/Go-style core binary for a full MVP; this epic delivered a **Node.js POC** (`packages/engine`) so the protocol’s durable-history and orchestration behavior is testable without native engine builds. The POC value is **behavior** (persisted history, clear activity boundary), not a specific runtime layout.

## Closure

All five stories (STORY-2-1 through STORY-2-5) are **implemented and marked done**. Final check: `npm test` passes at the repository root (engine workspace tests).

| Acceptance criterion (frontmatter) | Primary evidence |
|-----------------------------------|------------------|
| Load/validate POC definitions; actionable errors on invalid docs | [`packages/engine/src/validate.mjs`](../../packages/engine/src/validate.mjs), [`packages/engine/src/cli.mjs`](../../packages/engine/src/cli.mjs), tests in [`packages/engine/test/validate.test.mjs`](../../packages/engine/test/validate.test.mjs) |
| Monotonic append-only command/event stream per execution id (SQLite or agreed store) | [`packages/engine/src/persistence/sqlite-history-store.mjs`](../../packages/engine/src/persistence/sqlite-history-store.mjs), [`packages/engine/src/persistence/memory-history-store.mjs`](../../packages/engine/src/persistence/memory-history-store.mjs), [`packages/engine/test/history-store.test.mjs`](../../packages/engine/test/history-store.test.mjs) |
| POC graph walk: linear flow, switch branching, interrupt/resume | [`packages/engine/src/orchestrator/linear-runner.mjs`](../../packages/engine/src/orchestrator/linear-runner.mjs), [`packages/engine/src/orchestrator/poc-runner.mjs`](../../packages/engine/src/orchestrator/poc-runner.mjs), [`packages/engine/test/linear-runner.test.mjs`](../../packages/engine/test/linear-runner.test.mjs), [`packages/engine/test/poc-runner.test.mjs`](../../packages/engine/test/poc-runner.test.mjs) |
| Activity boundary; tool/LLM via executor port; results as events | [`packages/engine/src/orchestrator/activity-executor.mjs`](../../packages/engine/src/orchestrator/activity-executor.mjs), [`packages/engine/README.md`](../../packages/engine/README.md) (stub executor and `ActivityExecutor` port) |
