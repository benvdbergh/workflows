# jq conformance subset (reference engine)

**Last reviewed:** 2026-06-04  
**Status:** Normative for `@agent-workflow/engine` replay and conformance until a fuller RFC-03 jq profile is frozen.  
**Implementation:** [`jq-wasm`](https://www.npmjs.com/package/jq-wasm) via `loadJq()` in `packages/engine/src/orchestrator/workflow-graph-walker.mjs`.  
**Profile context:** [profile-model.md](./profile-model.md), [docs/engine-profile.md](../engine-profile.md) §4.

---

## 1. Input root (walker state binding)

All engine jq evaluations use **`jq.json(data, query)`** where **`data` is the current workflow state object** — a plain JSON object produced by reducer merges after each node, not the full execution envelope.

| Call site | `data` (root) | Query source |
|-----------|---------------|--------------|
| `switch` `config.cases[].when` | Current state after prior nodes | String per case |
| `set_state` `config.assignments.*.jq` | Current state before assignment merge | String in assignment |
| `end` `config.output_mapping` | Current state at terminal | Single jq program string; default `.` if omitted |
| `agent_delegate` / `subworkflow` `config.input_mapping` | Parent state at delegate/fork | `{ "jq": "<expr>" }` or `${ expr }` template string |
| Linear/graph `end` completion | Same as above | `output_mapping` → `ExecutionCompleted` payload `result` |

**Not in root today:** `executionId`, `nodeId`, command/event history, or environment metadata. Authors who need those must copy fields into state earlier (e.g. `set_state`).

**Truthy rule for `switch`:** A case matches when jq result is neither `false` nor `null` (see `jqTruthy` in `workflow-node-execution.mjs`). Empty string `""` is truthy.

---

## 2. Supported expression shapes (document authoring)

### 2.1 Switch and set_state

- **Form:** Raw jq filter strings (e.g. `.status == "open"`, `.items | length > 0`).
- **Errors:** Failed jq throws; walker appends `FailNode` with `reason` such as `output_mapping_jq_failed` or switch-specific messages.

### 2.2 set_state and input_mapping objects

```json
{ "jq": ".customer.id" }
{ "literal": { "source": "workflow" } }
```

- **`literal`:** Deep-copied JSON value; no jq evaluation.
- **Empty `jq`:** Rejected with explicit error.

### 2.3 input_mapping template strings (delegate / subworkflow)

- **Form:** `"${ <jq-expr> }"` — inner expression evaluated against parent state (regex `^\$\{\s*(.+?)\s*\}$`).
- **Plain string** without template syntax: treated as literal string value.

### 2.4 end output_mapping

- **Form:** One jq program applied to state; commonly `.` or a projection `.result`.

---

## 3. Minimal jq language subset

The engine does **not** implement a custom jq interpreter; it delegates to **jq-wasm** (WebAssembly build of jq 1.7). For portable workflows, stay within this **minimal subset** until expanded conformance vectors exist:

| Category | Supported in practice | Avoid in v1 fixtures |
|----------|----------------------|----------------------|
| Root access | `.`, `.field`, `.["key"]`, `[]` indexing | `input` / `inputs` (no alternate roots) |
| Literals | strings, numbers, booleans, null, arrays, objects | — |
| Comparisons / logic | `==`, `!=`, `<`, `>`, `and`, `or`, `not` | — |
| Pipes | `\|` | — |
| Select / map | `map`, `select`, `if … then … else … end` | — |
| Construction | `{ key: .x }`, `[.items[]]` | — |
| Strings | interpolation where jq supports it | `gsub` complexity untested in conformance |
| Modules | — | `import`, `include` |
| IO / env | — | `env`, `inputs`, external files |
| Dates | — | `now` unless fixtures pin clock (wait uses separate parser) |

**Conformance expectation:** Golden workflows under `examples/` and `conformance/vectors/` should only use constructs exercised by engine tests. Adding exotic builtins requires a new vector.

---

## 4. State shape expectations

Workflow **`state_schema`** describes the JSON object jq sees. Reducers (`overwrite`, `append`, `merge`) run **before** jq on subsequent nodes; jq does not apply reducers itself.

Authors should:

1. Keep state JSON-serializable (no functions, dates as ISO strings if compared in jq).
2. Align `switch` expressions with reducer-produced shapes (e.g. after `append`, expect arrays).
3. Validate state with Ajv after merges when validation is enabled (engine strips `reducer` keys only for compilation).

---

## 5. Failure and replay

- jq failures are **deterministic** for a fixed state input and query string.
- Replay restores state from `StateUpdated` / checkpoint `inline_state` before re-evaluating jq on continuation paths.
- Changing jq queries or state shape without bumping `document.version` may break `definitionHash` binding; treat definition changes as new versions.

---

## 6. Related references

- Engine README — *General graph orchestration* (`switch`, `end` output_mapping).
- `packages/engine/src/orchestrator/workflow-node-execution.mjs` — `resolveSwitchTarget`, `buildSetStateOutput`, `applyInputMapping`.
- RFC-03 §3.3 — normative jq intent (full language not required of all profiles).
