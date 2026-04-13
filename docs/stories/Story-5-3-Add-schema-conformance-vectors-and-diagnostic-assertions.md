---
kind: story
id: STORY-5-3
title: "Add schema conformance vectors and diagnostic assertions"
status: done
priority: high
parent: EPIC-5
depends_on:
  - STORY-5-2
  - STORY-1-2
  - STORY-1-3
traces_to:
  - path: docs/RFC/rfc-03-workflow-definition-schema.md
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#82-conformance-tests"
  - path: schemas/workflow-definition-poc.json
slice: vertical
invest_check:
  independent: true
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "Conformance vectors include both valid and invalid workflow definitions grounded in EPIC-1 fixture patterns and POC schema constraints."
  - "Invalid vectors assert at least one stable failure signal (error path, keyword, or message fragment) that helps pinpoint rule violations."
  - "Harness output clearly distinguishes schema-pass vs schema-fail-by-design vectors."
  - "The schema conformance set runs in CI via the harness entrypoint and fails the build on unexpected outcomes."
epic_title: "Conformance harness and CI gate"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-5-3: Add schema conformance vectors and diagnostic assertions

## Description

Extend the conformance harness with explicit schema vectors that encode both valid and intentionally invalid definitions, including diagnostic expectations that make contract regressions actionable.

## User story

As a **protocol maintainer**, I want **schema vectors with explicit expected outcomes and diagnostic checks** so that **schema drift is caught immediately and failures are easy to triage**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Reuse existing EPIC-1 examples where possible and add focused negatives for high-value constraints (such as unsupported node kinds and forbidden top-level properties).
- Keep assertions robust across validator implementations by avoiding overly brittle full-string matches.
- Prefer one vector per rule intent so failures map cleanly to a single contract expectation.

## Dependencies (narrative)

**Hard:** [STORY-5-2](Story-5-2-Establish-conformance-harness-layout-and-test-entrypoint.md), [STORY-1-2](Story-1-2-Publish-POC-JSON-Schema-bundle-under-schemas.md), [STORY-1-3](Story-1-3-Add-golden-workflow-fixture-and-trace-companions.md).

## Related stories

- Previous: [STORY-5-2](Story-5-2-Establish-conformance-harness-layout-and-test-entrypoint.md)
- Next: [STORY-5-5](Story-5-5-Wire-conformance-suite-into-CI-with-coverage-matrix-and-deferral-register.md)

## Delivered

- Added schema conformance vectors for both valid and invalid workflow definitions using EPIC-1 style fixtures plus focused schema-negatives.
- Extended vector expectations so invalid schema vectors assert stable diagnostic signals (`instancePath`, `keyword`, and optional message fragment).
- Updated harness output categories to explicitly label `schema-pass` versus `schema-fail-by-design` in stderr and JSON summary counts.
- Verified `npm run conformance` and `npm run validate-workflows` succeed with the expanded schema vector set and CI entrypoint.
