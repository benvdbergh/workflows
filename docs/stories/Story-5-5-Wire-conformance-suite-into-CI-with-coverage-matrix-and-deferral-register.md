---
kind: story
id: STORY-5-5
title: "Wire conformance suite into CI with coverage matrix and deferral register"
status: done
priority: medium
parent: EPIC-5
depends_on:
  - STORY-5-3
  - STORY-5-4
  - STORY-5-1
traces_to:
  - path: docs/RFC/rfc-08-reference-implementation.md
    anchor: "#82-conformance-tests"
  - path: docs/poc-scope.md
  - path: .github/workflows/validate-workflows.yml
slice: vertical
invest_check:
  independent: false
  negotiable: true
  valuable: true
  estimable: true
  small: true
  testable: true
acceptance_criteria:
  - "CI runs the full conformance suite on pull requests and pushes to protected branches, and fails on any unexpected vector result."
  - "Conformance docs include a coverage matrix that marks each RFC-08 conformance area as implemented, partially implemented, or deferred for the active POC profile."
  - "Deferred areas that are currently out of scope (for example reducers or parallel joins) are captured in a deferral register with rationale and re-entry trigger."
  - "Contributor documentation explains how to run the same CI conformance command locally before opening a PR."
epic_title: "Conformance harness and CI gate"
project: workflows
created: 2026-04-13
updated: 2026-04-13
---

# Story-5-5: Wire conformance suite into CI with coverage matrix and deferral register

## Description

Turn the conformance harness into an operational quality gate by wiring it into CI and publishing explicit coverage and deferral status aligned with the current POC scope.

## User story

As a **release owner**, I want **CI-enforced conformance plus an explicit coverage/deferral map** so that **every release has transparent evidence of what is guaranteed versus intentionally postponed**.

## Acceptance criteria

See frontmatter `acceptance_criteria`.

## Technical notes

- Keep CI wiring incremental: avoid duplicating existing schema-only jobs when the conformance command can subsume them.
- Ensure coverage status uses RFC terminology to keep governance and implementation language aligned.
- Record deferrals as explicit scope decisions rather than silent test omissions.

## Dependencies (narrative)

**Hard:** [STORY-5-3](Story-5-3-Add-schema-conformance-vectors-and-diagnostic-assertions.md), [STORY-5-4](Story-5-4-Add-replay-prefix-injection-and-tail-command-stream-assertions.md), [STORY-5-1](Story-5-1-Add-agentic-intake-prompt-improver-fixture-and-conformance-test.md).

## Delivered

- Confirmed CI gate wiring in `.github/workflows/validate-workflows.yml` runs `npm run conformance` on pull requests and pushes to protected branches (`main`, `master`), with non-zero exit behavior on unexpected outcomes.
- Added an RFC-08 conformance coverage matrix to `conformance/README.md` marking areas as implemented, partial, or deferred for the current POC profile.
- Added a deferral register in `conformance/README.md` capturing deferred areas (reducers, parallel joins, interrupt-resume dedicated vectors, MCP roundtrip), rationale, and explicit re-entry triggers.
- Updated contributor guidance in `conformance/README.md` and `README.md` to run `npm run conformance` locally before opening a PR.

## Related stories

- Previous: [STORY-5-1](Story-5-1-Add-agentic-intake-prompt-improver-fixture-and-conformance-test.md), [STORY-5-3](Story-5-3-Add-schema-conformance-vectors-and-diagnostic-assertions.md), [STORY-5-4](Story-5-4-Add-replay-prefix-injection-and-tail-command-stream-assertions.md)
