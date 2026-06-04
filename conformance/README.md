# Conformance Harness

This directory is the canonical conformance harness for protocol/engine behavior checks.

## CI gate and local pre-PR check

GitHub Actions runs this harness on every push, on pull requests targeting `main` or `master`, and via manual **Validate workflow definitions** dispatch (`.github/workflows/validate-workflows.yml`).

Contributor pre-PR gate (run from repository root):

```bash
npm run conformance
```

Expected behavior:

- Exit code `0` when all vectors match expected outcomes.
- Exit code `1` for any unexpected or mismatched result.
- JSON summary on stdout with `status: "pass"` or `status: "fail"`.

## Layout

```text
conformance/
  run-conformance.mjs                # single entrypoint for local + CI runs
  runner.mjs                         # vector discovery and execution utilities
  vectors/
    <domain>/
      <scenario>/
        *.vector.json                # machine-readable vector descriptors
```

Current domain coverage:

- `vectors/schema/valid/*.vector.json`
- `vectors/schema/invalid/*.vector.json`
- `vectors/replay/**/*.vector.json` (includes `replay/host-activity/` for host-mediated activity replay and submit error codes; `replay/engine-direct-activity/` for in-process / engine-direct replay invariants)
- `vectors/parity/*.vector.json` — cross-surface contract parity (application port vs MCP tool handlers, in-process)

Additional domains (expanded reducer matrices, dedicated interrupt-resume cases, MCP mock roundtrip, and similar) should follow the same layout and runner contract.

## Vector format

Each vector file is JSON. Schema vector example:

```json
{
  "id": "schema.valid.lighthouse",
  "kind": "schema",
  "definition": "examples/lighthouse-customer-routing.workflow.json",
  "expect": { "ok": true }
}
```

- `id`: stable identifier used in logs and CI output.
- `kind`: vector executor (`schema`, `replay`, or `parity`).
- `definition`: path relative to repository root.
- `expect.ok`: expected validation outcome.
- `expect.diagnostics` (optional): stable failure signals for expected-invalid vectors.

Diagnostic signal shape:

```json
{
  "instancePath": "/nodes/1/type",
  "keyword": "const",
  "messageIncludes": "must be equal to constant"
}
```

At least one diagnostic signal must match an AJV error when `expect.ok` is `false`.

Replay vector example:

```json
{
  "id": "replay.prefix.tail.lighthouse.technical",
  "kind": "replay",
  "definition": "examples/lighthouse-customer-routing.workflow.json",
  "input": { "ticket_text": "My API returns 500" },
  "historyPrefix": [
    { "kind": "command", "name": "ScheduleNode", "payload": { "nodeId": "begin" } }
  ],
  "expect": {
    "status": "completed",
    "tailCommands": [
      { "name": "ScheduleNode", "nodeId": "route" }
    ]
  }
}
```

Replay fields:

- `input`: workflow input used for resumed run.
- `historyPrefix`: fixed persisted rows injected before replay; append order defines deterministic replay cursor.
- `expect.status`: expected terminal status (`completed`, `failed`, `interrupted`, or `awaiting_activity` when no successful continuation ran).
- `expect.tailCommands` (optional): exact post-prefix command tail (type/order + stable identity fields like `nodeId`).
- `expect.eventCardinality` (optional): assert event counts after the run (e.g. `{ "ExecutionStarted": 1, "ActivityCompleted": { "work": 1 } }`). Use on host-mediated submit continuation vectors to guard against duplicate genesis replay events.
- `expect.mismatch` (optional): expected deterministic mismatch diagnostics (message fragment and expected/actual command identity).
- `activityExecutionMode` (optional): `"in_process"` (default) or `"host_mediated"` for `runGraphWorkflow` after prefix injection. **In-process** is the same activity port the engine uses for engine-direct execution (MCP or other `ActivityExecutor`); **host_mediated** yields at `ActivityRequested` until a submit.
- `assertNoActivityExecutorInvocation` (optional): when `true`, the harness wires a `RejectingActivityExecutor` that fails any `executeActivity` call. Use with `activityExecutionMode: "in_process"` and a `historyPrefix` that already records `ActivityRequested` / `ActivityCompleted` for every `tool_call` the tail will revisit, so the run proves **tail replay does not re-invoke the activity port** (no duplicate “external” calls; deterministic stub). Ordering is still asserted via `expect.tailCommands` (command stream), matching host-mediated replay vectors that omit this flag.
- `activitySubmissions` (optional): ordered `submitActivityOutcome` steps after the initial run. Each entry has `nodeId`, `outcome`, optional `expectedParallelSpan` when the pending `ActivityRequested` carries `parallelSpan`, and optional `expectFailure: { code }` to assert a failed submit without continuing (e.g. `ACTIVITY_SUBMIT_NODE_MISMATCH`, `ACTIVITY_SUBMIT_PARALLEL_MISMATCH`, `ACTIVITY_SUBMIT_NOT_AWAITING`).

## Discovery contract

Vectors are discovered by recursively scanning `conformance/vectors/` for `*.vector.json` and sorting by lexical path order before execution.

This guarantees deterministic ordering across local and CI runs.

## Running

From repository root:

```bash
npm run conformance
```

Output behavior:

- Human-readable context (PASS/FAIL, reason, AJV diagnostics) prints to stderr.
- PASS output includes category labels: `schema-pass` and `schema-fail-by-design`.
- Replay vectors emit categories `replay-pass` and `replay-fail-by-design`.
- Machine-readable summary JSON prints to stdout with `status`, aggregate counts, and per-vector results.
- Exit code is `0` when all vectors pass, `1` otherwise.

