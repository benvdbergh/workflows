# Conformance Harness

This directory is the canonical conformance harness for protocol/engine behavior checks.

## CI gate and local pre-PR check

GitHub Actions runs this harness on pull requests and pushes to protected branches (`main`, `master`) via `.github/workflows/validate-workflows.yml`.

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
- `vectors/replay/**/*.vector.json`

Future domains (replay, reducers, interrupts) should follow the same layout and runner contract.

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
- `kind`: vector executor (`schema` currently supported).
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
- `expect.status`: expected terminal status (`completed`, `failed`, or `interrupted`).
- `expect.tailCommands` (optional): exact post-prefix command tail (type/order + stable identity fields like `nodeId`).
- `expect.mismatch` (optional): expected deterministic mismatch diagnostics (message fragment and expected/actual command identity).

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
| Replay (inject history, deterministic tail stream) | Implemented | `conformance/vectors/replay/prefix-tail/*.vector.json`, including lighthouse happy path `conformance/vectors/replay/prefix-tail/lighthouse-prefix-tail-technical.vector.json`; mismatch diagnostics in `conformance/vectors/replay/mismatch/*.vector.json` |
| Reducers (append/merge/overwrite matrices) | Deferred | Out of active POC execution scope; no reducer matrix vectors yet |
| Parallel joins (`all`, `any`, `n_of_m`) | Deferred | `parallel` execution is out of active POC scope |
| Interrupt resume (validation failure vs success) | Partial | Replay vectors exercise resume cursor behavior; lighthouse happy-path coverage is active, while dedicated interrupt resume conformance vectors are still deferred |
| MCP tool mapping roundtrip (mock server) | Deferred | MCP adapter conformance vectors not yet implemented in harness |

## Deferral register (out-of-scope or pending)

| Area | Current decision | Rationale | Re-entry trigger |
|---|---|---|---|
| Reducer conformance matrix | Deferred | Active POC profile prioritizes schema + replay coverage and does not include reducer behavior conformance vectors yet | EPIC/story that introduces reducer semantics into active execution profile (`append`, `merge`, `overwrite`) |
| Parallel join conformance | Deferred | `parallel` node execution is explicitly outside active POC scope | Scope update that enables `parallel` in `docs/poc-scope.md` plus engine support |
| Interrupt resume conformance (dedicated vectors) | Deferred (currently partial) | Existing replay vectors validate deterministic continuation mechanics and protect lighthouse happy path, but not explicit interrupt-resume success/failure matrix cases | Story adds interrupt pause/resume fixture set with both schema-valid and schema-invalid resume payload cases |
| MCP tool mapping roundtrip conformance | Deferred | Harness currently runs in-process vectors and does not yet include MCP mock-server roundtrip assertions | EPIC-4 MCP stdio integration reaches testable parity and adds stable mock-server test harness |

## Adding a new vector

1. Place a `*.vector.json` file in an appropriate domain/scenario folder under `conformance/vectors/`.
2. Point `definition` to a repository-relative fixture path.
3. Set `expect` to the expected outcome for the vector kind.
4. Run `npm run conformance` and verify your new vector appears in sorted order.
