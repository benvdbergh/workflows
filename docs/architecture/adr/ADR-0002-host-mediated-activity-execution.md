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

## Follow-up (implementation and validation)

- Wire callback tool(s) on the reference MCP adapter; extend status projection for “awaiting activity” (names TBD in governance).
- Conformance vectors for pause, submit result, replay idempotency.
- Update `docs/architecture/as-is-system-overview.md` and as-built diagrams when behavior lands.

## References

- `docs/architecture/as-is-system-overview.md`
- `docs/poc-scope.md`
- `docs/RFC/rfc-04-execution-model.md`, `docs/RFC/rfc-05-integration-interfaces.md`, `docs/RFC/rfc-06-interoperability.md`
- `ROADMAP.md`
- `docs/governance/spec-architecture-governance.md`
