# 4. Solution Strategy

## 4.1 Technology decisions

| Topic | Decision | Consequence |
|-------|----------|-------------|
| **Validation** | Ajv Draft 2020-12 aligned with POC schema bundle | Unified validation CLI and library API (`packages/engine/src/validate.mjs`). |
| **Execution model** | Append-only history + deterministic replay stepping | Enables crash-recovery narratives and conformance replay vectors. |
| **Two orchestration pathways** | **Linear runner** (`runLinearWorkflow`, `linear-runner.mjs`) vs **graph walker** (`runGraphWorkflow` / `resumeGraphWorkflow` / `submitActivityOutcome`, `workflow-graph-walker.mjs`) | Linear path for constrained graphs; graph path implements the POC profile node matrix including `parallel`/`wait`/`set_state` semantics. |
| **Activity boundary split** | `activityExecutionMode: "in_process" \| "host_mediated"` | Host-mediated aligns with conversational hosts (ADR-0002); in-process supports tests and automation with optional engine-direct MCP (ADR-0003). |
| **Persistence** | `MemoryExecutionHistoryStore` / `SqliteExecutionHistoryStore` behind store types | Simple swap-in for tests vs durable operator runs. |
| **Integration** | MCP stdio adapter maps DTO → application port (`createWorkflowApplicationPort`) | Transport swaps possible without rewriting orchestrator core logic. |

## 4.2 Top-level decomposition (strategy sketch)

```
[RFC / schema / examples] ──► [Validate] ──► [Orchestration + reducers/jq]
        │                                             │
        │                                             ▼
        │                               [ExecutionHistoryStore ◄► replay]
        │                                             │
        ▼                                             ▼
[Conformance harness] ◄─────────────────── [CLI / MCP / library imports]
```

## 4.3 Pattern summary

| Pattern | Where |
|---------|-------|
| **Hexagonal boundary** | Application port wraps graph operations; MCP is an adapter |
| **Event sourcing lite** | Command/event streams as source for progression |
| **Profile-driven narrowing** | `docs/poc-scope.md` is authoritative runtime subset |

## 4.4 Activity execution positioning (implemented)

`step`, `llm_call`, and `tool_call` use an injectable **`ActivityExecutor`** wired through **`createWorkflowApplicationPort`**. **`activityExecutionMode`** selects how activities complete:

| Mode | Behavior |
|------|----------|
| **`in_process`** *(default)* | After `ActivityRequested`, the walker invokes the executor immediately (tests, embedded runs, automation). Completion events append before the next scheduling step—same deterministic history shape as replay. |
| **`host_mediated`** | Walker persists **`ActivityRequested`**, exposes **`awaiting_activity`**, then **returns**. The host completes work out of band and calls **`submitActivityOutcome`** (library) / **`submitWorkflowActivity`** on the application port / **`workflow_submit_activity`** via MCP (**ADR-0002**); `ActivityCompleted` / `ActivityFailed` append before **`runGraphWorkflow`** continues from reconstructed history (**ADR-0002**, `docs/RFC/rfc-05-integration-interfaces.md`). |

Parallel branches correlate pending activities with **`parallelSpan`** on start/submit payloads when applicable (**Section 6.6**).

- **Assistant-class hosts** assume **host-mediated** activity: MCP host owns tools and credentials (**ADR-0002**); hybrid **`in_process`** remains valid for tests or embedded profiles, not the default for IDE assistants.
- **Engine-direct** (**ADR-0003**) is **opt-in** on the MCP stdio binary via `WORKFLOW_ENGINE_MCP_CONFIG` / `--mcp-config`: during **`in_process`** execution the engine may invoke configured MCP **`tools/call`** (and locally bounded handlers where profile allows) so operators do not submit every outcome manually. Manifest shape **SHOULD** align with common host descriptors (e.g. IDE `mcp.json`) where policies allow avoiding duplicate credential graphs.

**Contrast:** Host-mediated aligns with conversational hosts (**Cursor-class** tooling); engine-direct targets unattended/automation scenarios while preserving **deterministic graph-driven** progression—**not** an unconstrained autonomous loop inside the engine.

The MCP adapter maps transport DTOs to the application port and returns **stable structured error codes** (`packages/engine/src/adapters/mcp/errors.mjs`).

**Improvement candidate:** Decide whether **library subpath exports** (`package.json` `exports`) aid integrators referencing deep modules—or document **only** the supported surface via `src/index.mjs` intentionally.
