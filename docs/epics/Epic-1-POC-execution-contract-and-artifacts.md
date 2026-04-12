---
kind: epic
id: EPIC-1
title: "POC execution contract and artifacts"
status: done
priority: high
parent: ""
depends_on: []
traces_to:
  - path: docs/RFC/rfc-00-overview.md
  - path: docs/RFC/rfc-03-workflow-definition-schema.md
  - path: docs/RFC/rfc-04-execution-model.md
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#82-conformance-tests"
  - path: docs/poc-scope.md
  - path: schemas/workflow-definition-poc.json
  - path: examples/lighthouse-customer-routing.workflow.json
  - path: README.md
  - path: .github/workflows/validate-workflows.yml
slice: vertical
invest_check:
  independent: true
  negotiable: false
  valuable: true
  estimable: true
  small: false
  testable: true
acceptance_criteria:
  - "Written POC scope note lists supported node kinds, edges, and state/reducer rules for the first engine milestone (explicitly out-of-scope items called out)."
  - "Repository contains a machine-readable schema bundle under `schemas/` (JSON Schema or agreed equivalent) covering only the POC subset."
  - "At least one golden workflow definition JSON/YAML fixture and at least one companion file describing expected command/event prefixes for happy path (and one failure or retry path where applicable)."
  - "Fixtures validate against the published schema in CI or a documented one-shot validation command."
project: workflows
created: 2026-04-12
updated: 2026-04-13
---

# Epic-1: POC execution contract and artifacts

## Description

Freeze the POC schema subset, publish JSON Schema (or equivalent), golden workflow fixtures, and expected command/event trace seeds aligned with `docs/RFC/rfc-03-workflow-definition-schema.md` and `docs/RFC/rfc-04-execution-model.md`.

## Objectives

- Prevent implementation drift by locking the smallest definition surface the engine must honor first.
- Give conformance and the engine a shared, testable contract before code hardens around informal examples.

## User stories (links)

- [STORY-1-1 — Author POC scope note for engine milestone](../stories/Story-1-1-Author-POC-scope-note-for-engine-milestone.md)
- [STORY-1-2 — Publish POC JSON Schema bundle under schemas](../stories/Story-1-2-Publish-POC-JSON-Schema-bundle-under-schemas.md)
- [STORY-1-3 — Add golden workflow fixture and trace companions](../stories/Story-1-3-Add-golden-workflow-fixture-and-trace-companions.md)
- [STORY-1-4 — Wire schema validation into CI or documented command](../stories/Story-1-4-Wire-schema-validation-into-CI-or-documented-command.md)

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Dependencies (narrative)

None. This epic is the root of the POC dependency chain. Downstream epics consume the fixtures and schema as the source of truth.

## Related sources (PRD, ADR, specs)

- [Agent Workflow Protocol — RFC (overview)](../RFC/rfc-00-overview.md)
- [Workflow Definition Schema](../RFC/rfc-03-workflow-definition-schema.md)
- [Execution Model](../RFC/rfc-04-execution-model.md)
- [Reference Implementation Plan — conformance / examples](../RFC/rfc-08-reference-implementation.md)

## Notes

Prefer a **single lighthouse workflow** contract that the later demo epic will execute unchanged, rather than many partial fixtures.

## Closure

All four stories (STORY-1-1 through STORY-1-4) are **implemented and marked done**. Final check: `npm run validate-workflows` passes locally; **Validate workflow definitions** GitHub Action runs the same on `push` / `pull_request` to `main` and `master` (Node.js 24, `actions/checkout@v5`, `actions/setup-node@v5`).

| Acceptance criterion (frontmatter) | Primary evidence |
|-----------------------------------|------------------|
| POC scope note (node kinds, edges, reducers, out-of-scope) | [docs/poc-scope.md](../poc-scope.md) |
| Machine-readable schema bundle under `schemas/` | [schemas/workflow-definition-poc.json](../../schemas/workflow-definition-poc.json), [schemas/README.md](../../schemas/README.md) |
| Golden fixture + command/event trace companions | [examples/lighthouse-customer-routing.workflow.json](../../examples/lighthouse-customer-routing.workflow.json), trace JSON under [examples/](../../examples/) |
| Fixtures validated in CI or documented command | [README.md](../../README.md) (`npm run validate-workflows`), [.github/workflows/validate-workflows.yml](../../.github/workflows/validate-workflows.yml) |
