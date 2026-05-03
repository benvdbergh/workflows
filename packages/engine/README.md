# `@agent-workflow/engine`

Publishable npm package: **definition-time** validation for Agent Workflow Protocol workflow documents (POC profile + **R2** `parallel`, `wait`, `set_state`), an **append-only execution history** port (SQLite or in-memory), a **linear graph runner** (STORY-2-3), and a **general graph walker** with `switch`, `interrupt` / resume, **parallel** join policies (`all` / `any` / `n_of_m`), **wait** (`duration` / `until`; `signal` needs a host), and **set_state**.

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

See `docs/architecture/mcp-operator-manifest.md` and exports `validateMcpOperatorManifest`, `readAndValidateMcpOperatorManifestFile`, `resolveMcpOperatorManifestPath` from the package entrypoint.

## MCP stdio adapter (STORY-4-1 bootstrap)

Run from repository root:

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
npx -y -p @agent-workflow/engine@0.0.2 workflows-engine-mcp
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

This starts a dedicated MCP stdio adapter layer with tools `workflow_start`, `workflow_status`, `workflow_resume`, and **`workflow_submit_activity`** (host-mediated activity completion; see below). The adapter maps MCP request DTOs to the stable application port (`createWorkflowApplicationPort`) and translates engine failures into structured MCP tool errors with stable error codes.

Operator smoke runbook (Story-4-3): `docs/architecture/mcp-stdio-host-smoke.md`.

### Host compatibility constraints for no-install use

- **Node runtime:** Node.js `>=22.5.0` is required (uses `node:sqlite`).
- **Process launch model:** Host must be able to spawn `npx` and execute package bin commands.
- **Transport expectation:** Host must communicate over MCP stdio with piped `stdin`/`stdout`.
- **Stderr behavior:** Treat `stderr` as logs/diagnostics; do not parse protocol frames from `stderr`.

### MCP tool contracts (minimum set)

- `workflow_start`
  - args: `{ execution_id?: string, definition: object, input: object, activity_execution_mode?: "in_process" | "host_mediated" }`
  - returns: `{ execution_id, status, final_state?, result?, error?, node_id?, state?, parallel_span? }`
  - notes: if `execution_id` is omitted, the engine generates a stable UUID and returns it for follow-up calls. With **`activity_execution_mode: "host_mediated"`**, the engine returns `status: "awaiting_activity"` after recording `ActivityRequested` for the next activity node; the host completes it via `workflow_submit_activity`.
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
  - notes: append activity success/failure after a host-mediated yield; **`definition` and `input` must match** the original `workflow_start` (replay). For activities under a `parallel` branch, pass **`parallel_span`** matching the `parallel_span` returned from `workflow_start` / prior submit.

Structured adapter error codes:

- `VALIDATION_ERROR` — MCP request payload fails contract validation.
- `EXECUTION_NOT_FOUND` — requested execution id has no persisted history (`workflow_status` / store lookups).
- `INVALID_RESUME_PAYLOAD` — resume payload fails schema or resume is stale/not allowed.
- `ACTIVITY_SUBMIT_NOT_AWAITING` — cannot submit: execution missing or last event is not `ActivityRequested`.
- `ACTIVITY_SUBMIT_NODE_MISMATCH` — `node_id` does not match the pending activity.
- `ACTIVITY_SUBMIT_PARALLEL_MISMATCH` — `parallel_span` missing or does not match the pending `ActivityRequested`.
- `SUBMIT_VALIDATION_ERROR` — submit request failed definition/store validation before append.
- `ENGINE_FAILURE` — engine reported workflow failure that is not an adapter contract issue.
- `INTERNAL_ERROR` — unexpected adapter failure.

- **File argument:** Path to a file containing **canonical JSON** (RFC-03: normalized JSON, not YAML at runtime).
- **Stdin:** Omit the file argument or pass `-` to read JSON from stdin.

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | Document is valid against the POC schema. |
| 1 | JSON parsed but schema validation failed (details on stderr). |
| 2 | Usage error, I/O failure, or JSON parse error. |

On validation failure, stderr lists each AJV error with `instancePath`, `keyword`, `schemaPath`, `params`, and `message` where present so documents can be fixed without guessing.

## Library API

The package exports:

- `validateWorkflowDefinition(data)` — returns `{ ok: true }` or `{ ok: false, errors }` where `errors` is AJV’s `ErrorObject[]` (includes `instancePath`, `keyword`, `schemaPath`, etc.).
- `compileWorkflowValidator()` — returns a reusable `(data) => { ok: true } | { ok: false, errors }` function; the compiled schema is cached per process.
- `findWorkflowRepoRoot(startDir?)` — locates the **workflows** monorepo root (lighthouse fixture + root `package.json` named `workflows`) for tests and examples; schema loading prefers the bundled `packages/engine/schemas/workflow-definition-poc.json` when present.
- `runPocWorkflow(...)` / `resumePocWorkflow(...)` — general POC graph walker with `switch` and `interrupt` (see **General POC orchestration** below).

