---
kind: story
id: STORY-3-1
title: "Replay history hydration and resume cursor derivation"
status: draft
priority: high
parent: EPIC-3
depends_on:
  - STORY-2-2
  - STORY-2-3
  - STORY-2-4
  - STORY-2-5
traces_to:
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#43-deterministic-replay"
  - path: docs/poc-scope.md
    anchor: "#6-execution-model-subset-commands-and-events"
  - path: packages/engine/src/persistence/sqlite-history-store.mjs
  - path: packages/engine/src/orchestrator/poc-runner.mjs
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "A replay loader API reconstructs execution context from persisted history for an execution id, including ordered events, command/event correlation, and last known orchestration position."
  - "Replay startup can begin from either genesis (event sequence start) or a previously persisted safe replay point when available, with deterministic ordering guarantees."
  - "Completed activities discovered in history are represented as replay results so the orchestrator can advance state without re-running external tool/LLM activity handlers."
  - "Automated tests cover happy-path hydration for at least one linear flow and one switch/interrupt flow using persisted histories."
epic_title: "Deterministic replay and checkpoints"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-3-1: Replay history hydration and resume cursor derivation

## Description

Build the replay read path that turns append-only history into an in-memory execution context and replay cursor, so recovery starts from deterministic persisted facts rather than ad hoc runtime guesses.

## User story

As an **engine operator**, I want **recovery startup to hydrate execution state from durable history** so that **restarts can continue safely without reissuing already completed external activities**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Keep replay hydration as a distinct port from live execution to preserve separation between deterministic orchestration and non-deterministic activity execution.
- Define a canonical mapping between history records and replay cursor fields (current node, attempt counters, wait state) so later stories can perform command matching consistently.
- For POC scope, prioritize total ordering and deterministic interpretation over aggressive read-performance optimization.

## Dependencies (narrative)

**Hard:** [STORY-2-2](Story-2-2-SQLite-append-only-command-and-event-persistence.md), [STORY-2-3](Story-2-3-Orchestration-phases-and-linear-graph-walk.md), [STORY-2-4](Story-2-4-Activity-boundary-with-stubbed-tool-and-llm-execution.md), [STORY-2-5](Story-2-5-Switch-routing-and-interrupt-resume.md).

## Related stories

- Next: [STORY-3-2](Story-3-2-Deterministic-command-matching-and-nondeterminism-failure.md), [STORY-3-3](Story-3-3-Checkpoint-persistence-policy-and-recovery-loading.md)
