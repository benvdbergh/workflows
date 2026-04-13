---
kind: story
id: STORY-6-4
title: "Add lighthouse happy path to conformance vectors"
status: done
priority: high
parent: EPIC-6
depends_on:
  - STORY-6-1
  - STORY-5-5
traces_to:
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#82-conformance-tests"
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#83-first-three-reference-workflows"
  - path: conformance/README.md
slice: vertical
invest_check:
  independent: true
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "Conformance suite adds a lighthouse happy-path vector (or documented trimmed variant) that executes in deterministic CI."
  - "Vector assertions check expected command/event progression for key nodes (`llm_call`/stub, `switch`, `interrupt`, `tool_call`) without relying on nondeterministic model text."
  - "Coverage documentation is updated to show lighthouse demo protection status and any explicitly deferred assertions."
  - "CI failure output points maintainers to the lighthouse vector when behavioral drift is introduced."
epic_title: "Lighthouse demo workflow"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-6-4: Add lighthouse happy path to conformance vectors

## Description

Protect the lighthouse demo from regression by codifying its core happy path as conformance vectors and integrating that evidence into existing CI coverage reporting.

## User story

As a **maintainer of the reference demo**, I want **automated conformance coverage for lighthouse behavior** so that **future engine changes cannot silently break the flagship scenario**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Keep assertions behavior-focused (control flow and lifecycle) and avoid brittle checks on literal LLM output text.
- Reuse EPIC-5 harness conventions and diagnostics so failures stay readable and actionable.
- If trimming is required for determinism, document exactly which demo branches remain out of vector scope and why.

## Dependencies (narrative)

**Hard:** [STORY-6-1](Story-6-1-Author-lighthouse-customer-routing-workflow-and-runbook.md), [STORY-5-5](Story-5-5-Wire-conformance-suite-into-CI-with-coverage-matrix-and-deferral-register.md).

## Related stories

- Previous: [STORY-6-1](Story-6-1-Author-lighthouse-customer-routing-workflow-and-runbook.md), [STORY-5-5](Story-5-5-Wire-conformance-suite-into-CI-with-coverage-matrix-and-deferral-register.md)

## Delivered

- Confirmed lighthouse happy-path replay vector in CI scope: `conformance/vectors/replay/prefix-tail/lighthouse-prefix-tail-technical.vector.json`.
- Added explicit vector description documenting deterministic trimmed scope and command-tail expectations.
- Updated `conformance/README.md` coverage matrix and deferral language to show lighthouse protection status and remaining interrupt-vector gaps.
- Kept CI diagnostics path-oriented so failures continue to report vector id and file location for maintainers.