### Linear orchestration (STORY-2-3, STORY-2-4)

**API:** `runLinearWorkflow({ definition, input, executionId, store, stubActivityOutputs?, activityExecutor? })` → `Promise<{ status: 'completed'|'failed', finalState?, result?, error? }>`.

Phases: **validate** (POC schema + reject `state_schema.properties.*.reducer === "custom"`) → **start** (`ExecutionStarted`) → **walk** each node on the unique chain from `__start__` through exactly one `start` … `end` → **complete** (`ExecutionCompleted` with jq result) or **fail** (`ExecutionFailed`, plus `FailNode` command when failure happens after start).

**Graph rules:** Edges must form a **single linear path** covering every node: exactly one edge from `__start__`, at most one outgoing edge per node, no cycles, exactly one `start` and one `end`. `switch` and `interrupt` nodes are rejected (STORY-2-5). Unknown topology errors throw from `computeLinearNodePath` or return `{ status: 'failed', error }` from `runLinearWorkflow`.

**Activity boundary (STORY-2-4):** `step`, `llm_call`, and `tool_call` are executed through an **`ActivityExecutor`** port (`executeActivity(ctx)` → success with `output` or failure with `error` / optional `code`). The walker only calls this port (no MCP, HTTP, or provider SDKs inside the runner). **`StubActivityExecutor`** is the default: deterministic, returns `{}` or per-node outputs from an `outputsByNodeId` map. Pass `activityExecutor` to inject real adapters; pass `stubActivityOutputs` only affects the default stub when `activityExecutor` is omitted.

**Limitation:** Per-node **`retry`** and **`timeout`** settings from the workflow definition are **not** applied by this runner yet; failures return immediately after a single `executeActivity` call.

**Node types in this runner:** `start`, `end`, and **`step` / `llm_call` / `tool_call`** behind the activity executor. Default stub outputs are `{}`; override per node id with `stubActivityOutputs[nodeId]` (merged into state via reducers).

**State:** Initial state is a shallow copy of `input`. After each non-`end` node, outputs are merged using `state_schema.properties.<key>.reducer`: `overwrite` (default), `append` (array concat), `merge` (deep object merge). After each merge, state is validated with Ajv against `state_schema` (reducer annotations are stripped for compilation only).

**`end` node `config.output_mapping`:** Must be a **jq** program string. It is evaluated with **jq’s input root = the current workflow state object** (after all reducer updates from prior nodes). If `output_mapping` is omitted, the runner uses `.` (identity). Evaluation uses the **`jq-wasm`** package (WebAssembly jq — no native compile).

**History (POC names):** Appends include at least `ExecutionStarted`; for each node `ScheduleNode` (command) and `NodeScheduled` (event); for activities `ActivityRequested` then `ActivityCompleted` or `ActivityFailed`; `CompleteNode` (command); `StateUpdated` (event) after state changes; terminal `ExecutionCompleted` or `ExecutionFailed`. On activity failure the runner records `ActivityFailed`, then `FailNode` (`reason: "activity_failed"`), then `ExecutionFailed`. Payloads include `executionId` and `nodeId` where applicable.

**Helpers (also exported):** `assertNoCustomReducers(definition)`, `applyOutputWithReducers(state, output, stateSchema)`, `computeLinearNodePath(nodes, outgoingMap)`.

### General POC orchestration (STORY-2-5)

**API:** `runPocWorkflow({ definition, input, executionId, store, stubActivityOutputs?, activityExecutor?, activityExecutionMode? })` and `resumePocWorkflow({ definition, executionId, store, resumePayload, stubActivityOutputs?, activityExecutor?, activityExecutionMode? })`. **`activityExecutionMode`** defaults to `"in_process"` (run `ActivityExecutor` immediately). With **`"host_mediated"`**, the walker returns `{ status: 'awaiting_activity', nodeId, state, parallelSpan? }` after `ActivityRequested` (see ADR-0002). Continue by appending the outcome and calling `runPocWorkflow` again, or use **`submitActivityOutcome({ definition, executionId, store, input, nodeId, outcome, expectedParallelSpan?, ... })`** (also exported) which validates the pending request and re-enters the walker. Parallel branches attach **`parallelSpan`** to `ActivityRequested`; submits for those nodes must pass the same **`expectedParallelSpan`**.

`runPocWorkflow` supports node types `start`, `end`, `step`, `llm_call`, `tool_call`, `switch`, `interrupt`, and R2 `parallel`, `wait`, `set_state`. Phases and command/event names match the linear runner (`ExecutionStarted`, `ScheduleNode`, `NodeScheduled`, activity events, `CompleteNode`, `StateUpdated`, terminal `ExecutionCompleted` / `ExecutionFailed`), plus interrupt lifecycle: `RaiseInterrupt`, `InterruptRaised`, and on resume `ResumeInterrupt`, `InterruptResumed`. On entering an `interrupt` node the walker appends `RaiseInterrupt` / `InterruptRaised` (payload includes `nodeId` and a short `prompt` summary) and returns `{ status: 'interrupted', executionId, nodeId, state }` **without** `CompleteNode` for that node until `resumePocWorkflow` runs.

