---
id: "05"
title: Interfaces & Integrations
status: proposed
owner: API / Engineering
last_reviewed: 2026-11-24
---

# 05 · Interfaces & Integrations

> **Authority:** API / Engineering. **AI policy:** agents propose updates via PR (`workflows/sync.md`, `workflows/review.md`).
> **Source-of-truth split:** OpenAPI and MCP tool handlers are the machine-readable contracts. This document explains intent, consumers, and guarantees. It does **not** copy endpoint or tool schemas.
>
> **Sources:** [docs/RFC/rfc-05-integration-interfaces.md](../docs/RFC/rfc-05-integration-interfaces.md), [docs/architecture/arc42/05-building-block-view.md](../docs/architecture/arc42/05-building-block-view.md), [packages/engine/openapi/openapi.yaml](../packages/engine/openapi/openapi.yaml), MCP server + application port under `packages/engine/src/`.

## API overview

| API | Contract | Consumers | Auth | Versioning |
|---|---|---|---|---|
| MCP stdio control plane | Tool handlers in `packages/engine/src/adapters/mcp/`; bins `workflows-engine-mcp` | IDE/agent hosts, operators | Process isolation; optional scoped tokens where wired | Package SemVer `@agent-workflow/engine` |
| REST control plane | [packages/engine/openapi/openapi.yaml](../packages/engine/openapi/openapi.yaml); bin `workflows-engine-rest` | HTTP clients, `@agent-workflow/sdk` | Bearer scopes when `WORKFLOW_ENGINE_AUTH_TOKENS` set | Package SemVer |
| Validation CLI | `workflows-engine` (`validate`, `mcp-manifest validate`) | Operators, CI | N/A (local) | Package SemVer |
| Library / application port | `createWorkflowApplicationPort` via `packages/engine/src/index.mjs` | SDK, adapters, conformance | Caller-provided | Package SemVer |
| Workflow definition schema | [schemas/workflow-definition.json](../schemas/workflow-definition.json) | Authors, validators, engines | N/A | Schema `$id` / `document.schema` URI |

Primary MCP tools *(seen)*: `workflow_start`, `workflow_status`, `workflow_resume`, `workflow_submit_activity` (plus signal/cancel/list where shipped in GA control plane).

Stable adapter error codes include: `VALIDATION_ERROR`, `EXECUTION_NOT_FOUND`, `INVALID_RESUME_PAYLOAD`, `ACTIVITY_SUBMIT_NOT_AWAITING`, `ACTIVITY_SUBMIT_NODE_MISMATCH`, `ACTIVITY_SUBMIT_PARALLEL_MISMATCH`, `SUBMIT_VALIDATION_ERROR`, `ENGINE_FAILURE`, `INTERNAL_ERROR`.

## Compatibility policy

- Breaking schema/profile changes require coordinated fixture and `document.schema` bumps; CI includes schema breaking-change checks (`npm run check-schema-breaking-change`)
- Prefer additive evolution within a major; GA v1 contract freeze posture in [ROADMAP.md](../ROADMAP.md) / [docs/migration-alpha-to-ga.md](../docs/migration-alpha-to-ga.md)
- Deprecations (e.g. `tool_call` delegation bridge → native `agent_delegate`) documented in engine-profile §2.2
- Breaking API changes agreed with consumers (hosts, SDK) before merge *(intent from template + governance docs)*

## Internal interfaces

| Interface | Type | Defined in | Called by |
|---|---|---|---|
| Application port | In-process façade | `packages/engine/src/application/workflow-application-port.mjs` | MCP adapter, REST server, SDK, tests |
| Graph walker | Orchestration API | `packages/engine/src/orchestrator/workflow-graph-walker.mjs` | Application port |
| ExecutionHistoryStore | Persistence port | `packages/engine/src/persistence/` | Application port / runners |
| StepHandlerRegistry | In-process step handlers | engine orchestrator / step executor | `step` nodes |
| Workflow ref registry | Subworkflow definition resolve | engine subworkflow runtime | `subworkflow` nodes |

## External integrations

| Service | Purpose | Direction | Credentials | Failure behaviour |
|---|---|---|---|---|
| Upstream MCP servers | Engine-direct `tool_call` / tools | Outbound stdio/client | Operator manifest / allowlisted commands | Activity failure events; retry/timeout per node policy |
| A2A agents | `agent_delegate` | Outbound (mock in-process; real adapter in E2E) | Protocol-specific | Activity lifecycle events; see ADR-0004 |
| npm registry | Publish `@agent-workflow/engine` / SDK | Outbound (release) | OIDC provenance in `release.yml` | Break-glass manual workflows |
| GitHub Pages | End-user docs deploy | Outbound (release) | Actions permissions | Manual `docs-publish.yml` recovery |
| Linear | Planning backlog SSOT | Outbound (humans/agents) | Linear workspace | N/A to runtime |
| Host LLM / tools (host-mediated) | Complete activities outside engine | Inbound submit | Host-managed | Engine waits on `awaiting_activity` |
