# `@agent-workflow/engine`

Publishable npm package: **definition-time** validation for Agent Workflow Protocol workflow documents per [`docs/engine-profile.md`](../../docs/engine-profile.md), an **append-only execution history** port (SQLite or in-memory), a **linear graph runner**, and a **general graph walker** with `switch`, `interrupt` / resume, **parallel** join policies (`all` / `any` / `n_of_m`), **wait** (`duration` / `until`; `signal` needs a host), **set_state**, **`agent_delegate`** (in-process mock A2A), and **`subworkflow`** (nested runs with depth limit; register child defs via `registerWorkflowRef`).

## Entrypoint (CLI)

From the repository root (after `npm install`):

```bash
node packages/engine/src/cli.mjs validate path/to/workflow.json
```

Or use the package bin name when linked:

```bash
npx workflows-engine validate path/to/workflow.json
```

Validate an operator MCP manifest (Cursor-style `mcpServers` subset for stdio servers):

```bash
node packages/engine/src/cli.mjs mcp-manifest validate path/to/mcp.json
```

See `docs/architecture/arc42-assets/contracts/mcp-operator-manifest.md` and exports `validateMcpOperatorManifest`, `readAndValidateMcpOperatorManifestFile`, `resolveMcpOperatorManifestPath` from the package entrypoint.

## MCP stdio adapter

Run from repository root:

```bash
npm run engine:mcp:stdio
```

Or from the engine workspace:

```bash
npm run mcp:stdio --workspace=@agent-workflow/engine
```

Or invoke the bin entrypoint directly:

```bash
npx workflows-engine-mcp
```

No-install npm usage for MCP hosts:

```bash
# consume the latest alpha channel publish (use -p: package ships two bins)
npx -y -p @agent-workflow/engine@alpha workflows-engine-mcp

# consume a pinned, reproducible package version
npx -y -p @agent-workflow/engine@0.1.2 workflows-engine-mcp
```

**Operator setup (default for MCP clients)** — register the published package; the host runs `npx` and does not need this repository on disk. Use `-y` (non-interactive) and `-p` so npm selects the `workflows-engine-mcp` bin when both `workflows-engine` and `workflows-engine-mcp` are present:

```json
{
  "mcpServers": {
    "workflow-engine": {
      "command": "npx",
      "args": ["-y", "-p", "@agent-workflow/engine@alpha", "workflows-engine-mcp"]
    }
  }
}
```

**Development setup** — point `node` at `packages/engine/src/mcp-stdio-server.mjs` inside your clone when working on the adapter or engine.

This starts a dedicated MCP stdio adapter layer with tools `workflow_start`, `workflow_status`, `workflow_resume`, **`workflow_submit_activity`**, **`workflow_signal`**, **`workflow_cancel`**, and **`workflow_list`**. The adapter maps MCP request DTOs to the stable application port (`createWorkflowApplicationPort`) and translates engine failures into structured MCP tool errors with stable error codes.

**Cooperative cancel:** `workflow_cancel` appends `ExecutionCancelled` at host pause points (`awaiting_signal`, `awaiting_activity`, `interrupted`). It does not interrupt an in-process node that is actively executing inside the same call stack.

Operator smoke runbook: `docs/architecture/arc42-assets/runbooks/mcp-stdio-host-smoke.md`.

**Assistant hosts** that own LLM/tool credentials should pass `activity_execution_mode: "host_mediated"` and complete activities via `workflow_submit_activity`. End-user guide: [`docs/user/host-mediated-activities.md`](../../docs/user/host-mediated-activities.md) ([ADR-0002](../../docs/architecture/adr/ADR-0002-host-mediated-activity-execution.md)).

### Engine-direct `tool_call` execution (optional)

By default, `workflows-engine-mcp` uses the **in-process stub** executor for activity placeholders when **no operator activity config** is set. That default is intended for **local demo and smoke tests only** — not a silent production fallback. For production, configure at least one real sub-executor (see **Composite activity routing** below).

To run **`tool_call` nodes against real MCP stdio servers**, enable engine-direct configuration:

- **Environment:** set `WORKFLOW_ENGINE_MCP_CONFIG` to the absolute or relative path of an operator MCP manifest JSON file.
- **CLI:** pass `--mcp-config <path>` after the bin name (overrides `WORKFLOW_ENGINE_MCP_CONFIG` when both are set).

The manifest matches the schema validated by `workflows-engine mcp-manifest validate` (Cursor-style `mcpServers` with stdio `command` / `args` / `env`). Workflow nodes use `tool_call` with `config.server` (manifest key) and `config.tool` (MCP tool name). If the file is missing or invalid JSON/schema, the process **exits with code 1** before accepting MCP traffic; errors are written to **stderr**.

