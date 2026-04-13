---
kind: story
id: STORY-5-2
title: "Establish conformance harness layout and test entrypoint"
status: done
priority: high
parent: EPIC-5
depends_on:
  - STORY-1-4
  - STORY-2-1
traces_to:
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#82-conformance-tests"
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#84-repository-layout-informative"
  - path: docs/RFC/rfc-04-execution-model.md
slice: vertical
invest_check:
  independent: true
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "A dedicated conformance harness path exists (prefer `conformance/`) with a documented directory convention for fixtures, expected outcomes, and runner utilities."
  - "A single test command executes the conformance harness locally and in CI (for example via `npm test`, dedicated package script, or equivalent documented runner)."
  - "Harness execution emits machine-readable pass/fail output suitable for CI and human-readable failure context for local debugging."
  - "Repository docs describe where to add a new conformance vector and how it is discovered by the runner."
epic_title: "Conformance harness and CI gate"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-5-2: Establish conformance harness layout and test entrypoint

## Description

Create the structural foundation for EPIC-5 by introducing a stable conformance harness layout and a single execution entrypoint so subsequent schema and replay vectors can be added without test framework churn.

## User story

As a **maintainer**, I want **a predictable conformance harness structure and runner contract** so that **new vectors can be added quickly and reliably gated in CI**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Keep harness conventions aligned with existing test runner patterns to avoid introducing a parallel, competing test stack.
- Treat fixture discovery as deterministic (stable ordering) to keep CI output reproducible.
- Prefer additive wiring so existing test commands remain valid for contributors.

## Dependencies (narrative)

**Hard:** [STORY-1-4](Story-1-4-Wire-schema-validation-into-CI-or-documented-command.md), [STORY-2-1](Story-2-1-Engine-bootstrap-and-POC-workflow-validation.md).

## Related stories

- Next: [STORY-5-3](Story-5-3-Add-schema-conformance-vectors-and-diagnostic-assertions.md), [STORY-5-4](Story-5-4-Add-replay-prefix-injection-and-tail-command-stream-assertions.md), [STORY-5-5](Story-5-5-Wire-conformance-suite-into-CI-with-coverage-matrix-and-deferral-register.md)

## Delivered

- Added `conformance/` harness foundation with deterministic vector discovery and a single entrypoint command.
- Added `npm run conformance` and wired it into CI.
- Documented vector structure, discovery behavior, and local execution workflow in `conformance/README.md`.
