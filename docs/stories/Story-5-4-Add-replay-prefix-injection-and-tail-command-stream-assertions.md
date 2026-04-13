---
kind: story
id: STORY-5-4
title: "Add replay prefix injection and tail command stream assertions"
status: done
priority: high
parent: EPIC-5
depends_on:
  - STORY-5-2
  - STORY-3-1
  - STORY-3-2
traces_to:
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#82-conformance-tests"
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#43-deterministic-replay"
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
  - "At least one replay conformance vector loads or injects a fixed history prefix and resumes execution from the derived replay cursor."
  - "Tests assert the post-prefix command stream (tail) matches golden expectations for command type/order and relevant payload identity fields."
  - "A negative replay case proves deterministic mismatch handling when live execution diverges from persisted history."
  - "Replay conformance vectors run in CI and produce diagnostics that identify the first mismatch point."
epic_title: "Conformance harness and CI gate"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-5-4: Add replay prefix injection and tail command stream assertions

## Description

Implement replay-focused conformance vectors that validate deterministic continuation from persisted history and verify mismatch behavior when the resumed execution path diverges.

## User story

As an **engine maintainer**, I want **replay conformance tests that lock the expected tail command stream after a fixed prefix** so that **durability and deterministic replay guarantees stay enforceable over time**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Use deterministic fixtures with explicit replay cursor boundaries to avoid flaky command ordering.
- Prefer black-box execution through public engine interfaces so conformance reflects operator-observable behavior.
- Keep golden assertions stable by matching semantically meaningful fields rather than volatile timestamps or IDs.

## Dependencies (narrative)

**Hard:** [STORY-5-2](Story-5-2-Establish-conformance-harness-layout-and-test-entrypoint.md), [STORY-3-1](Story-3-1-Replay-history-hydration-and-resume-cursor-derivation.md), [STORY-3-2](Story-3-2-Deterministic-command-matching-and-nondeterminism-failure.md).

## Delivered

- Added replay conformance vector support in `conformance/runner.mjs` and async execution in `conformance/run-conformance.mjs`.
- Added fixed-prefix replay vector asserting deterministic post-prefix command tail in `conformance/vectors/replay/prefix-tail/lighthouse-prefix-tail-technical.vector.json`.
- Added negative replay mismatch vector in `conformance/vectors/replay/mismatch/lighthouse-prefix-mismatch-route.vector.json` that validates first mismatch diagnostics.
- Updated `conformance/README.md` with replay vector format, tail assertions, mismatch diagnostic expectations, and category labels.

## Related stories

- Previous: [STORY-3-1](Story-3-1-Replay-history-hydration-and-resume-cursor-derivation.md), [STORY-3-2](Story-3-2-Deterministic-command-matching-and-nondeterminism-failure.md), [STORY-5-2](Story-5-2-Establish-conformance-harness-layout-and-test-entrypoint.md)
- Next: [STORY-5-5](Story-5-5-Wire-conformance-suite-into-CI-with-coverage-matrix-and-deferral-register.md)
