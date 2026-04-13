---
kind: story
id: STORY-3-3
title: "Checkpoint persistence policy and recovery loading"
status: draft
priority: medium
parent: EPIC-3
depends_on:
  - STORY-3-1
traces_to:
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#410-checkpointing"
  - path: docs/RFC/rfc-03-workflow-definition-schema.md
    anchor: "#39-checkpointing-block"
  - path: docs/poc-scope.md
    anchor: "#5-retry-timeout-checkpointing"
  - path: packages/engine/src/persistence/sqlite-history-store.mjs
slice: horizontal
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "An explicit POC checkpoint policy is implemented and documented (minimum: `after_each_node` or documented equivalent boundary) with deterministic write triggers."
  - "Checkpoint records include execution id, definition version/hash, last applied event sequence, and serializable orchestration pointer/state reference required for recovery."
  - "Recovery startup prefers the latest valid checkpoint when present and falls back to full-history replay when absent or invalid, with behavior covered by tests."
  - "When checkpoint support is active, replay-observable metadata links checkpoint boundaries to history (for example via checkpoint table references or `CheckpointWritten`-equivalent event emission)."
epic_title: "Deterministic replay and checkpoints"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-3-3: Checkpoint persistence policy and recovery loading

## Description

Add a minimal but explicit checkpointing implementation that reduces replay startup cost while preserving deterministic recovery semantics aligned with RFC-04 and the POC profile.

## User story

As an **operations engineer**, I want **recovery to start from a safe persisted checkpoint when available** so that **crash recovery remains deterministic without always replaying from execution genesis**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Keep checkpoint write boundaries derivable from durable history so replay and auditing can agree on what state the checkpoint represents.
- Store checkpoint payloads in a format that is forward-compatible with additional node types, even if POC currently supports a narrow subset.
- If state snapshots are large, allow indirection (content-addressed blob reference) while preserving deterministic reconstruction.

## Dependencies (narrative)

**Hard:** [STORY-3-1](Story-3-1-Replay-history-hydration-and-resume-cursor-derivation.md) — checkpoint load must integrate with replay hydration and cursor reconstruction.

## Related stories

- Previous: [STORY-3-1](Story-3-1-Replay-history-hydration-and-resume-cursor-derivation.md)
- Next: [STORY-3-4](Story-3-4-Crash-in-the-middle-recovery-and-replay-conformance-tests.md)
