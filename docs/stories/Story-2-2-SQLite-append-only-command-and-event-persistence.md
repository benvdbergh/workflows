---
kind: story
id: STORY-2-2
title: "SQLite append-only command and event persistence"
status: done
priority: high
parent: EPIC-2
depends_on:
  - STORY-2-1
traces_to:
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#43-deterministic-replay"
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#81-minimum-viable-engine"
  - path: docs/poc-scope.md
    anchor: "#6-execution-model-subset-commands-and-events"
slice: horizontal
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "An agreed persistence backend (default: SQLite file) stores command and event records for each **execution id** in **append-only** fashion (no in-place mutation of historical rows)."
  - "Each appended record carries a **monotonic sequence number** (or equivalent ordering guarantee) per execution so streams are totally ordered for replay and inspection."
  - "The storage layout and correlation fields (e.g. execution id, sequence, payload type) are documented; concurrent append behavior for a single execution is defined (e.g. single-writer or transactional monotonicity)."
  - "Automated tests prove ordering and append-only semantics for at least happy-path append sequences."
epic_title: "Core durable execution engine"
project: workflows
created: 2026-04-12
updated: 2026-04-13
---

# Story-2-2: SQLite append-only command and event persistence

## Description

Implement the **durable history** substrate: an append-only, execution-scoped log of commands and events suitable as the system of record for later replay (EPIC-3) and conformance (EPIC-5).

## User story

As a **platform engineer**, I want **a persisted, ordered command/event stream per execution** so that **orchestration is durable and inspectable** on a laptop-grade deployment.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- **Ports and adapters:** expose a small persistence port (append, read range by execution) so the store can be swapped in tests (in-memory) without changing orchestration rules.
- Align record shapes with the POC command/event subset in [docs/poc-scope.md](../../poc-scope.md) §6; exact JSON encoding may be engine-specific but field names should map cleanly to RFC-04 taxonomies.
- If SQLite is not chosen, document the substitute and keep the same **append-only + monotonic** guarantees.

## Dependencies (narrative)

**Hard:** [STORY-2-1](Story-2-1-Engine-bootstrap-and-POC-workflow-validation.md) — execution identity and \"start run\" can be wired to persistence without re-validating ad hoc.

## Related stories

- Previous: [STORY-2-1](Story-2-1-Engine-bootstrap-and-POC-workflow-validation.md)
- Next: [STORY-2-3](Story-2-3-Orchestration-phases-and-linear-graph-walk.md)
