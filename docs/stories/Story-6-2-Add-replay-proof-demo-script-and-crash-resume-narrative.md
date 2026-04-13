---
kind: story
id: STORY-6-2
title: "Add replay-proof demo script and crash-resume narrative"
status: done
priority: high
parent: EPIC-6
depends_on:
  - STORY-6-1
  - STORY-3-4
traces_to:
  - path: docs/RFC/rfc-04-execution-model.md
    anchor: "#43-deterministic-replay"
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#83-first-three-reference-workflows"
  - path: docs/brief.md
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "A step-by-step demo script is published that runs the lighthouse scenario through an intentional stop/restart point and resumes from persisted history."
  - "The script includes objective verification steps proving replay value (for example same final status and matching post-resume command/event tail)."
  - "Crash-and-resume evidence is captured as reproducible terminal transcript, markdown procedure, or scripted test harness linked from the story."
  - "Failure modes and operator recovery expectations are documented for at least one common issue (for example stale execution id or invalid resume payload)."
epic_title: "Lighthouse demo workflow"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-6-2: Add replay-proof demo script and crash-resume narrative

## Description

Turn the lighthouse workflow from a static sample into a defensible durability demonstration by scripting and documenting a deterministic crash-and-resume journey.

## User story

As a **stakeholder reviewing durability claims**, I want **a reproducible replay demonstration** so that **I can trust that workflow outcomes survive process interruption without logic drift**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Reuse the same execution identifiers and history query surfaces defined by EPIC-3 to keep replay claims verifiable.
- Keep success assertions machine-checkable where possible (explicit status values, event counts, or command tail comparisons).
- Script should remain usable in local laptop environments without requiring non-POC infrastructure.

## Dependencies (narrative)

**Hard:** [STORY-6-1](Story-6-1-Author-lighthouse-customer-routing-workflow-and-runbook.md), [STORY-3-4](Story-3-4-Crash-in-the-middle-recovery-and-replay-conformance-tests.md).

## Related stories

- Previous: [STORY-6-1](Story-6-1-Author-lighthouse-customer-routing-workflow-and-runbook.md)
- Next: [STORY-6-3](Story-6-3-Publish-MCP-host-guided-demo-walkthrough.md), [STORY-6-4](Story-6-4-Add-lighthouse-happy-path-to-conformance-vectors.md)

## Delivered

- Added deterministic replay evidence script: `scripts/demo-lighthouse-replay-crash-resume.mjs`.
- Added operator runbook and evidence interpretation: `docs/architecture/lighthouse-replay-crash-resume-demo.md`.
- Linked replay proof from `examples/README.md` so the lighthouse demo path is discoverable from fixture docs.
- Script asserts crash-and-restart convergence, replay marker presence for `classify`, and stable terminal completion.
