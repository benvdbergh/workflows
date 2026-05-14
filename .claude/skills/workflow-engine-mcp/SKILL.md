---
name: workflow-engine-mcp
description: >-
  Guides authoring, validating, and running Agent Workflow Protocol workflow documents against the @agent-workflow/engine MCP stdio adapter (current schema: bundled JSON Schema under assets/). Covers node-type selection, engine-direct operator manifests, host-mediated activities, jq/state shaping for small MCP payloads, and stable adapter error codes. Use when the user mentions workflows-engine-mcp, workflow_start, workflow_status, workflow_resume, workflow_submit_activity, WORKFLOW_ENGINE_MCP_CONFIG, operator MCP manifest, validating workflow JSON, or running workflows via the workflow engine MCP server.
license: MIT
metadata:
  author: workflows
  version: 1.1.0
---

# workflow-engine-mcp

**Purpose:** Turn the engine MCP surface into a **repeatable operator pattern**—design graphs that match the **bundled workflow JSON Schema**, validate before execution, choose the right execution mode (`in_process` vs `host_mediated`), and read tool results without assuming every host renders `structuredContent`.

**Authoritative contract in this skill:** `assets/workflow-definition-schema.json` (JSON Schema for the workflow document). **Normative behavior** for node semantics, execution, and jq binding is as implemented by the **published** `@agent-workflow/engine` package for the version you run; this skill tracks that surface and is **self-contained** (no dependency on a particular repository checkout).

## When to load which reference

| Topic | File |
|--------|------|
| Document shape, validation, `state_schema`, edges | `references/workflow-authoring.md` |
| Node types, `parallel` / `wait` / `set_state`, `tool_call` shape | `references/node-types-and-orchestration.md` |
| MCP tools, activity modes, manifests, polling vs terminal payload | `references/mcp-runtime-and-tools.md` |
| Guardrails, token discipline, jq pitfalls, secrets | `references/guardrails-and-efficiency.md` |
| Adapter `structuredContent.error.code` values | `references/mcp-adapter-errors.md` |

**Refresh the bundled schema** when you upgrade the engine package: replace `assets/workflow-definition-schema.json` with the schema shipped by that release (or from the engine package’s `schemas/` output) so validation matches runtime.

## MCP Dependencies

The host registers an MCP stdio server that exposes the engine adapter tools (names are stable for the `workflows-engine-mcp` binary). The **host’s internal server id** (e.g. in an IDE config) may differ; rely on **tool names**, not folder names.

### Server: `workflows-engine-mcp` (stdio)

- **Primary tools:** `workflow_start`, `workflow_status`, `workflow_resume`, `workflow_submit_activity`
- **Usage:** Start or resume executions; poll status; complete host-mediated activities. See `references/mcp-runtime-and-tools.md` for parameters and replay rules (`definition` / `input` must match `workflow_start` for submit).

### Optional: engine-direct child MCP servers

- **Configuration:** `WORKFLOW_ENGINE_MCP_CONFIG` or `--mcp-config` pointing at an operator manifest (`mcpServers` stdio shape). Validate with `workflows-engine mcp-manifest validate` (see `references/workflow-authoring.md`).
- **Usage:** `tool_call` nodes resolve `config.server` to a manifest key and invoke `config.tool` with static `config.arguments` (**no state interpolation** in the reference engine profile).

## Tool Usage Mapping

| Workflow step | MCP tool | Purpose | Safety |
|---------------|----------|---------|--------|
| Validate graph locally | (CLI) `workflows-engine validate` | Catch schema / graph errors before MCP | Safe |
| Start run | `workflow_start` | Supply `definition`, `input`; optional `activity_execution_mode` | Safe; may spawn child MCP servers when engine-direct is enabled |
| Poll / debug phase | `workflow_status` | `execution_id` → phase, cursor, last error | Safe (read) |
| Human-in-the-loop continue | `workflow_resume` | `resume_payload` after `interrupt` | Safe when payload is user-approved |
| Complete host step | `workflow_submit_activity` | After `awaiting_activity`; same `definition`/`input` as start | Safe; must match pending `node_id` (and `parallel_span` if branched) |

## Tool Safety Policy

- **Safe:** Read-only validation, `workflow_status`, well-scoped `workflow_start` with stubbed or read-only tools, in-memory store defaults for local dev.
- **Requires confirmation:** Workflows that call production APIs, write data, or embed secrets in manifests; changing operator manifests; pinning new package versions in production hosts.
- **Never allow:** Committing credentials or real operator env into shared or versioned config; running unreviewed `tool_call` graphs against privileged servers; assuming `parallel` branches execute as OS-parallel threads (see references).

## Mandatory behaviors for agents

1. **Validate first:** Run `workflows-engine validate` (or AJV against `assets/workflow-definition-schema.json`) before `workflow_start`.
2. **Match the schema:** Use only `type` values allowed by the schema union; **do not** add top-level `extensions` (schema has `additionalProperties: false` on the root workflow object).
3. **Pick execution mode deliberately:** Default in-process stub executor vs engine-direct MCP vs `host_mediated` (see `references/mcp-runtime-and-tools.md`).
4. **Size outputs for the host:** Use `set_state` + `end.output_mapping` so chat-visible payloads stay small; see `references/guardrails-and-efficiency.md`.
5. **On tool errors:** Read `structuredContent.error.code` and map via `references/mcp-adapter-errors.md`; fix arguments or execution state before blind retry.

## Examples

**Example 1 — Validate then start (in_process demo)**  
Trigger: “Run this workflow JSON through the engine MCP.”  
Steps: Validate with engine CLI → `workflow_start` with `definition` + `input` → if terminal, read `result` / `final_state` from structured result or mirrored text JSON.  
Result: Deterministic completion or structured validation error.

**Example 2 — Engine-direct tool reads**  
Trigger: “Call an MCP tool from a workflow via the engine.”  
Steps: Author operator manifest with a stdio server entry → set `WORKFLOW_ENGINE_MCP_CONFIG` → `tool_call` with `server` / `tool` / `arguments` → use distinct state keys or branches so payloads are not overwritten → `set_state` jq digest → small `output_mapping`.  
Result: Runnable graph with secrets kept out of shared repos.

**Example 3 — Interrupt and resume**  
Trigger: “Pause for human approval then continue.”  
Steps: Model `interrupt` + `resume_schema` → `workflow_start` → on interrupt status, collect payload → `workflow_resume` with matching `definition` and validated `resume_payload`.  
Result: Resumed graph with audit trail in history.

## Design basis (concise)

Structured workflows improve **reliability, auditability, and cost predictability** versus unbounded agent loops; decomposition enables **smaller contexts per step** and fewer tool definitions in play at once. Treat the engine as **orchestration** and MCP as **capabilities**; keep raw tool blobs off the critical path to the model where possible. Industry-oriented discussion of determinism, hybrid supervision, and token economics appears in many “agentic workflows vs autonomous agents” analyses; this skill stays aligned with **explicit graphs + externalized state** as the engine models them.
