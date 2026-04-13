---
kind: epic
id: EPIC-6
title: "Lighthouse demo workflow"
status: draft
priority: medium
parent: ""
depends_on:
  - EPIC-4
  - EPIC-5
traces_to:
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#83-first-three-reference-workflows"
  - path: docs/brief.md
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: false
  testable: true
acceptance_criteria:
  - "`examples/` (or agreed path) contains the lighthouse workflow definition plus README with run instructions (CLI and MCP)."
  - "Demo exercises `llm_call` (or stub), `switch`, `interrupt`, and MCP `tool_call` per POC contract—adjusted only if EPIC-1 scope explicitly narrows."
  - "Recorded narrative or script shows crash-and-resume or replay value (same final state from history)."
  - "Conformance suite includes this workflow’s happy path (or a trimmed variant) so the demo does not rot."
project: workflows
created: 2026-04-12
updated: 2026-04-12
---

# Epic-6: Lighthouse demo workflow

## Description

End-to-end reference scenario (e.g. customer support routing: `llm_call`, `switch`, `interrupt`, `tool_call`) runnable via CLI and MCP, demonstrating portable definition plus durable replay.

## Objectives

- Tell a **single credible story** to stakeholders: declarative workflow, tools via MCP, human interrupt, durable history.
- Align with the first reference workflow in [RFC-08 §8.3](../RFC/rfc-08-reference-implementation.md).

## User stories (links)

- [STORY-6-1: Author lighthouse customer-routing workflow and runbook](../stories/Story-6-1-Author-lighthouse-customer-routing-workflow-and-runbook.md)
- [STORY-6-2: Add replay-proof demo script and crash-resume narrative](../stories/Story-6-2-Add-replay-proof-demo-script-and-crash-resume-narrative.md)
- [STORY-6-3: Publish MCP host guided demo walkthrough](../stories/Story-6-3-Publish-MCP-host-guided-demo-walkthrough.md)
- [STORY-6-4: Add lighthouse happy path to conformance vectors](../stories/Story-6-4-Add-lighthouse-happy-path-to-conformance-vectors.md)

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Dependencies (narrative)

- **EPIC-4:** demo is most compelling when driven through MCP like a real assistant.
- **EPIC-5:** prevents the lighthouse from diverging from validated behavior.

## Related sources (PRD, ADR, specs)

- [Reference Implementation — first three reference workflows](../RFC/rfc-08-reference-implementation.md)
- [Abstract and Motivation — opportunity](../RFC/rfc-01-abstract-motivation.md)
- [Project brief](../brief.md)

## Notes

If timeline pressure hits, ship **stubbed LLM** with a fixed transcript first, then swap in a live model without changing the workflow document structure.
Implement in this sequence to keep architecture boundaries clean: **6-1 -> 6-2 and 6-3 in parallel -> 6-4**.

## Evidence

- MCP host walkthrough for lighthouse: [Lighthouse MCP host guided demo walkthrough](../architecture/lighthouse-mcp-host-guided-demo-walkthrough.md)
