---
kind: story
id: STORY-2-4
title: "Activity boundary with stubbed tool and LLM execution"
status: done
priority: high
parent: EPIC-2
depends_on:
  - STORY-2-3
traces_to:
  - path: docs/poc-scope.md
    anchor: "#2-node-type-values-in-scope"
  - path: docs/poc-scope.md
    anchor: "#6-execution-model-subset-commands-and-events"
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#45-event-taxonomy-normative"
  - path: examples/lighthouse-customer-routing.workflow.json
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: false
  testable: true
acceptance_criteria:
  - "`tool_call`, `llm_call`, and `step` nodes are executed **outside** the pure graph walker via a dedicated activity boundary (worker interface, async boundary, or equivalent) so orchestration code does not embed provider SDKs directly."
  - "Each activity produces persisted **`ActivityRequested`**, **`ActivityCompleted`** or **`ActivityFailed`** (or profile-documented equivalents) with correlation to the node and execution, aligned with [docs/poc-scope.md](../../poc-scope.md) §6."
  - "Stub or mock implementations are acceptable for POC (e.g. fixed LLM transcript, no network) **without** changing workflow document shape; deterministic stubs are preferred for tests."
  - "Failures surface as `FailNode` / `ExecutionFailed` (or equivalent) per contract; retry configuration from the definition is either honored or explicitly documented as not yet implemented."
epic_title: "Core durable execution engine"
project: workflows
created: 2026-04-12
updated: 2026-04-13
---

# Story-2-4: Activity boundary with stubbed tool and LLM execution

## Description

Split **orchestration** from **side-effecting work**: run MCP-shaped `tool_call`, stubbed `llm_call`, and handler-backed `step` behind an activity executor that returns structured results for state merge and history.

## User story

As an **integrator**, I want **tools and models behind a clear boundary** so that **orchestration stays deterministic and replay-friendly** while real providers are swapped per deployment.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- **Hexagonal / ports:** define an `ActivityExecutor` (or similar) port; adapters hold MCP, HTTP, or test doubles. The walker depends only on the port.
- Tool arguments should remain compatible with lighthouse-style fixtures (`server`, `tool`, `arguments`) per [docs/poc-scope.md](../../poc-scope.md).
- Output mapping into workflow state should reuse the same reducer pipeline as STORY-2-3.

## Dependencies (narrative)

**Hard:** [STORY-2-3](Story-2-3-Orchestration-phases-and-linear-graph-walk.md) — scheduling and completion semantics exist.

## Related stories

- Previous: [STORY-2-3](Story-2-3-Orchestration-phases-and-linear-graph-walk.md)
- Next: [STORY-2-5](Story-2-5-Switch-routing-and-interrupt-resume.md)