Security, credentials, and trust boundaries for this profile are documented in [ADR-0003: Engine-direct MCP activity execution](../../docs/architecture/adr/ADR-0003-engine-direct-mcp-activity-execution.md). Host-mediated completion via `workflow_submit_activity` is unchanged when you use `activity_execution_mode: host_mediated`; after a submit, continuations still use the same port-level executor when engine-direct is enabled.

### Engine-direct `llm_call` execution (`LlmActivityExecutor`)

`LlmActivityExecutor` implements the **`ActivityExecutor`** port for **`llm_call`** nodes. It reads `node.config` (`model`, `system_prompt`, `user_prompt` / `prompt`, optional `output_schema`) and resolves provider credentials from **operator config** — not workflow JSON ([RFC-07 §7.3](../../docs/RFC/rfc-07-security-model.md)).

```js
import { LlmActivityExecutor, runGraphWorkflow } from "@agent-workflow/engine";

const activityExecutor = new LlmActivityExecutor({
  operatorConfig: {
    apiKeyEnv: "OPENAI_API_KEY", // apiKeySecretRef accepted; vault resolver deferred to BEN-103
    baseUrl: "https://api.openai.com/v1", // optional OpenAI-compatible base
  },
});
```

Inject a custom **`LlmProvider`** for tests or non-OpenAI backends; the default uses fetch against `/chat/completions` with no extra SDK. Structured outputs are validated with AJV when `output_schema` is set. Failures return stable codes: `LLM_CONFIG_INVALID`, `LLM_CREDENTIALS_MISSING`, `LLM_PROVIDER_ERROR`, `LLM_OUTPUT_VALIDATION_FAILED` (surfaced as `ActivityFailed` in execution history).

#### Prompt resolution (`buildLlmChatMessages`)

`LlmActivityExecutor` builds the provider chat payload from `node.config` and the current workflow **`state`** via `buildLlmChatMessages`:

| Message | Source |
|---------|--------|
| `system` | `config.system_prompt` when present — passed through as a **literal string** |
| `user` | `config.user_prompt` or `config.prompt` (alias) when present — **literal string**; otherwise `JSON.stringify(state)` when state has keys; otherwise the fixed fallback `"Respond according to the system instructions."` |

**No jq or state templating.** Unlike `agent_delegate`, `subworkflow`, and engine-direct `tool_call` nodes (which resolve `config.input_mapping` with jq), `llm_call` prompts are **not** evaluated against workflow state. Placeholders in `system_prompt` or `user_prompt` are sent to the provider unchanged.

When prompts must be derived from state (for example inserting `ticket_text` into a user message), use one of:

- A preceding **`set_state`** node to shape state, then omit `user_prompt` so the executor serializes state into the user message (lighthouse `classify` uses this pattern).
- **`activity_execution_mode: "host_mediated"`** so the host templates prompts from `node.config` and `state` before calling its LLM and submitting the outcome (see [`docs/user/host-mediated-activities.md`](../../docs/user/host-mediated-activities.md)).

### Engine-direct `step` execution (`StepActivityExecutor`)

`StepActivityExecutor` implements the **`ActivityExecutor`** port for **`step`** nodes. It reads `node.config.handler` (a string URN) and looks up the implementation in an operator-provided **`StepHandlerRegistry`** registered at bootstrap — not in workflow JSON.

```js
import { StepActivityExecutor, StepHandlerRegistry, runGraphWorkflow } from "@agent-workflow/engine";

const registry = new StepHandlerRegistry();
registry.register("urn:my-app:handlers:lookup-customer", async (ctx) => {
  return { customerId: "c-1", name: "Ada" };
});
const activityExecutor = new StepActivityExecutor({ registry: registry.createFrozenCopy() });
```

**v1 sandboxing:** handlers run in the **same Node.js process** as the engine (in-process dispatch). There is no worker isolation, VM sandbox, or resource cap in this profile milestone — treat registered handlers as trusted operator code. Isolated worker processes are deferred to a later release.

**`WORKFLOW_ENGINE_STEP_HANDLERS` is static output only.** The MCP stdio bin reads this env var as a JSON map of handler URN → **fixed output object**. Each entry is wrapped as an async handler that **returns that object unchanged** — there is no way to supply programmatic logic (no I/O, no state inspection, no side effects). Use this for smoke tests and conformance-style fixtures. For real handler code, register async functions via `StepHandlerRegistry.register` at library bootstrap (see example above) and pass the frozen registry to `StepActivityExecutor` / `createWorkflowApplicationPort`.

Stable failure codes: `STEP_CONFIG_INVALID` (missing/invalid `handler`), `HANDLER_NOT_FOUND` (URN not registered), `HANDLER_ERROR` (handler threw). Success merges handler output into workflow state per `state_schema` reducers.

