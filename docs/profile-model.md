# Profile model — core vs optional

**Last reviewed:** 2026-06-04  
**Status:** Incremental R4 prep (BEN-8); not a GA contract freeze.  
**Normative protocol:** [RFC-03](RFC/rfc-03-workflow-definition-schema.md), [RFC-04](RFC/rfc-04-execution-model.md).  
**Engine profile (alpha):** [engine-profile.md](engine-profile.md).  
**JSON Schema entry:** [schemas/workflow-definition.json](../schemas/workflow-definition.json) (`$id`: `https://agent-workflow.dev/schemas/workflow-definition.json`).

This document formalizes what adopters **must** implement for **core profile** interoperability versus what remains **optional** or **host-dependent** in the reference engine today. It complements `docs/engine-profile.md` (authoritative engine subset) and will converge with the GA conformance tag.

---

## Schema identity

| Artifact | URI |
|----------|-----|
| JSON Schema `$id` | `https://agent-workflow.dev/schemas/workflow-definition.json` |
| Suggested `document.schema` in instances | Same URI (legacy POC/example URIs remain valid during alpha→GA migration; see [migration-alpha-to-ga.md](./migration-alpha-to-ga.md)) |

**Deferred (document only):** HTTP **version negotiation** (e.g. `Accept-Profile`, schema discovery registry, multi-profile servers). GA may add a registry publication step; the reference engine continues to bundle a single schema file validated at start.

---

## Core vs optional feature matrix

**Core** = required for “passes v1 core profile” conformance once tagged. **Optional** = allowed in documents; engines **may** implement. **Refused** = schema may accept shape but reference engine **rejects** at validate or runtime with a stable code.

| Feature | Tier | Reference engine (`@agent-workflow/engine@1.0.0`) | Notes |
|---------|------|---------------------------------------------------|--------|
| Top-level `document`, `state_schema`, `nodes`, `edges` | Core | Supported | Root `additionalProperties: false`; no `extensions`. |
| Node types: `start`, `end`, `step`, `llm_call`, `tool_call`, `switch`, `interrupt` | Core | Supported | Graph walker + linear runner (linear rejects `switch`/`interrupt`). |
| Node types: `parallel`, `wait` (`duration` / `until`), `set_state` | Core | Supported | `wait.until` uses engine clock; deterministic in replay with fixed inputs. |
| Node types: `agent_delegate`, `subworkflow` | Core | Supported | Child refs via `registerWorkflowRef`; mock A2A for `protocol: a2a`. |
| `switch` routing via `config.cases` / `default` (jq) | Core | Supported | Static edges from `switch` id ignored. |
| State reducers: `overwrite`, `append`, `merge` | Core | Supported | `custom` rejected at validate. |
| jq on `switch.when`, `set_state`, `end.output_mapping`, mappings | Core | Supported | Subset: [jq-conformance-subset.md](./jq-conformance-subset.md). |
| Command/event subset in `docs/engine-profile.md` §6 | Core | Supported | Replay-oriented history. |
| `CheckpointWritten` + `definitionHash` binding | Core | Supported | Canonical JSON hash; resume/submit/continuation verify definition. See BEN-78. |
| `interrupt` inside `parallel` branch | Refused | Validate + runtime refuse | Code `INTERRUPT_IN_PARALLEL_BRANCH`; invariant in `workflow-graph-invariants.mjs`. See BEN-77. |
| `wait` `kind: signal` | Optional (host) | Runtime error without host | Requires host `workflow_signal`; not bare engine. |
| Per-node `retry` / `timeout` | Optional | **Applied** | Walker enforces `timeout` on activity nodes; retries per `retry.max_attempts` |
| Top-level `checkpointing` policy | Optional | Supported | Default `after_each_node`; `disabled` / `every_n_nodes`. |
| `tool_call` delegation bridge | Optional (legacy) | Supported | Prefer native `agent_delegate` for GA; see migration doc. |
| Definition signing | Optional | Not implemented | R4 security story (BEN-10). |
| REST / SDK parity with MCP | Optional | Partial | MCP stdio adapter is reference surface. |
| Full RFC command taxonomy (`CancelTimer`, `EmitSignal`, …) | Optional | Out of profile | Listed in `docs/engine-profile.md` §6. |

---

## Runtime gaps called out for GA adopters

1. **`wait.signal`** — Document and validate; execute only with a host that implements signal delivery and correlation (RFC-04 `EmitSignal` / host contract). Bare engine fails fast with a clear message.
2. **`retry` / `timeout`** — Both are applied by the walker for `step`, `llm_call`, and `tool_call`. `timeout` is a duration string; in-process runs race the activity port; host-mediated runs include `timeoutMs` on `ActivityRequested` for the host to honor.
3. **`interrupt` in `parallel`** — Do not author; validators and runtime refuse. Resume-safe correlation inside branches is a follow-on (separate story if promoted to optional).

---

## Related work (split from BEN-8)

| Linear issue | Topic | Status in repo |
|--------------|-------|----------------|
| BEN-77 | Parallel-branch interrupt enforcement | Done (validate + runtime) |
| BEN-78 | `definitionHash` binding + start idempotency | Done (`definition-hash-binding.test.mjs`, MCP port) |
| BEN-79 | (per backlog) | — |
| BEN-80 | Host-mediated continuation | Done on base branch |

---

## Change control

Update this matrix when `docs/engine-profile.md`, the schema bundle, or conformance tags change. Pair with [jq-conformance-subset.md](./jq-conformance-subset.md) and [migration-alpha-to-ga.md](./migration-alpha-to-ga.md) in the same PR when profile boundaries move.