**`switch` routing:** Successors come **only** from `config.cases` (first jq match wins; jq input root is the **current workflow state object**, same as STORY-2-3) and `config.default` when no case matches. If any `cases` exist and none match and `default` is omitted, the run fails with a clear error. **Static `edges` whose `source` is the switch node id are ignored for routing** (they may exist in documents; the engine does not follow them). This matches the POC recommendation in `docs/poc-scope.md` (avoid duplicate routing channels).

**Static `edges` (non-switch):** Exactly one outgoing edge from `__start__`, and from each of `start`, `step`, `llm_call`, `tool_call`, and `interrupt`; none from `end`. The walker does not require outgoing edges from `switch` nodes.

**Resume:** `resumePocWorkflow` loads history, takes the latest `StateUpdated` payload `state`, validates `resumePayload` with Ajv against the interrupt node’s `config.resume_schema` (reducer annotations stripped the same way as workflow `state_schema`), merges resume fields into state (overwrite keys), then continues from the **single** static successor of the interrupt node. Invalid resume appends `FailNode` (`reason: "resume_validation_failed"` when schema fails) and `ExecutionFailed`. If the last event is not `InterruptRaised`, resume fails with `FailNode` / `ExecutionFailed` and `reason: "resume_not_allowed"`.

**Checkpoint policy (STORY-3-3):** the POC walker emits `CheckpointWritten` events at deterministic `after_each_node` boundaries:
- after each `StateUpdated` event (normal node completion and switch completion),
- and after `InterruptRaised` (so interrupted runs have a recovery-safe boundary).

Each checkpoint payload includes `executionId`, `workflowVersion`, `definitionHash` (sha256 of canonical definition JSON), `lastAppliedEventSeq`, `nodeId`, and `stateRef` (currently `inline_state` snapshot). This links each checkpoint to a concrete history boundary (`lastAppliedEventSeq`) while keeping room for future blob indirection.

**Recovery loading:** `hydrateReplayContext({ startMode: "safe_point" })` prefers the latest valid `CheckpointWritten` boundary and starts replay from `lastAppliedEventSeq + 1`. If checkpoints are absent or invalid, hydration falls back to genesis replay (`startSeq = 1`).

### Execution history (STORY-2-2)

**Port:** `ExecutionHistoryStore` (documented in `src/persistence/types.mjs`) — append-only, per-`executionId` ordering.

- `append(executionId, { kind: 'command' | 'event', name, payload })` → assigned `seq` (integer, starts at 1 per execution).
- `readRange(executionId, fromSeq?, toSeq?)` — inclusive bounds when provided; rows ordered by `seq` ascending.
- `listByExecution(executionId)` — all rows for that execution.

**Adapters:**

- `SqliteExecutionHistoryStore` — uses **built-in** [`node:sqlite`](https://nodejs.org/api/sqlite.html) (`DatabaseSync`). Pass `{ path }` for a file or `:memory:`; pass `{ database }` to inject a `DatabaseSync` (caller closes it if needed). Requires **Node.js ≥ 22.5.0**. Call `close()` to release a store-opened connection.
- `MemoryExecutionHistoryStore` — array-backed; same monotonic semantics for tests.

**Storage layout (SQLite table `history`):**

| Column         | Type    | Role |
|----------------|---------|------|
| `execution_id` | TEXT    | Correlation key for one run |
| `seq`          | INTEGER | Monotonic sequence per execution (part of primary key) |
| `kind`         | TEXT    | `command` or `event` |
| `name`         | TEXT    | Command/event name (maps to POC taxonomies) |
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

- **Schema contract:** The engine validates against the same file as CI and `scripts/validate-workflows.mjs`: **`schemas/workflow-definition-poc.json`** (JSON Schema Draft 2020-12).
- **Ajv options:** `allErrors: true`, `strict: false` — identical to `scripts/validate-workflows.mjs` to avoid drift from “repo truth.”
- **Engine-specific limits:** None beyond the schema and JSON parse rules. The engine does **not** enforce file size limits, `document.schema` version bumps, or trace companions; only the POC workflow **definition** JSON shape is checked.
- **Resolution rule:** The engine loads `schemas/workflow-definition-poc.json` from the **published package** (`packages/engine/schemas/` next to `src/`, kept in sync with the repo canonical schema). In a full **workflows** monorepo checkout it can fall back to the root `schemas/` copy. `findWorkflowRepoRoot()` locates the monorepo root via `examples/lighthouse-customer-routing.workflow.json` and the root `package.json` named `workflows` (for tests and fixtures), not via schema path alone.

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
- bundled POC schema is present: `schemas/workflow-definition-poc.json`,
- runtime/library entrypoint is present: `src/index.mjs`,
- payload is minimal (runtime `src/`, bundled `schemas/`, package docs), with no test fixtures or unrelated repository files.