### Composite activity routing (`CompositeActivityExecutor`)

`CompositeActivityExecutor` is the production router for **`step`**, **`llm_call`**, and **`tool_call`** nodes. It dispatches by `ctx.node.type` to optional sub-executors (`StepActivityExecutor`, `LlmActivityExecutor`, `McpManifestActivityExecutor`). When a routed node type has no configured sub-executor, execution fails with stable code **`COMPOSITE_EXECUTOR_NOT_CONFIGURED`** (unless an explicit **`fallback`** is injected — see demo profile below).

```js
import {
  buildCompositeActivityExecutor,
  LlmActivityExecutor,
  McpManifestActivityExecutor,
  StepActivityExecutor,
} from "@agent-workflow/engine";

const activityExecutor = buildCompositeActivityExecutor({
  step: new StepActivityExecutor({ registry }),
  llm_call: new LlmActivityExecutor({ operatorConfig: { apiKeyEnv: "OPENAI_API_KEY" } }),
  tool_call: new McpManifestActivityExecutor({ manifest }),
});
```

Pass the composite (or any custom `ActivityExecutor`) to `createWorkflowApplicationPort({ activityExecutor })` or `runGraphWorkflow({ activityExecutor })`.

**`workflows-engine-mcp` wiring:** when any operator config is present, the stdio bin loads a composite via `loadProductionActivityExecutor`:

| Env var | Sub-executor |
|---------|----------------|
| `WORKFLOW_ENGINE_MCP_CONFIG` / `--mcp-config` | `tool_call` → `McpManifestActivityExecutor` |
| `WORKFLOW_ENGINE_LLM_CONFIG` (inline JSON or file path) | `llm_call` → `LlmActivityExecutor` |
| `WORKFLOW_ENGINE_STEP_HANDLERS` (inline JSON or file path; **static** URN → output map only — not programmatic handlers) | `step` → `StepActivityExecutor` |

When **none** of these are set, the MCP adapter omits `activityExecutor` and the walker uses **`StubActivityExecutor`** (demo/local only). Set **`WORKFLOW_ENGINE_PROFILE=demo`** to add stub **fallback** inside a partial composite (unconfigured node types return `{}` instead of `COMPOSITE_EXECUTOR_NOT_CONFIGURED`). Do **not** rely on stub fallback in production deployments.

On successful startup, `workflows-engine-mcp` writes a structured **activity routing** summary to stderr so operators can see which node types are production-configured vs missing before workflows fail at runtime:

```
[engine-mcp-stdio] activity routing: llm_call=production, tool_call=missing, step=missing
[engine-mcp-stdio] demo stub fallback: inactive
```

Route values: **`production`** (env/config present), **`missing`** (partial composite, no demo fallback — hits `COMPOSITE_EXECUTOR_NOT_CONFIGURED` at runtime), **`stub(demo)`** (unconfigured but covered by `WORKFLOW_ENGINE_PROFILE=demo` fallback), **`stub(default)`** (no operator activity config; full in-process stub mode).

### Delegate routing (`CompositeDelegateExecutor`)

**`agent_delegate`** nodes run through a **`DelegateExecutor`** port (`executeDelegate(ctx)`). Omit `delegateExecutor` to use **`MockA2ADelegateExecutor`** (offline demos). Production adapters:

| Executor | Protocol | Wiring |
|----------|----------|--------|
| `A2ADelegateExecutor` | `a2a` | HTTP submit + poll (`operatorConfig.baseUrl`, `apiKeyEnv`) |
| `McpDelegateExecutor` | `mcp` | Operator manifest `delegateAgents` → MCP stdio `tools/call` |
| `SdkDelegateExecutor` | `sdk` | In-process `Map<agent_id, handler>` (extension point for embedded agents) |

Route multiple protocols with **`buildCompositeDelegateExecutor({ a2a, mcp, sdk })`**. Stable failure codes include **`DELEGATE_AGENT_NOT_FOUND`**, **`DELEGATE_PROTOCOL_ERROR`**, and **`DELEGATE_PROTOCOL_UNSUPPORTED`**. See [A2A delegate mapping](../../docs/user/a2a-delegate-mapping.md) and [MCP operator manifest](../../docs/architecture/arc42-assets/contracts/mcp-operator-manifest.md).

