---
kind: epic
id: EPIC-5
title: "Conformance harness and CI gate"
status: draft
priority: medium
parent: ""
depends_on:
  - EPIC-1
  - EPIC-3
traces_to:
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#82-conformance-tests"
  - path: docs/RFC/rfc-03-workflow-definition-schema.md
slice: horizontal
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: false
  testable: true
acceptance_criteria:
  - "Conformance or integration test runner lives under `conformance/` (or documented equivalent) and executes in CI on every change."
  - "Schema validation tests include valid and invalid fixtures from EPIC-1; failures pin exact rule violations where practical."
  - "Replay test: inject or load a fixed history prefix and assert the engine’s subsequent command stream matches golden expectations (per RFC-08 intent)."
  - "Optional POC coverage for reducers, parallel joins, or interrupt resume is documented as implemented vs deferred."
project: workflows
created: 2026-04-12
updated: 2026-04-13
---

# Epic-5: Conformance harness and CI gate

## Description

Automated conformance: schema validation vectors, replay inject tests, and reducer/parallel/interrupt fixtures as feasible for the POC; integrate into repository CI.

## Objectives

- Keep the implementation **honest** relative to the specification documents.
- Provide a regression net before expanding node kinds or adapters.

## User stories (links)

- [STORY-5-1: Add agentic intake prompt-improver fixture and conformance test](../stories/Story-5-1-Add-agentic-intake-prompt-improver-fixture-and-conformance-test.md)

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Dependencies (narrative)

- **EPIC-1:** fixtures and schema are the test inputs.
- **EPIC-3:** replay assertions require working replay semantics.

May proceed in parallel with [EPIC-4](Epic-4-MCP-stdio-integration-surface.md) once EPIC-3 is done.

## Related sources (PRD, ADR, specs)

- [Reference Implementation — conformance tests](../RFC/rfc-08-reference-implementation.md)
- [Workflow Definition Schema](../RFC/rfc-03-workflow-definition-schema.md)
- [Execution Model](../RFC/rfc-04-execution-model.md)

## Notes

Start narrow: **schema + replay** gates deliver most signal; expand matrices only when the engine claims support.
