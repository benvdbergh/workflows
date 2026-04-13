---
kind: story
id: STORY-3-2
title: "Deterministic command matching and nondeterminism failure"
status: draft
priority: high
parent: EPIC-3
depends_on:
  - STORY-3-1
traces_to:
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#43-deterministic-replay"
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#44-command-taxonomy-normative"
  - path: docs/poc-scope.md
    anchor: "#6-execution-model-subset-commands-and-events"
  - path: packages/engine/src/orchestrator/poc-runner.mjs
slice: vertical
invest_check:
  independent: false
  negotiable: false
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "Replay walk compares newly produced orchestration commands against persisted history for the same execution id and sequence window before permitting live activity execution."
  - "A deterministic mismatch (at minimum command kind and node identity mismatch at a shared sequence) fails execution with a defined nondeterminism error code and includes actionable debug context."
  - "Matching historical completion events cause replay to short-circuit activity invocation and apply recorded results instead."
  - "Automated tests include at least one intentional orchestration divergence fixture proving nondeterminism detection fails fast and predictably."
epic_title: "Deterministic replay and checkpoints"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-3-2: Deterministic command matching and nondeterminism failure

## Description

Implement the replay correctness guardrail: command-by-command history matching with explicit nondeterminism failure semantics, so deterministic orchestration becomes an enforceable runtime contract.

## User story

As a **protocol maintainer**, I want **orchestration divergence from persisted history to fail deterministically** so that **recovery behavior is trustworthy and debugging does not depend on hidden runtime state**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Keep matching rules strict enough to catch real replay drift, but document the exact comparison key set (for example command type, node id, attempt) to avoid hidden compatibility breaks.
- Emit mismatch details that support operator diagnosis without leaking sensitive payloads.
- Treat nondeterminism as a terminal execution failure for POC scope; compensating repair workflows can be future work.

## Dependencies (narrative)

**Hard:** [STORY-3-1](Story-3-1-Replay-history-hydration-and-resume-cursor-derivation.md) — replay hydration must provide deterministic ordering and correlation context.

## Related stories

- Previous: [STORY-3-1](Story-3-1-Replay-history-hydration-and-resume-cursor-derivation.md)
- Next: [STORY-3-4](Story-3-4-Crash-in-the-middle-recovery-and-replay-conformance-tests.md)
