# Conformance Harness

This directory is the canonical conformance harness for protocol/engine behavior checks.

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

## Adding a new vector

1. Place a `*.vector.json` file in an appropriate domain/scenario folder under `conformance/vectors/`.
2. Point `definition` to a repository-relative fixture path.
3. Set `expect` to the expected outcome for the vector kind.
4. Run `npm run conformance` and verify your new vector appears in sorted order.
