---
kind: story
id: STORY-1-3
title: "Add golden workflow fixture and trace companions"
status: done
priority: high
parent: EPIC-1
depends_on:
  - STORY-1-2
traces_to:
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#44-command-taxonomy-normative"
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#45-event-taxonomy-normative"
  - path: schemas/workflow-definition-poc.json
  - path: examples/lighthouse-customer-routing.workflow.json
  - path: examples/lighthouse-customer-routing.trace.happy.json
  - path: examples/lighthouse-customer-routing.trace.failure-and-retry.json
  - path: examples/README.md
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "At least one golden workflow definition lives under `examples/` or `conformance/fixtures/` (path agreed in PR) in JSON or YAML and passes schema validation from STORY-1-2."
  - "A companion artifact (JSON, YAML, or markdown table) documents expected **command** and/or **event** prefixes for a happy-path execution, using names aligned with RFC-04 taxonomies."
  - "A second path documents a **failure or retry** scenario (e.g. invalid resume payload, failed activity) with expected terminal or recovery-oriented event/command prefixes as appropriate for POC."
epic_title: "POC execution contract and artifacts"
project: workflows
created: 2026-04-12
updated: 2026-04-12
---

# Story-1-3: Add golden workflow fixture and trace companions

## Description

Check in at least one golden workflow definition (JSON/YAML) plus companion files documenting expected command/event prefixes for happy path and one failure or retry path.

## User story

As a **test author**, I want **golden fixtures with expected traces** so that **replay and engine behavior can be asserted against a stable contract** before the runtime is feature-complete.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Trace companions do not need to be exhaustive logs; **prefixes** or abbreviated sequences are enough if they unambiguously pin ordering and correlation ids.
- Prefer one fixture that EPIC-6 can reuse as the lighthouse definition to avoid duplicate “source of truth” workflow files.

## Dependencies (narrative)

**Hard:** [STORY-1-2](Story-1-2-Publish-POC-JSON-Schema-bundle-under-schemas.md) — fixtures must validate.

## Related stories

- Previous: [STORY-1-2](Story-1-2-Publish-POC-JSON-Schema-bundle-under-schemas.md)
- Next: [STORY-1-4](Story-1-4-Wire-schema-validation-into-CI-or-documented-command.md)

## Notes

If command/event names in early engine code diverge from RFC-04, document the **mapping** in the companion file and open a follow-up to reconcile—do not silently fork the taxonomy.
