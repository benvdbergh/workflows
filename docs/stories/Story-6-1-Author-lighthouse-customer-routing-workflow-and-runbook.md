---
kind: story
id: STORY-6-1
title: "Author lighthouse customer-routing workflow and runbook"
status: draft
priority: high
parent: EPIC-6
depends_on:
  - STORY-2-5
  - STORY-4-2
traces_to:
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#83-first-three-reference-workflows"
  - path: docs/poc-scope.md
  - path: examples/
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "A lighthouse workflow definition is added under `examples/` using the customer-support-routing scenario and only POC-supported node kinds."
  - "The example exercises `llm_call` (or deterministic stub), `switch`, `interrupt`, and MCP-backed `tool_call` in one coherent flow."
  - "A companion README explains required inputs, expected branch behavior, and copy-paste commands to run from CLI and through MCP tools."
  - "Example payloads and expected outputs are deterministic enough to support later replay and conformance assertions."
epic_title: "Lighthouse demo workflow"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-6-1: Author lighthouse customer-routing workflow and runbook

## Description

Create the canonical lighthouse artifact set: a realistic customer-routing workflow plus operator-friendly run instructions that make the scenario runnable without code archaeology.

## User story

As a **protocol evaluator**, I want **a runnable, documented lighthouse workflow artifact** so that **I can see the POC node model express a credible end-to-end orchestration path**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Keep the definition strictly inside POC scope (`start`, `step`, `llm_call`, `tool_call`, `switch`, `interrupt`, `end`) to avoid accidental roadmap leakage.
- Prefer fixed transcripts or stubbed model responses first; the document shape must stay stable when swapping to a live model later.
- Document at least one interrupt decision point and one MCP tool invocation with clear input/output examples.

## Dependencies (narrative)

**Hard:** [STORY-2-5](Story-2-5-Switch-routing-and-interrupt-resume.md), [STORY-4-2](Story-4-2-Implement-minimal-MCP-tools-start-status-resume.md).

## Related stories

- Next: [STORY-6-2](Story-6-2-Add-replay-proof-demo-script-and-crash-resume-narrative.md), [STORY-6-3](Story-6-3-Publish-MCP-host-guided-demo-walkthrough.md), [STORY-6-4](Story-6-4-Add-lighthouse-happy-path-to-conformance-vectors.md)
