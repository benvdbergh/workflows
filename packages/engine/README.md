# `@agent-workflow-protocol/engine`

Private workspace package: **definition-time** validation for Agent Workflow Protocol POC workflow documents, an **append-only execution history** port (SQLite or in-memory), and a **linear graph runner** (STORY-2-3) for single-path workflows.

## Entrypoint (CLI)

From the repository root (after `npm install`):

```bash
node packages/engine/src/cli.mjs validate path/to/workflow.json
```

Or use the package bin name when linked:

```bash
npx workflows-engine validate path/to/workflow.json
```

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
- `findWorkflowRepoRoot(startDir?)` — locates the checkout root that contains `schemas/workflow-definition-poc.json` (used to resolve the schema path).

### Linear orchestration (STORY-2-3)

**API:** `runLinearWorkflow({ definition, input, executionId, store, stubActivityOutputs? })` → `Promise<{ status: 'completed'|'failed', finalState?, result?, error? }>`.

Phases: **validate** (POC schema + reject `state_schema.properties.*.reducer === "custom"`) → **start** (`ExecutionStarted`) → **walk** each node on the unique chain from `__start__` through exactly one `start` … `end` → **complete** (`ExecutionCompleted` with jq result) or **fail** (`ExecutionFailed`, plus `FailNode` command when failure happens after start).

**Graph rules:** Edges must form a **single linear path** covering every node: exactly one edge from `__start__`, at most one outgoing edge per node, no cycles, exactly one `start` and one `end`. `switch` and `interrupt` nodes are rejected (STORY-2-5). Unknown topology errors throw from `computeLinearNodePath` or return `{ status: 'failed', error }` from `runLinearWorkflow`.

**Node types in this runner:** `start`, `end`, and **`step` / `llm_call` / `tool_call` as synchronous placeholders** — no real I/O. Placeholder outputs default to `{}`; override per node id with `stubActivityOutputs[nodeId]` (merged into state via reducers).

**State:** Initial state is a shallow copy of `input`. After each non-`end` node, outputs are merged using `state_schema.properties.<key>.reducer`: `overwrite` (default), `append` (array concat), `merge` (deep object merge). After each merge, state is validated with Ajv against `state_schema` (reducer annotations are stripped for compilation only).

**`end` node `config.output_mapping`:** Must be a **jq** program string. It is evaluated with **jq’s input root = the current workflow state object** (after all reducer updates from prior nodes). If `output_mapping` is omitted, the runner uses `.` (identity). Evaluation uses the **`jq-wasm`** package (WebAssembly jq — no native compile).

**History (POC names):** Appends include at least `ExecutionStarted`; for each node `ScheduleNode` (command) and `NodeScheduled` (event); for placeholders `ActivityRequested` / `ActivityCompleted` (events); `CompleteNode` (command); `StateUpdated` (event) after state changes; terminal `ExecutionCompleted` or `ExecutionFailed`. Payloads include `executionId` and `nodeId` where applicable.

**Helpers (also exported):** `assertNoCustomReducers(definition)`, `applyOutputWithReducers(state, output, stateSchema)`, `computeLinearNodePath(nodes, outgoingMap)`.

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

Primary key: `(execution_id, seq)`. Historical rows are not updated or deleted by the adapter API.

**Concurrency:** Treat the store as **single-writer per process** for a given execution (and avoid multiple processes appending to the same file for the same execution id). SQLite assigns `seq` inside a **transaction** (`BEGIN IMMEDIATE` … `COMMIT`) that reads `MAX(seq)` for the execution and then inserts the next row, so ordering stays monotonic for that writer.

**Why `node:sqlite`:** Avoids native addon builds (for example on Windows without a full C++ toolchain). On some Node versions the module may log an experimental/RC warning; behavior is still suitable for this append-only log.

Example:

```js
import { validateWorkflowDefinition, SqliteExecutionHistoryStore } from "@agent-workflow-protocol/engine";
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
- **Resolution rule:** The schema file is found by walking upward from `packages/engine/src/` until a directory containing `schemas/workflow-definition-poc.json` is found. Running the CLI or library **outside** this repository layout will throw or fail until that layout exists.

## Tests

```bash
npm test --workspace=@agent-workflow-protocol/engine
```