## RFC-08 conformance coverage matrix (POC profile)

The matrix below maps RFC-08 section `8.2 Conformance tests` areas to the current POC harness status.

| RFC-08 conformance area | Status | Evidence |
|---|---|---|
| Schema validation (valid/invalid fixtures) | Implemented | `conformance/vectors/schema/valid/*.vector.json`, `conformance/vectors/schema/invalid/*.vector.json` |
| Replay (inject history, deterministic tail stream) | Implemented | Prefix/tail vectors under `conformance/vectors/replay/prefix-tail/` (lighthouse, R2 `join all` / `any` / `n_of_m`); mismatch diagnostics in `conformance/vectors/replay/mismatch/` (lighthouse route + R2 parallel branch order) |
| Reducers (append/merge/overwrite matrices) | Deferred | No dedicated reducer matrix vectors yet (behavior covered indirectly by fixtures) |
| Parallel joins (`all`, `any`, `n_of_m`) | Partial | R2 reference engine implements join policies; harness covers deterministic replay through a parallel fork/join tail (`r2-research-prefix-after-plan`); dedicated join-policy matrix vectors still deferred |
| Interrupt resume (validation failure vs success) | Partial | Replay vectors exercise resume cursor behavior; lighthouse happy-path coverage is active, while dedicated interrupt resume conformance vectors are still deferred |
| MCP tool mapping roundtrip (mock server) | Deferred | MCP adapter conformance vectors not yet implemented in harness |
| Cross-surface adapter parity (port vs MCP, in-process) | Implemented | `conformance/vectors/parity/*.vector.json`; matrix in `docs/architecture/arc42-assets/contracts/integration-parity-matrix.md` |
| Host-mediated activity replay / submit | Implemented | `vectors/replay/host-activity/` (linear + parallel branch correlation, replay-safe `ActivityCompleted` in prefix, duplicate and mismatch submits) |
| Engine-direct (in-process) activity replay — no duplicate activity port calls | Implemented | `vectors/replay/engine-direct-activity/` (`assertNoActivityExecutorInvocation` + `ActivityCompleted` in prefix; linear + parallel `tool_call`) |

## Deferral register (out-of-scope or pending)

| Area | Current decision | Rationale | Re-entry trigger |
|---|---|---|---|
| Reducer conformance matrix | Deferred | Active POC profile prioritizes schema + replay coverage and does not include reducer behavior conformance vectors yet | EPIC/story that introduces reducer semantics into active execution profile (`append`, `merge`, `overwrite`) |
| Parallel join conformance (full matrix) | Deferred | Join policies are implemented in-engine; harness lacks explicit `all` / `any` / `n_of_m` matrix vectors | Story adds replay/schema vectors per join policy and failure modes |
| Interrupt resume conformance (dedicated vectors) | Deferred (currently partial) | Existing replay vectors validate deterministic continuation mechanics and protect lighthouse happy path, but not explicit interrupt-resume success/failure matrix cases | Story adds interrupt pause/resume fixture set with both schema-valid and schema-invalid resume payload cases |
| MCP tool mapping roundtrip conformance | Deferred | Harness currently runs in-process vectors and does not yet include MCP mock-server roundtrip assertions | EPIC-4 MCP stdio integration reaches testable parity and adds stable mock-server test harness |

## Parity vectors (`kind: "parity"`)

Cross-surface parity runs the same scenario script twice (application port methods and MCP tool handlers on separate in-memory stores) and compares **normalized JSON snapshots** per step. Optional vector-level `stubActivityOutputs` wires a shared `StubActivityExecutor` for both surfaces.

```json
{
  "id": "parity.r2.host_mediated_submit",
  "kind": "parity",
  "definition": "examples/conformance-host-activity-linear.workflow.json",
  "executionId": "parity-host-submit-1",
  "steps": [
    {
      "op": "start",
      "activityExecutionMode": "host_mediated",
      "expect": { "status": "awaiting_activity", "node_id": "work" }
    },
    {
      "op": "submit_activity",
      "nodeId": "work",
      "outcome": { "ok": true, "result": { "out": "host-done" } },
      "expect": { "status": "completed", "result": "host-done" }
    }
  ]
}
```

- `pending: true` — skipped with category `parity-pending` (reserved for vectors not yet ready; must not false-green).
- `expect` — partial match on the normalized snapshot after port/MCP equivalence is established.
- `expectError` / `expectErrorCode` — negative paths using MCP adapter error codes.

**R3 composition parity (active):** vectors under `conformance/vectors/parity/r3-*-status-correlation.vector.json` assert **`workflow_status`** correlation after terminal runs:

| File | Vector id | Asserts |
|------|-----------|---------|
| `r3-delegate-status-correlation.vector.json` | `parity.r3.delegate_status_correlation` | `delegate_correlation_id` after `agent_delegate` |
| `r3-subworkflow-status-correlation.vector.json` | `parity.r3.subworkflow_status_correlation` | `child_execution_id`, `parent_execution_id` after nested `subworkflow` |

Contract matrix: `docs/architecture/arc42-assets/contracts/integration-parity-matrix.md`.

## Adding a new vector

1. Place a `*.vector.json` file in an appropriate domain/scenario folder under `conformance/vectors/`.
2. Point `definition` to a repository-relative fixture path.
3. Set `expect` to the expected outcome for the vector kind.
4. Run `npm run conformance` and verify your new vector appears in sorted order.
