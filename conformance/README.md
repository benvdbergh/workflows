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

Future domains (replay, reducers, interrupts) should follow the same layout and runner contract.

## Vector format

Each vector file is JSON:

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
- Machine-readable summary JSON prints to stdout with `status`, aggregate counts, and per-vector results.
- Exit code is `0` when all vectors pass, `1` otherwise.

## Adding a new vector

1. Place a `*.vector.json` file in an appropriate domain/scenario folder under `conformance/vectors/`.
2. Point `definition` to a repository-relative fixture path.
3. Set `expect` to the expected outcome for the vector kind.
4. Run `npm run conformance` and verify your new vector appears in sorted order.
