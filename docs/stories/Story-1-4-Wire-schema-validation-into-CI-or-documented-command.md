---
kind: story
id: STORY-1-4
title: "Wire schema validation into CI or documented command"
status: done
priority: medium
parent: EPIC-1
depends_on:
  - STORY-1-2
  - STORY-1-3
traces_to:
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#82-conformance-tests"
  - path: schemas/workflow-definition-poc.json
  - path: scripts/validate-workflows.mjs
  - path: .github/workflows/validate-workflows.yml
  - path: README.md
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "Every golden workflow fixture from STORY-1-3 is validated against the STORY-1-2 entry schema in CI (preferred), **or** a documented one-shot command (e.g. `npm run validate-workflows` / `uv run …`) is added and referenced from the repository README or `schemas/README.md`."
  - "CI or the documented command fails on invalid fixtures (smoke test with one deliberately invalid file is optional but recommended)."
  - "Contributors can discover how to run validation in under two minutes from linked docs."
epic_title: "POC execution contract and artifacts"
project: workflows
created: 2026-04-12
updated: 2026-04-12
---

# Story-1-4: Wire schema validation into CI or documented command

## Description

Ensure fixtures validate against the published schema in CI, or document a one-shot validation command developers can run locally.

## User story

As a **maintainer**, I want **automated or trivially runnable schema validation** so that **workflow fixtures cannot drift from the schema without an explicit decision**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Tooling is intentionally open: **ajv**, **check-jsonschema**, **Python jsonschema**, or a small Node script are all acceptable; pick what fits the repo’s first language for EPIC-2.
- If CI is not yet available in the repository, the “documented command” path satisfies this story **only** if the command is copy-pasteable and tested once in the PR description or a short log excerpt.

## Dependencies (narrative)

- **STORY-1-2:** schema entry point must exist.
- **STORY-1-3:** there must be at least one fixture path to validate (and ideally invalid cases later).

## Related stories

- Depends on: [STORY-1-2](Story-1-2-Publish-POC-JSON-Schema-bundle-under-schemas.md), [STORY-1-3](Story-1-3-Add-golden-workflow-fixture-and-trace-companions.md)

## Notes

EPIC-5 will generalize this into a fuller conformance harness; this story only **gates schema validity** for checked-in definitions.
