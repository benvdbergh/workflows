# ADR-0002: Host-mediated activity execution (assistant-aligned)

**Status:** Accepted  
**Date:** 2026-05-03  
**Tags:** integration, MCP, execution-model, trust-boundary

## Context

Activity nodes (`step`, `llm_call`, `tool_call`) require non-deterministic I/O (tools, models, external handlers). Assistant-class hosts (for example Cursor, Claude Desktop, Codex-style clients) already aggregate MCP servers, credentials, and policy. The reference engine should mirror that **trust boundary**: orchestration and history stay in the engine; **side effects run in the host** unless an implementation explicitly chooses an in-process profile (hybrid).

**Problem:** Conflating “engine schedules the node” with “engine performs the MCP/LLM call” duplicates responsibility, complicates secrets handling, and diverges from how those hosts operate today.

## Decision

1. **Default reference posture** for MCP-first deployments: **host-mediated activities**. After the engine records `ActivityRequested`, the host performs the work (MCP `tools/call`, LLM API, or registered `step` handler), then submits the outcome through a **control-plane** operation on the same adapter family (see [RFC-05 §5.2](../RFC/rfc-05-integration-interfaces.md#52-mcp-server-interface)).
2. **Orchestration remains graph-driven**: the next node is determined by the workflow definition and state (for example `switch` jq), not by a free-form agent loop—same integration shape as agent hosts, **deterministic control flow**.
3. **Hybrid (in-process activity executor)** remains valid for demos, tests, or embedded profiles; it is **not** the default assumption for assistant hosts.

## Considered options

| Option | Summary | Why not primary |
|--------|---------|-----------------|
| A — Engine-owned MCP/LLM clients | Engine spawns or connects to MCP servers and providers | Duplicates host tool graph; key and policy sprawl |
| B — Host-mediated (chosen) | Host executes; engine records completion | Requires explicit callback tool and status phase |
| C — Hybrid | B default; A optional | Accepted as later profile flag, not contradiction |

## Consequences

- **Positive:** Aligns with MCP host security model; secrets stay with the host; matches operator mental model.
- **Negative:** Extra MCP tool(s) and execution phase(s); hosts must correlate `execution_id`, `node_id`, and parallel branch context when applicable; replay must not re-invoke the host for completed activities.
- **Specification:** RFC integration and execution sections state that activity **invocation** may be delegated to the host; normative event taxonomy unchanged.

## Evolution (reference engine product target)

For **operator and automation** scenarios, the repository **target** includes an **engine-direct** activity path: the reference engine **invokes** MCP servers (stdio or other supported transports) and **MAY** invoke bounded local commands where the deployment profile allows, without a conversational MCP host mediating every `tool_call`. **Configuration** for MCP servers **SHOULD** be reusable or translatable from **host manifest** shapes (for example Cursor-style `mcp.json` or equivalent desktop MCP config) so credentials and server lists are not maintained twice when both an IDE host and an engine worker need the same tools—subject to explicit policy when secrets must remain host-only.

That posture extends **Option C (hybrid)** and optional **Option A**-style surfaces; it does **not** revise the **default assistant-class decision** above. Normative security, isolation, configuration, and audit expectations for engine-direct execution are recorded in **[ADR-0003](ADR-0003-engine-direct-mcp-activity-execution.md)**.

## Follow-up (implementation and validation)

- Reference MCP stdio exposes `workflow_submit_activity` and status projection for `awaiting_activity`; extend conformance and governance naming as needed.
- Conformance vectors for pause, submit result, replay idempotency.
- Engine-direct MCP/cmd execution and manifest-aligned operator configuration (see [ADR-0003](ADR-0003-engine-direct-mcp-activity-execution.md)).
- Update `docs/architecture/as-is-system-overview.md` and as-built diagrams as profiles mature.

## References

- `docs/architecture/as-is-system-overview.md`
- `docs/poc-scope.md`
- `docs/RFC/rfc-04-execution-model.md`, `docs/RFC/rfc-05-integration-interfaces.md`, `docs/RFC/rfc-06-interoperability.md`
- `docs/architecture/adr/ADR-0003-engine-direct-mcp-activity-execution.md`
- `ROADMAP.md`
- `docs/governance/spec-architecture-governance.md`
