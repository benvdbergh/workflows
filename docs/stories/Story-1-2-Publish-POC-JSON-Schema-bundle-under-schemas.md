---
kind: story
id: STORY-1-2
title: "Publish POC JSON Schema bundle under schemas"
status: done
priority: high
parent: EPIC-1
depends_on:
  - STORY-1-1
traces_to:
  - path: docs/RFC/rfc-03-workflow-definition-schema.md
  - path: docs/poc-scope.md
  - path: schemas/workflow-definition-poc.json
  - path: schemas/README.md
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "Directory `schemas/` exists at repository root and contains a JSON Schema bundle (single entry schema plus `$ref` subschemas is fine) that validates only the POC subset."
  - "Schema rules are consistent with the POC scope note (STORY-1-1); anything marked out-of-scope is rejected or omitted from the schema as agreed."
  - "A short README or comment in `schemas/` explains how to validate a document against the entry schema and which draft/version of JSON Schema is used."
epic_title: "POC execution contract and artifacts"
project: workflows
created: 2026-04-12
updated: 2026-04-13
---

# Story-1-2: Publish POC JSON Schema bundle under schemas

## Description

Add `schemas/` with JSON Schema (or agreed equivalent) covering only the POC subset aligned with the scope note and RFC-03.

## User story

As a **conformance and engine developer**, I want **machine-readable schema for the POC subset** so that **workflow documents are validated consistently in CI and at runtime**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- **Trace path note:** `docs/poc-scope.md` is the expected location from STORY-1-1; if the merge uses a different path, update `traces_to` and this story in the same PR.
- Consider a single **entry** schema id (e.g. `workflow-definition-poc.json`) for tooling simplicity.
- YAML authoring may remain supported informally; canonical validation target is JSON (RFC-03 canonical JSON path).

## Dependencies (narrative)

**Hard:** [STORY-1-1](Story-1-1-Author-POC-scope-note-for-engine-milestone.md) — schema must encode the same surface as the written scope.

## Related stories

- Previous: [STORY-1-1](Story-1-1-Author-POC-scope-note-for-engine-milestone.md)
- Next: [STORY-1-3](Story-1-3-Add-golden-workflow-fixture-and-trace-companions.md)

## Delivered

- [`schemas/workflow-definition-poc.json`](../../schemas/workflow-definition-poc.json) — JSON Schema Draft 2020-12 entry schema with `$defs` for POC node kinds only; root `additionalProperties: false` rejects `extensions`.
- [`schemas/README.md`](../../schemas/README.md) — dialect, `$id`, validation commands (npm + optional `ajv-cli`).
- [`schemas/examples/minimal-valid.workflow.json`](../../schemas/examples/minimal-valid.workflow.json) — minimal valid instance for tooling smoke tests.
- Epic sign-off: [EPIC-1 closure](../epics/Epic-1-POC-execution-contract-and-artifacts.md#closure).

## Notes

It is acceptable for the first bundle to be **minimal** if it is complete for the chosen POC slice; expand only when scope expands.
