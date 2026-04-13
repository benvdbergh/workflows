---
kind: story
id: STORY-5-1
title: "Add agentic intake prompt-improver fixture and conformance test"
status: draft
priority: medium
parent: EPIC-5
depends_on:
  - STORY-1-3
  - STORY-2-5
traces_to:
  - path: docs/RFC/rfc-03-workflow-definition-schema.md
    anchor: "#311-worked-examples-informative"
  - path: docs/RFC/rfc-01-abstract-motivation.md
    anchor: "#opportunity"
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#83-first-three-reference-workflows"
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "A new fixture under `examples/` or `conformance/fixtures/` models the **agentic task intake and prompt improver** flow (intent detection, task sizing, capability/context gathering, prompt composition, and routing by mode)."
  - "Schema validation in CI includes the new fixture and passes under current POC schema constraints."
  - "Conformance tests assert deterministic routing behavior for `execution_mode` (at minimum `workflow` and default/open-agentic paths), including expected command/event prefixes at narrative level."
  - "Fixture docs clearly state that workflow publication is one route and open agentic execution is another, preserving implementation flexibility."
epic_title: "Conformance harness and CI gate"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-5-1: Add agentic intake prompt-improver fixture and conformance test

## Description

Add a conformance fixture and test narrative for the agentic intake/prompt-improver use case so this newly documented scenario is covered as an executable quality gate.

## User story

As a **protocol maintainer**, I want **the intake/prompt-improver scenario represented as a fixture with routing assertions** so that **RFC examples are continuously checked for schema and execution-contract drift**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Keep the fixture focused on currently in-scope node types when targeting the POC engine profile.
- If any nodes from the informative RFC example are out of scope for the active profile, provide a profile-specific fixture variant and document mapping.
- Reuse existing conformance harness conventions for naming, trace companions, and CI invocation.

## Dependencies (narrative)

**Hard:** [STORY-1-3](Story-1-3-Add-golden-workflow-fixture-and-trace-companions.md), [STORY-2-5](Story-2-5-Switch-routing-and-interrupt-resume.md).

## Related stories

- Previous: [STORY-1-3](Story-1-3-Add-golden-workflow-fixture-and-trace-companions.md), [STORY-2-5](Story-2-5-Switch-routing-and-interrupt-resume.md)
