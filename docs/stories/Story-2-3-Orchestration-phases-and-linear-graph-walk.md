---
kind: story
id: STORY-2-3
title: "Orchestration phases and linear graph walk"
status: done
priority: high
parent: EPIC-2
depends_on:
  - STORY-2-2
traces_to:
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#42-phases"
  - path: docs/poc-scope.md
    anchor: "#2-node-type-values-in-scope"
  - path: docs/poc-scope.md
    anchor: "#4-expressions-jq-and-state-reducers-in-scope"
  - path: examples/lighthouse-customer-routing.workflow.json
slice: vertical
invest_check:
  independent: false
  negotiable: false
  valuable: true
  estimable: true
  small: false
  testable: true
acceptance_criteria:
  - "For valid POC workflows whose graph is **linear** (single successor chain from `start` through `step`/`end`, no `switch` or `interrupt` required in the fixture), the engine implements the high-level phases **validate → start → walk → complete or fail** per RFC-04 §4.2 and [docs/poc-scope.md](../../poc-scope.md)."
  - "Graph navigation honors directed `edges` and the synthetic `__start__` convention where used in fixtures; unknown or unreachable topology fails with a clear error."
  - "The persisted stream includes POC-in-scope commands and events from [docs/poc-scope.md](../../poc-scope.md) §6 sufficient for a linear run (at minimum: `ExecutionStarted`, scheduling/completion path, `StateUpdated` or equivalent, and `ExecutionCompleted` or `ExecutionFailed`)."
  - "Reducer support matches POC: `overwrite`, `append`, and `merge` on `state_schema` annotations; documents using `custom` reducers are rejected per scope."
  - "The engine documents the **jq evaluation root** (execution state binding) used for any expressions exercised in this story; tests use a minimal workflow that proves at least one jq-backed mapping or condition if required by the chosen fixture."
epic_title: "Core durable execution engine"
project: workflows
created: 2026-04-12
updated: 2026-04-13
---

# Story-2-3: Orchestration phases and linear graph walk

## Description

Deliver the **pure orchestration loop** for the simplest POC topologies: load a validated definition, create an execution, walk a linear graph, merge state per reducers, and persist a coherent command/event history.

## User story

As a **workflow author**, I want **linear workflows to run end-to-end with durable history** so that **the engine proves the core execution model** before branching and activities add complexity.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- **Orchestration vs activities:** this story may treat `step` / `llm_call` / `tool_call` as **placeholders** that still emit scheduling events, or restrict fixtures to nodes that need no external I/O—provided the next story owns the full activity boundary. The history must remain consistent with POC semantics.
- Do **not** implement `parallel`, `subworkflow`, `wait`, or `set_state` ([docs/poc-scope.md](../../poc-scope.md) §2.1).
- Internal APIs introduced here (e.g. \"advance to next node\", \"persist transition\") should be **stable enough** for MCP (EPIC-4) and replay (EPIC-3) to attach later.

## Dependencies (narrative)

**Hard:** [STORY-2-2](Story-2-2-SQLite-append-only-command-and-event-persistence.md) — every transition appends to the log.

## Related stories

- Previous: [STORY-2-2](Story-2-2-SQLite-append-only-command-and-event-persistence.md)
- Next: [STORY-2-4](Story-2-4-Activity-boundary-with-stubbed-tool-and-llm-execution.md), [STORY-2-5](Story-2-5-Switch-routing-and-interrupt-resume.md)
