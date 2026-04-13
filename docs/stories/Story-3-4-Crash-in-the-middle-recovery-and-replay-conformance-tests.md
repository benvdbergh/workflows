---
kind: story
id: STORY-3-4
title: "Crash-in-the-middle recovery and replay conformance tests"
status: draft
priority: high
parent: EPIC-3
depends_on:
  - STORY-3-2
  - STORY-3-3
traces_to:
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#43-deterministic-replay"
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#82-conformance-tests"
  - path: docs/poc-scope.md
    anchor: "#6-execution-model-subset-commands-and-events"
  - path: packages/engine/test/poc-runner.test.mjs
slice: vertical
invest_check:
  independent: true
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "Automated integration tests simulate process interruption after a partial persisted history and verify restart/replay reaches the same terminal outcome as uninterrupted execution for at least one representative workflow."
  - "Tests assert that previously completed activities are not re-executed during recovery replay and are instead consumed from history."
  - "At least one conformance-style test proves deterministic mismatch handling by expecting the defined nondeterminism failure when replayed orchestration diverges from persisted history."
  - "Replay and recovery test artifacts are runnable in CI and documented as part of EPIC-3 completion evidence."
epic_title: "Deterministic replay and checkpoints"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-3-4: Crash-in-the-middle recovery and replay conformance tests

## Description

Turn replay and checkpoint behavior into executable quality gates by adding crash/restart integration tests and nondeterminism conformance checks that prove the EPIC-3 contract end to end.

## User story

As a **release maintainer**, I want **CI to prove deterministic recovery after partial execution history** so that **replay guarantees are protected from regressions as the engine evolves**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Prefer black-box recovery tests driven through public engine entrypoints so test coverage reflects real operator workflows.
- Make crash simulation deterministic (for example failpoint after event sequence N) to avoid flaky CI behavior.
- Keep at least one workflow fixture with non-trivial branching or interrupt behavior so replay correctness is tested beyond linear happy path.

## Dependencies (narrative)

**Hard:** [STORY-3-2](Story-3-2-Deterministic-command-matching-and-nondeterminism-failure.md), [STORY-3-3](Story-3-3-Checkpoint-persistence-policy-and-recovery-loading.md).

## Related stories

- Previous: [STORY-3-2](Story-3-2-Deterministic-command-matching-and-nondeterminism-failure.md), [STORY-3-3](Story-3-3-Checkpoint-persistence-policy-and-recovery-loading.md)