> **Operator constraints:** **`A2ADelegateExecutor`** runs submit + poll **inside** the control-plane call (`workflow_start`, resume, or in-process continuation). Poll may block up to **`pollTimeoutMs`** (default **120s**); MCP stdio hosts often timeout sooner. Poll **throws** on A2A **`input-required`** — it does not yield. **`McpDelegateExecutor`** is **single-shot** (one stdio `tools/call`; no status poll loop). For long-running, interactive, or **`input-required`** delegates, pass **`activity_execution_mode: "host_mediated"`** and complete via **`workflow_submit_activity`** ([host-mediated guide](../../docs/user/host-mediated-activities.md), [A2A input-required migration](../../docs/user/a2a-delegate-mapping.md#migrating-from-in-process-a2a-when-a-task-needs-input)).

```js
import {
  buildCompositeDelegateExecutor,
  McpDelegateExecutor,
  SdkDelegateExecutor,
} from "@agent-workflow/engine";

const delegateExecutor = buildCompositeDelegateExecutor({
  mcp: new McpDelegateExecutor({ manifest }),
  sdk: new SdkDelegateExecutor({
    handlers: {
      "urn:my-app:agents:local": async (input) => ({ patch: input.task }),
    },
  }),
});
```

**`workflows-engine-mcp` wiring:** when any operator config is present, the stdio bin loads a composite via `loadProductionDelegateExecutor`:

| Env var | Sub-executor |
|---------|----------------|
| `WORKFLOW_ENGINE_A2A_CONFIG` (inline JSON or file path) | `a2a` → `A2ADelegateExecutor` |
| `WORKFLOW_ENGINE_MCP_CONFIG` / `--mcp-config` (`delegateAgents` in manifest) | `mcp` → `McpDelegateExecutor` |

When **none** of these are set, the MCP adapter omits `delegateExecutor` and the walker uses **`MockA2ADelegateExecutor`** (demo/local only). Set **`WORKFLOW_ENGINE_PROFILE=demo`** to add mock **fallback** inside a partial composite (unconfigured protocols succeed with in-process mock output instead of `DELEGATE_PROTOCOL_UNSUPPORTED`). Do **not** rely on mock fallback in production deployments.

Invalid `WORKFLOW_ENGINE_A2A_CONFIG` (missing `baseUrl`) or an invalid operator manifest fails **at MCP stdio startup** with readable stderr messages (same pattern as activity bootstrap).

### Host compatibility constraints for no-install use

- **Node runtime:** Node.js `>=22.5.0` is required (uses `node:sqlite`).
- **Process launch model:** Host must be able to spawn `npx` and execute package bin commands.
- **Transport expectation:** Host must communicate over MCP stdio with piped `stdin`/`stdout`.
- **Stderr behavior:** Treat `stderr` as logs/diagnostics; do not parse protocol frames from `stderr`.

### MCP tool contracts (minimum set)

- `workflow_start`
  - args: `{ execution_id?: string, definition: object, input: object, activity_execution_mode?: "in_process" | "host_mediated", allow_existing_execution_id?: boolean }`
  - returns: `{ execution_id, status, final_state?, result?, error?, node_id?, state?, parallel_span? }`
  - notes: if `execution_id` is omitted, the engine generates a stable UUID and returns it for follow-up calls. Reusing an `execution_id` that already has persisted history is rejected with **`DUPLICATE_EXECUTION_ID`** unless **`allow_existing_execution_id: true`** (replay/idempotency continuation). With **`activity_execution_mode: "host_mediated"`**, the engine returns `status: "awaiting_activity"` after recording `ActivityRequested` for the next activity node; the host completes it via `workflow_submit_activity`.
- `workflow_status`
  - args: `{ execution_id: string }`
  - returns: `{ execution_id, phase, current_node_id?, last_error? }`
  - notes: `phase/current_node_id/last_error` are projected deterministically from persisted execution history (including resume/checkpoint-driven progress), not adapter-local mutable state. Phase **`awaiting_activity`** indicates the last non-checkpoint event is `ActivityRequested` (host-mediated pending).
- `workflow_resume`
  - args: `{ execution_id: string, definition: object, resume_payload: object, activity_execution_mode?: "in_process" | "host_mediated" }`
  - returns: `{ execution_id, status, final_state?, result?, error?, node_id?, state?, parallel_span? }`
  - notes: resume payloads are validated against the interrupt node `resume_schema`; invalid or stale resume attempts return structured tool errors.
- `workflow_submit_activity`
  - args: `{ execution_id: string, definition: object, input: object, node_id: string, outcome: { ok: true, result?: object } | { ok: false, error: string, code?: string }, parallel_span?: object, activity_execution_mode?: "in_process" | "host_mediated" }`
  - returns: same shape as `workflow_resume` results, plus optional `code` when `status` is `failed` from submit validation (usually surfaced as a tool error instead).
  - notes: append activity success/failure after a host-mediated yield; **`definition` must match** the canonical hash bound at the latest `CheckpointWritten` (`definitionHash`); mismatch returns **`SUBMIT_VALIDATION_ERROR`**. **`input` must match** the original `workflow_start` (replay). For activities under a `parallel` branch, pass **`parallel_span`** matching the `parallel_span` returned from `workflow_start` / prior submit.
- `workflow_signal`
  - args: `{ execution_id, definition, input, signal_name, payload?, activity_execution_mode? }`
  - returns: same shape as `workflow_resume` results when continuing after a signal wait.
  - notes: delivers `DeliverSignal` / `SignalReceived` for a pending `wait` node with `config.kind: signal`. Signal **`payload`** keys merge into workflow state via `state_schema` reducers. Unknown execution ids return **`EXECUTION_NOT_FOUND`**.
- `workflow_cancel`
  - args: `{ execution_id, reason? }`
  - returns: `{ execution_id, status: "cancelled" | "failed", reason?, error?, code? }`
  - notes: cooperative cancel at pause points; unknown execution ids return **`EXECUTION_NOT_FOUND`**; terminal runs return **`CANCEL_NOT_ALLOWED`**.
- `workflow_list`
  - args: `{ phase?, definition_name?, updated_after?, updated_before?, limit?, cursor? }`
  - returns: `{ executions: [{ execution_id, phase, definition_name?, updated_at? }], next_cursor? }`
  - notes: lists persisted executions newest-first; default page size 50, max 100.

Structured adapter error codes:

- `VALIDATION_ERROR` — MCP request payload fails contract validation.
- `EXECUTION_NOT_FOUND` — requested execution id has no persisted history (`workflow_status` / store lookups).
- `DUPLICATE_EXECUTION_ID` — `workflow_start` reused an `execution_id` that already has history without `allow_existing_execution_id: true`.
- `INVALID_RESUME_PAYLOAD` — resume payload fails schema, definition hash mismatch vs latest checkpoint, or resume is stale/not allowed.
- `ACTIVITY_SUBMIT_NOT_AWAITING` — cannot submit: execution missing or last event is not `ActivityRequested`.
- `ACTIVITY_SUBMIT_NODE_MISMATCH` — `node_id` does not match the pending activity.
- `ACTIVITY_SUBMIT_PARALLEL_MISMATCH` — `parallel_span` missing or does not match the pending `ActivityRequested`.
- `SUBMIT_VALIDATION_ERROR` — submit request failed definition/store validation before append.
- `SIGNAL_NOT_AWAITING` / `SIGNAL_NAME_MISMATCH` / `SIGNAL_VALIDATION_ERROR` — signal delivery rejected.
- `CANCEL_NOT_ALLOWED` / `CANCEL_VALIDATION_ERROR` — cancel rejected (terminal run or invalid args).
- `ENGINE_FAILURE` — engine reported workflow failure that is not an adapter contract issue.
- `INTERNAL_ERROR` — unexpected adapter failure.

- **File argument:** Path to a file containing **canonical JSON** (RFC-03: normalized JSON, not YAML at runtime).
- **Stdin:** Omit the file argument or pass `-` to read JSON from stdin.

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | Document is valid against the bundled workflow schema. |
| 1 | JSON parsed but schema validation failed (details on stderr). |
| 2 | Usage error, I/O failure, or JSON parse error. |

On validation failure, stderr lists each AJV error with `instancePath`, `keyword`, `schemaPath`, `params`, and `message` where present so documents can be fixed without guessing.

## Library API

The package exports:

- `validateWorkflowDefinition(data)` — returns `{ ok: true }` or `{ ok: false, errors }` where `errors` is AJV’s `ErrorObject[]` (includes `instancePath`, `keyword`, `schemaPath`, etc.).
- `compileWorkflowValidator()` — returns a reusable `(data) => { ok: true } | { ok: false, errors }` function; the compiled schema is cached per process.
- `findWorkflowRepoRoot(startDir?)` — locates the **workflows** monorepo root (lighthouse fixture + root `package.json` named `workflows`) for tests and examples; schema loading prefers the bundled `packages/engine/schemas/workflow-definition.json` when present.
- `runGraphWorkflow(...)` / `resumeGraphWorkflow(...)` / `submitActivityOutcome(...)` — general graph walker with `switch`, `interrupt`, parallel joins, and composition nodes (see **General graph orchestration** below).

### Linear orchestration

**API:** `runLinearWorkflow({ definition, input, executionId, store, stubActivityOutputs?, activityExecutor? })` → `Promise<{ status: 'completed'|'failed', finalState?, result?, error? }>`.

Phases: **validate** (bundled workflow schema + reject `state_schema.properties.*.reducer === "custom"`) → **start** (`ExecutionStarted`) → **walk** each node on the unique chain from `__start__` through exactly one `start` … `end` → **complete** (`ExecutionCompleted` with jq result) or **fail** (`ExecutionFailed`, plus `FailNode` command when failure happens after start).

**Graph rules:** Edges must form a **single linear path** covering every node: exactly one edge from `__start__`, at most one outgoing edge per node, no cycles, exactly one `start` and one `end`. `switch` and `interrupt` nodes are rejected by this runner (use the general graph walker). Unknown topology errors throw from `computeLinearNodePath` or return `{ status: 'failed', error }` from `runLinearWorkflow`.

**Activity boundary:** `step`, `llm_call`, and `tool_call` are executed through an **`ActivityExecutor`** port (`executeActivity(ctx)` → success with `output` or failure with `error` / optional `code`). The walker only calls this port (no MCP, HTTP, or provider SDKs inside the runner). **`StubActivityExecutor`** is the default when `activityExecutor` is omitted: deterministic, returns `{}` or per-node outputs from an `outputsByNodeId` map (library demos and tests). **`CompositeActivityExecutor`** routes production workloads to configured sub-executors; pass `activityExecutor` to inject real adapters; pass `stubActivityOutputs` only affects the default stub when `activityExecutor` is omitted.

**Limitation:** Per-node **`retry`** and **`timeout`** settings from the workflow definition are **not** applied by this runner yet; failures return immediately after a single `executeActivity` call.

**Node types in this runner:** `start`, `end`, and **`step` / `llm_call` / `tool_call`** behind the activity executor. Default stub outputs are `{}`; override per node id with `stubActivityOutputs[nodeId]` (merged into state via reducers).

**State:** Initial state is a shallow copy of `input`. After each non-`end` node, outputs are merged using `state_schema.properties.<key>.reducer`: `overwrite` (default), `append` (array concat), `merge` (deep object merge). After each merge, state is validated with Ajv against `state_schema` (reducer annotations are stripped for compilation only).

**`end` node `config.output_mapping`:** Must be a **jq** program string. It is evaluated with **jq’s input root = the current workflow state object** (after all reducer updates from prior nodes). If `output_mapping` is omitted, the runner uses `.` (identity). Evaluation uses the **`jq-wasm`** package (WebAssembly jq — no native compile).

**History (command/event names):** Appends include at least `ExecutionStarted`; for each node `ScheduleNode` (command) and `NodeScheduled` (event); for activities `ActivityRequested` then `ActivityCompleted` or `ActivityFailed`; `CompleteNode` (command); `StateUpdated` (event) after state changes; terminal `ExecutionCompleted` or `ExecutionFailed`. On activity failure the runner records `ActivityFailed`, then `FailNode` (`reason: "activity_failed"`), then `ExecutionFailed`. Payloads include `executionId` and `nodeId` where applicable.

**Helpers (also exported):** `assertNoCustomReducers(definition)`, `applyOutputWithReducers(state, output, stateSchema)`, `computeLinearNodePath(nodes, outgoingMap)`.

### General graph orchestration

**API:** `runGraphWorkflow({ definition, input, executionId, store, stubActivityOutputs?, activityExecutor?, activityExecutionMode? })` and `resumeGraphWorkflow({ definition, executionId, store, resumePayload, stubActivityOutputs?, activityExecutor?, activityExecutionMode? })`. **`activityExecutionMode`** defaults to `"in_process"` (run `ActivityExecutor` immediately). With **`"host_mediated"`**, the walker returns `{ status: 'awaiting_activity', nodeId, state, parallelSpan? }` after `ActivityRequested` (assistant-class hosts opt in explicitly — see ADR-0002). Continue by appending the outcome and calling `runGraphWorkflow` again, or use **`submitActivityOutcome({ definition, executionId, store, input, nodeId, outcome, expectedParallelSpan?, ... })`** (also exported) which validates the pending request and re-enters the walker. Parallel branches attach **`parallelSpan`** to `ActivityRequested`; submits for those nodes must pass the same **`expectedParallelSpan`**.

`runGraphWorkflow` supports node types `start`, `end`, `step`, `llm_call`, `tool_call`, `switch`, `interrupt`, `parallel`, `wait`, `set_state`, `agent_delegate`, and `subworkflow`. Phases and command/event names match the linear runner (`ExecutionStarted`, `ScheduleNode`, `NodeScheduled`, activity events, `CompleteNode`, `StateUpdated`, terminal `ExecutionCompleted` / `ExecutionFailed`), plus interrupt lifecycle: `RaiseInterrupt`, `InterruptRaised`, and on resume `ResumeInterrupt`, `InterruptResumed`. On entering an `interrupt` node the walker appends `RaiseInterrupt` / `InterruptRaised` (payload includes `nodeId` and a short `prompt` summary) and returns `{ status: 'interrupted', executionId, nodeId, state }` **without** `CompleteNode` for that node until `resumeGraphWorkflow` runs.

**`switch` routing:** Successors come **only** from `config.cases` (first jq match wins; jq input root is the **current workflow state object**, same as the linear runner) and `config.default` when no case matches. If any `cases` exist and none match and `default` is omitted, the run fails with a clear error. **Static `edges` whose `source` is the switch node id are ignored for routing** (they may exist in documents; the engine does not follow them). This matches the routing guidance in `docs/engine-profile.md` (avoid duplicate routing channels).

**Static `edges` (non-switch):** Exactly one outgoing edge from `__start__`, and from each of `start`, `step`, `llm_call`, `tool_call`, and `interrupt`; none from `end`. The walker does not require outgoing edges from `switch` nodes.

**Resume:** `resumeGraphWorkflow` loads history, takes the latest `StateUpdated` payload `state`, validates `resumePayload` with Ajv against the interrupt node’s `config.resume_schema` (reducer annotations stripped the same way as workflow `state_schema`), merges resume fields into state (overwrite keys), then continues from the **single** static successor of the interrupt node. Invalid resume appends `FailNode` (`reason: "resume_validation_failed"` when schema fails) and `ExecutionFailed`. If the last event is not `InterruptRaised`, resume fails with `FailNode` / `ExecutionFailed` and `reason: "resume_not_allowed"`.

**Checkpoint policy:** checkpointing is **on by default** (`definition.checkpointing` omitted ⇒ `after_each_node`). Disable or tune via `definition.checkpointing.strategy` (alias `policy`):

| Strategy | Effect |
|----------|--------|
| `after_each_node` (default) | Emit `CheckpointWritten` on each eligible boundary below. |
| `every_n_nodes` / `interval` | Emit every *n* eligible boundaries (`n` or `interval` integer ≥ 1). |
| `disabled` / `off` / `none` | No `CheckpointWritten` events. |

Eligible boundaries (when enabled and the interval counter allows):

- after each `StateUpdated` (activity nodes, `switch`, `parallel` branch progress, `wait`, `set_state`, `agent_delegate`, `subworkflow`, and post-resume continuation),
- after `InterruptRaised`,
- after `InterruptResumed` state is recorded.

Parallel branches may attach **`parallelSpan`** on the checkpoint payload. Each checkpoint includes `workflowVersion`, `definitionHash` (SHA-256 of **canonical JSON** with lexicographically sorted object keys; see `packages/engine/src/canonical-json.mjs` and RFC-03), `lastAppliedEventSeq`, `nodeId`, and `stateRef` (`inline_state` snapshot today). Resume, activity submit, and graph continuation verify caller `definition` against the latest checkpoint hash when a checkpoint exists.

**Recovery loading:** `hydrateReplayContext({ startMode: "safe_point" })` prefers the latest valid `CheckpointWritten` boundary and starts replay from `lastAppliedEventSeq + 1`. If checkpoints are absent or invalid, hydration falls back to genesis replay (`startSeq = 1`).

### Workflow references

`subworkflow` nodes resolve `config.workflow_ref` at runtime through an in-process registry (`src/orchestrator/workflow-ref-resolver.mjs`).

- **`registerWorkflowRef(workflowRef, definition)`** — register a parsed child definition object before running a parent that references `workflowRef`. Registrations last for the process lifetime.
- **`clearWorkflowRefs()`** — reset the registry (tests and long-lived hosts).

Import these helpers from `workflow-ref-resolver.mjs` (they are not re-exported from the package entrypoint today).

**Monorepo checkout:** one built-in reference resolves from disk when the **workflows** repository root is discoverable (`findWorkflowRepoRoot()`): `urn:awp:wf:unit-tests` → `examples/r3-unit-tests-child.workflow.json`.

**Published npm install:** the tarball ships only `src/`, `schemas/`, and this README (`examples/` is not bundled). Built-in URNs do not resolve on disk; register every `workflow_ref` your definitions use via `registerWorkflowRef`, or load child JSON from your own artifact store and register it before `runGraphWorkflow` / MCP `workflow_start`.

Operator-oriented summary: [arc42 cross-cutting — workflow reference resolution](../../docs/architecture/arc42/08-cross-cutting-concepts.md#88-workflow-reference-resolution-subworkflow). Release notes: [alpha — known limitations](../../docs/releases/alpha-release-notes.md#known-limitations).

### Execution history

**Port:** `ExecutionHistoryStore` (documented in `src/persistence/types.mjs`) — append-only, per-`executionId` ordering.

- `append(executionId, { kind: 'command' | 'event', name, payload })` → assigned `seq` (integer, starts at 1 per execution).
- `readRange(executionId, fromSeq?, toSeq?)` — inclusive bounds when provided; rows ordered by `seq` ascending.
- `listByExecution(executionId)` — all rows for that execution.
- `listExecutions({ phase?, definitionName?, updatedAfter?, updatedBefore?, limit?, cursor? })` — list execution summaries across ids (newest `updatedAt` first). `phase` matches status projection values (`running`, `completed`, `failed`, `interrupted`, `awaiting_activity`, `awaiting_signal`, `cancelled`). Pagination: default `limit` 50, max 100; `cursor` is `updatedAt|executionId` from a prior page’s `nextCursor`.

**Adapters:**

- `SqliteExecutionHistoryStore` — uses **built-in** [`node:sqlite`](https://nodejs.org/api/sqlite.html) (`DatabaseSync`). Pass `{ path }` for a file or `:memory:`; pass `{ database }` to inject a `DatabaseSync` (caller closes it if needed). Requires **Node.js ≥ 22.5.0**. Call `close()` to release a store-opened connection.
- `MemoryExecutionHistoryStore` — array-backed; same monotonic semantics for tests.

**Storage layout (SQLite table `history`):**

| Column         | Type    | Role |
|----------------|---------|------|
| `execution_id` | TEXT    | Correlation key for one run |
| `seq`          | INTEGER | Monotonic sequence per execution (part of primary key) |
| `kind`         | TEXT    | `command` or `event` |
| `name`         | TEXT    | Command/event name (protocol taxonomies) |
| `payload_json` | TEXT    | JSON-serialized payload object |
| `created_at`   | TEXT    | ISO 8601 timestamp when the row was appended |
| `record_schema_version` | INTEGER | Persisted **row envelope** version (not `document.schema`); see below |

Primary key: `(execution_id, seq)`. Historical rows are not updated or deleted by the adapter API.

**Envelope versioning:** Each row is stamped with `record_schema_version` (currently `1`). Opening an existing database without this column runs `ALTER TABLE … ADD COLUMN … DEFAULT 1`. Replay, resume, and status paths call `assertHistoryReadableByEngine`: rows newer than this engine build fail fast so hosts upgrade `@agent-workflow/engine` instead of corrupting replay. Policy and read rules: [`docs/persistence-history-record-versioning.md`](../../docs/persistence-history-record-versioning.md).

**Concurrency:** Treat the store as **single-writer per process** for a given execution (and avoid multiple processes appending to the same file for the same execution id). SQLite assigns `seq` inside a **transaction** (`BEGIN IMMEDIATE` … `COMMIT`) that reads `MAX(seq)` for the execution and then inserts the next row, so ordering stays monotonic for that writer.

**Why `node:sqlite`:** Avoids native addon builds (for example on Windows without a full C++ toolchain). On some Node versions the module may log an experimental/RC warning; behavior is still suitable for this append-only log.

Example:

```js
import { validateWorkflowDefinition, SqliteExecutionHistoryStore } from "@agent-workflow/engine";
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("workflow.json", "utf8"));
const result = validateWorkflowDefinition(data);
if (!result.ok) console.error(result.errors);

const history = new SqliteExecutionHistoryStore({ path: "./runs.sqlite" });
const seq = history.append("run-1", { kind: "command", name: "StartRun", payload: {} });
console.log(seq, history.listByExecution("run-1"));
history.close();
```

## Stable “valid definition” boundary (for later engine stories)

- **Schema contract:** The engine validates against the same file as CI and `scripts/validate-workflows.mjs`: **`schemas/workflow-definition.json`** (JSON Schema Draft 2020-12).
- **Ajv options:** `allErrors: true`, `strict: false` — identical to `scripts/validate-workflows.mjs` to avoid drift from “repo truth.”
- **Engine-specific limits:** None beyond the schema and JSON parse rules. The engine does **not** enforce file size limits, `document.schema` version bumps, or trace companions; only the workflow **definition** JSON shape is checked.
- **Resolution rule:** The engine loads `schemas/workflow-definition.json` from the **published package** (`packages/engine/schemas/` next to `src/`, kept in sync with the repo canonical schema). In a full **workflows** monorepo checkout it can fall back to the root `schemas/` copy. `findWorkflowRepoRoot()` locates the monorepo root via `examples/lighthouse-customer-routing.workflow.json` and the root `package.json` named `workflows` (for tests and fixtures), not via schema path alone.

## Tests

```bash
npm test --workspace=@agent-workflow/engine
```

## Packaging verification guidance

From `packages/engine`, validate the publish payload before release:

```bash
npm pack --dry-run
```

Check that:

- tarball metadata resolves to `@agent-workflow/engine` with the intended version/tag source,
- both binaries are present: `src/cli.mjs` and `src/mcp-stdio-server.mjs`,
- bundled workflow schema is present: `schemas/workflow-definition.json`,
- runtime/library entrypoint is present: `src/index.mjs`,
- payload is minimal (runtime `src/`, bundled `schemas/`, package docs), with no test fixtures or unrelated repository files.
