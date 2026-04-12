---
kind: story
id: STORY-1-1
title: "Author POC scope note for engine milestone"
status: done
priority: high
parent: EPIC-1
depends_on: []
traces_to:
  - path: docs/poc-scope.md
  - path: docs/RFC/rfc-03-workflow-definition-schema.md
  - path: docs/RFC/rfc-04-execution-model.md
slice: vertical
invest_check:
  independent: true
  negotiable: false
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "A markdown document under `docs/` (path agreed in PR, e.g. `docs/poc-scope.md`) states which node `type` values, edge shapes, and state/reducer behaviors are in scope for the first engine milestone."
  - "The same document lists explicit out-of-scope capabilities (e.g. node kinds deferred to post-POC) so implementers do not infer support from the full RFC."
  - "The document references the normative RFC sections it subsets (at minimum pointers into RFC-03 and RFC-04)."
epic_title: "POC execution contract and artifacts"
project: workflows
created: 2026-04-12
updated: 2026-04-13
---

# Story-1-1: Author POC scope note for engine milestone

## Description

Publish a short normative POC scope document listing supported node kinds, edges, state/reducer rules, and explicit out-of-scope items for the first engine milestone.

## User story

As an **engine implementer**, I want a **single authoritative POC scope note** so that **schema, fixtures, and runtime stay aligned** and we do not accidentally implement the entire RFC surface before replay and MCP land.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Keep the scope note **short and testable**: every “in scope” item should map to a schema rule, fixture, or engine ticket later.
- Align naming with RFC-03 (`type` discriminators, edge labels) to avoid a parallel vocabulary.

## Dependencies (narrative)

None. This story unblocks [STORY-1-2](Story-1-2-Publish-POC-JSON-Schema-bundle-under-schemas.md).

## Related stories

- Next: [STORY-1-2 — Publish POC JSON Schema bundle under schemas](Story-1-2-Publish-POC-JSON-Schema-bundle-under-schemas.md)

## Delivered

- [`docs/poc-scope.md`](../poc-scope.md) — authoritative POC subset (node kinds, edges, reducers, explicit out-of-scope), with pointers to RFC-03/RFC-04 and a §8 link to the schema bundle added in STORY-1-2.
- Epic sign-off: [EPIC-1 closure](../epics/Epic-1-POC-execution-contract-and-artifacts.md#closure).

## Notes

Prefer wording that anticipates the **lighthouse** workflow in EPIC-6: the scope note should not forbid that vertical unless the timeline forces a deliberate cut.
