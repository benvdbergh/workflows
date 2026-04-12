---
kind: story
id: STORY-2-1
title: "Engine bootstrap and POC workflow validation"
status: done
priority: high
parent: EPIC-2
depends_on:
  - STORY-1-4
traces_to:
  - path: docs/poc-scope.md
  - path: schemas/workflow-definition-poc.json
  - path: docs/RFC/rfc-03-workflow-definition-schema.md
    anchor: "#31-representation-and-canonical-form"
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#42-phases"
slice: vertical
invest_check:
  independent: false
  negotiable: false
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "A buildable engine package (language as chosen by implementers) exists with a documented entrypoint (CLI, library main, or test harness) that loads a workflow document from disk or stdin as canonical JSON."
  - "Loaded documents are validated against the same POC schema contract as EPIC-1 (`schemas/workflow-definition-poc.json` or the bundled artifact it represents); invalid documents fail fast with actionable errors (instance path, keyword, and/or schema pointer sufficient to fix the document)."
  - "Validation behavior and any engine-specific limits beyond the schema are documented so STORY-2-2+ can assume a stable \"valid definition\" boundary."
epic_title: "Core durable execution engine"
project: workflows
created: 2026-04-12
updated: 2026-04-13
---

# Story-2-1: Engine bootstrap and POC workflow validation

## Description

Stand up the execution engine repository layout and wire **definition-time** validation to the EPIC-1 POC schema so every later story consumes a single, testable notion of a valid workflow document.

## User story

As an **engine developer**, I want **the same POC schema validation the repo already uses** so that **invalid definitions never enter the runtime**, with errors that are cheap to debug.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- **Separation of concerns:** keep pure validation behind a narrow interface (e.g. `validate(definition) -> Result<ValidatedWorkflow, ValidationError>`); persistence and graph walking should not re-implement schema rules ad hoc.
- Prefer reusing the same validation approach as CI ([STORY-1-4](Story-1-4-Wire-schema-validation-into-CI-or-documented-command.md)) to avoid drift between \"repo truth\" and runtime.
- Language/runtime choice remains open; optimize for **testability** and a clear boundary for STORY-2-2.

## Dependencies (narrative)

**Hard:** [STORY-1-4](Story-1-4-Wire-schema-validation-into-CI-or-documented-command.md) — schema location and validation command are established.

## Related stories

- Next: [STORY-2-2](Story-2-2-SQLite-append-only-command-and-event-persistence.md)
