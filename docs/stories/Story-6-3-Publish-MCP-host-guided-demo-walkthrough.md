---
kind: story
id: STORY-6-3
title: "Publish MCP host guided demo walkthrough"
status: done
priority: medium
parent: EPIC-6
depends_on:
  - STORY-6-1
  - STORY-4-3
traces_to:
  - path: docs/RFC/rfc-05-integration-interfaces.md
    anchor: "#52-mcp-server-interface"
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#83-first-three-reference-workflows"
  - path: docs/architecture/mcp-stdio-host-smoke.md
slice: vertical
invest_check:
  independent: true
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "Lighthouse scenario docs include an MCP-host-focused walkthrough that executes start, status, and resume steps against the demo workflow."
  - "The walkthrough identifies where interrupt responses are submitted and how tool-call side effects are inspected from host-visible outputs."
  - "At least one structured error example (input validation or invalid state) is included so operators can recognize expected failure contracts."
  - "The walkthrough is cross-linked from EPIC-6 and does not duplicate conflicting command syntax with EPIC-4 operator docs."
epic_title: "Lighthouse demo workflow"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-6-3: Publish MCP host guided demo walkthrough

## Description

Package the lighthouse workflow for assistant-host demonstrations with a clear MCP-first operator path that mirrors real integration behavior rather than CLI-only internals.

## User story

As a **platform engineer integrating via MCP**, I want **a host-oriented lighthouse walkthrough** so that **I can reproduce the reference demo using the same interaction channel my assistant client uses**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Keep host commands and payload shapes aligned with EPIC-4 contracts; avoid introducing ad hoc demo-only wrappers.
- Ensure walkthrough semantics map to the same execution history observed in CLI tooling to preserve single-source-of-truth behavior.
- Prefer concise, copy-paste steps with expected responses to minimize operator ambiguity during live demos.

## Dependencies (narrative)

**Hard:** [STORY-6-1](Story-6-1-Author-lighthouse-customer-routing-workflow-and-runbook.md), [STORY-4-3](Story-4-3-MCP-host-smoke-path-and-operator-docs.md).

## Related stories

- Previous: [STORY-6-1](Story-6-1-Author-lighthouse-customer-routing-workflow-and-runbook.md)
- Next: [STORY-6-4](Story-6-4-Add-lighthouse-happy-path-to-conformance-vectors.md)

## Delivered

- Added lighthouse-specific MCP operator guide: `docs/architecture/lighthouse-mcp-host-guided-demo-walkthrough.md`.
- Documented `workflow_start -> workflow_status -> workflow_resume` flow using the lighthouse fixture and explicit interrupt handling.
- Added structured error example for `EXECUTION_NOT_FOUND` so expected failure contract is visible to operators.
- Reused EPIC-4 tool naming and payload conventions to avoid syntax drift.
