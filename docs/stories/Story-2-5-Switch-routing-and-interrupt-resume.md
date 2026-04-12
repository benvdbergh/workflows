---
kind: story
id: STORY-2-5
title: "Switch routing and interrupt resume"
status: done
priority: high
parent: EPIC-2
depends_on:
  - STORY-2-3
  - STORY-2-4
traces_to:
  - path: docs/poc-scope.md
    anchor: "#2-node-type-values-in-scope"
  - path: docs/poc-scope.md
    anchor: "#3-edges-in-scope"
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#48-interrupt-and-resume-protocol"
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#44-command-taxonomy-normative"
  - path: examples/lighthouse-customer-routing.workflow.json
  - path: examples/lighthouse-customer-routing.trace.happy.json
  - path: examples/lighthouse-customer-routing.trace.failure-and-retry.json
slice: vertical
invest_check:
  independent: false
  negotiable: false
  valuable: true
  estimable: true
  small: false
  testable: true
acceptance_criteria:
  - "`switch` nodes route to the target named by the first matching `config.cases[].when` jq expression, or `config.default` when present; evaluation uses the same execution-state binding documented in STORY-2-3."
  - "Routing precedence follows the POC recommendation: **`cases` / `default` are authoritative** for switch successors; if static `edges` from a switch coexist, behavior is documented and tested to avoid ambiguity."
  - "`interrupt` nodes raise **`RaiseInterrupt` / `InterruptRaised`** (or equivalents) and persist a resumable wait; **`ResumeInterrupt` / `InterruptResumed`** continues the graph with payload validated against `resume_schema` when validation is enabled."
  - "Invalid resume payloads and activity failures needed for lighthouse **failure/retry** narratives are observable in the persisted stream in line with [examples/lighthouse-customer-routing.trace.failure-and-retry.json](../../examples/lighthouse-customer-routing.trace.failure-and-retry.json) at prefix level (exact payload parity optional if documented)."
  - "End-to-end run of [examples/lighthouse-customer-routing.workflow.json](../../examples/lighthouse-customer-routing.workflow.json) succeeds with stubs **or** a documented gap list with follow-up story ids—preference is no gaps for EPIC-2 closure."
epic_title: "Core durable execution engine"
project: workflows
created: 2026-04-12
updated: 2026-04-13
---

# Story-2-5: Switch routing and interrupt resume

## Description

Extend the walker for **conditional routing** and **human-in-the-loop** interrupts so the engine covers the remaining POC node types (`switch`, `interrupt`) and can execute the lighthouse-shaped golden fixture.

## User story

As a **product owner**, I want **branching and approval flows** in the first engine milestone so that **the lighthouse demo workflow is runnable** on the core engine.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Depends on **STORY-2-4** so interrupt and retry scenarios that follow real activities behave realistically; if ordering is inverted in implementation, keep the dependency for planning—tests should still cover interrupt without activities where possible.
- **State machines:** treat interrupt as an explicit execution sub-state (waiting vs running) in design docs even if the schema is a single table—future replay will need it.
- Optional `interrupt` timeouts from the definition are honored or explicitly deferred with documentation.

## Dependencies (narrative)

**Hard:** [STORY-2-3](Story-2-3-Orchestration-phases-and-linear-graph-walk.md), [STORY-2-4](Story-2-4-Activity-boundary-with-stubbed-tool-and-llm-execution.md).

## Related stories

- Previous: [STORY-2-3](Story-2-3-Orchestration-phases-and-linear-graph-walk.md), [STORY-2-4](Story-2-4-Activity-boundary-with-stubbed-tool-and-llm-execution.md)
