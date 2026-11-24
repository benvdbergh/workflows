---
id: "01"
title: Product
status: proposed
owner: Product management
last_reviewed: 2026-11-24
---

# 01 · Product

> **Authority:** Product management. **AI policy:** agents propose new features (`workflows/define-feature.md`) and sync updates (`workflows/sync.md`) through a PR. Requirements in an `approved` version change only with the owner's approval.
> **Changes when:** features are added, changed or retired.
>
> **Sources:** [README.md](../README.md), [docs/engine-profile.md](../docs/engine-profile.md), [packages/engine/README.md](../packages/engine/README.md), [docs/architecture/arc42/01-introduction-and-goals.md](../docs/architecture/arc42/01-introduction-and-goals.md), [ROADMAP.md](../ROADMAP.md). Capability areas describe what ships today; `blueprint/features/` is empty until new behaviour is specified.

This document is the **index of capabilities and behaviour**. Each feature is specified in detail in `blueprint/features/FEAT-nnn-*.md`. This document holds the overview, how features relate, and the product-wide rules no single feature owns.

## Capability map

Existing product surface as capability areas (no FEAT ids yet — pre-blueprint delivery; *(inferred)* grouping):

| Capability area | What exists today | Status |
|---|---|---|
| Workflow definition & validation | JSON Schema + AJV validation CLI/library; profile invariants | implemented |
| Graph orchestration | Node types per engine profile (`start`/`end`/`step`/`llm_call`/`tool_call`/`switch`/`interrupt`/`parallel`/`wait`/`set_state`/`agent_delegate`/`subworkflow`); reducers; retry/timeout | implemented |
| Durable history & replay | Append-only command/event history (memory or SQLite); deterministic replay | implemented |
| HITL interrupt / resume | `interrupt` nodes with typed `resume_schema` | implemented |
| Host-mediated & engine-direct activities | Host submits activity outcomes; optional engine-direct MCP via operator manifest ([ADR-0002](../docs/architecture/adr/ADR-0002-host-mediated-activity-execution.md), [ADR-0003](../docs/architecture/adr/ADR-0003-engine-direct-mcp-activity-execution.md)) | implemented |
| MCP control plane | Stdio tools: `workflow_start`, `workflow_status`, `workflow_resume`, `workflow_submit_activity` (+ signal/cancel/list where shipped) | implemented |
| REST / SDK control plane | `workflows-engine-rest`, OpenAPI under `packages/engine/openapi/`, `@agent-workflow/sdk` | implemented |
| Conformance & golden fixtures | `conformance/` vectors; `examples/` lighthouse and R2/R3 fixtures | implemented |
| Security v1 baseline | Secret redaction, definition signing, scoped auth tokens, secret_ref | implemented |
| Protocol / RFC documentation | `docs/RFC/`, whitepaper, published user docs (out of blueprint migration scope) | implemented |
| Scale & multi-tenant ops | Worker pools, tenancy, DR runbooks | later (R5) |

## Product-wide business rules

| ID | Rule | Applies to |
|---|---|---|
| BR-01 | Workflow documents must normalize to canonical JSON before validation/execution | Definition & validation |
| BR-02 | Unknown node `type` values and root `extensions` are rejected (`additionalProperties: false`) | Definition & validation |
| BR-03 | Orchestration decisions must be reconstructible from append-only history + definition | Orchestration, replay |
| BR-04 | Non-deterministic work occurs only inside declared activities; results are recorded | Activities |
| BR-05 | Profile, schema, and fixtures change together; bump `document.schema` in instances | Contract changes |
| BR-06 | Normative semantics live in RFC + engine-profile; blueprint links, does not replace them | All areas |

## Roles & permissions (product view)

| Role | Can | Cannot |
|---|---|---|
| Protocol maintainer | Change RFC/profile/schema with governance; cut releases | Bypass security disclosure process |
| Engine integrator / host author | Embed engine via MCP/REST/SDK; configure operator manifest | Treat undocumented RFC gaps as implemented |
| Operator | Validate, start, status, resume, submit activities for allowed scopes | Access secrets in cleartext in history (redaction defaults) |
| Contributor / community | Open GitHub issues for bugs/questions; follow CONTRIBUTING | Use GitHub issues as planning backlog (Linear is SSOT) |
| Security reporter | Private disclosure via SECURITY.md | Public issue for vulnerabilities |

*(Role names inferred from arc42 stakeholders + CONTRIBUTING/SUPPORT; technical auth scopes live in 05/security docs.)*

## Key user journeys

1. **Validate a workflow:** Author writes `*.workflow.json` → `npm run engine:validate` / `validate-workflows` → AJV + profile errors on stderr.
2. **Run via MCP (operator):** Configure host with `npx … workflows-engine-mcp` → `workflow_start` → await activity or interrupt → `workflow_submit_activity` / `workflow_resume` → `workflow_status` until terminal.
3. **Replay / recover:** Process fails mid-run → history store retains events → resume reconstructs phase without re-executing completed activities inconsistently.
4. **Conformance gate:** PR/CI runs `npm run conformance` / `conformance:v1` against vectors under `conformance/vectors/`.
5. **Release cut:** Green `master` → annotated `v*` tag → `release.yml` publishes npm, docs, GitHub Release *(see 06)*.

## Non-functional product requirements

- Determinism / replay fidelity as top quality goal *(seen: arc42 §1.2)*
- Contract clarity via engine profile + schema rejection of undefined types
- Integration clarity via `createWorkflowApplicationPort` and stable MCP/REST error codes
- Regression safety via conformance harness + engine package tests
- Node.js ≥ 22.5.0 runtime requirement *(seen: package.json `engines`)*
