# State, jq and reducers

Workflow state is declared in `state_schema` (JSON Schema) and updated as nodes complete. Expressions use **jq**; merge behavior uses per-property **reducers**.

## State schema

```json
{
  "state_schema": {
    "type": "object",
    "properties": {
      "ticket_text": { "type": "string" },
      "intent": { "type": "string" },
      "events": {
        "type": "array",
        "reducer": "append"
      },
      "metadata": {
        "type": "object",
        "reducer": "merge"
      }
    }
  }
}
```

## Reducers

| Reducer | Use when |
|---------|----------|
| `overwrite` | Default — node output replaces the property |
| `append` | Accumulate into an array |
| `merge` | Shallow-merge objects |

`custom` reducers are **not supported** in the reference engine — documents using them should be rejected.

## jq expressions

Used in:

- `switch` `config.cases[].when`
- `set_state` `config.assignments` (jq form)
- `end` `output_mapping`
- `agent_delegate` / `subworkflow` `input_mapping`

Literal assignments use `{ "literal": <value> }` instead of jq.

### Execution context

jq expressions evaluate against an engine-defined root object (typically including `.state` and activity outputs). Align with golden fixtures and conformance vectors when authoring portable workflows.

### Conformance subset

The reference engine implements a **documented jq subset**, not full jq. Unsupported constructs fail at runtime or validation depending on the check.

Common supported patterns:

- Field access: `.state.intent`
- Comparisons: `==`, `!=`, `<`, `>`
- Boolean logic: `and`, `or`, `not`
- String literals with escaped quotes
- Array/object literals where supported

Full normative list: [jq conformance subset](https://github.com/benvdbergh/workflows/blob/main/docs/releases/jq-conformance-subset.md) (developer docs).

## Example: switch + set_state

```json
{
  "id": "route",
  "type": "switch",
  "config": {
    "cases": [
      { "when": ".state.confidence > 0.8", "target": "auto_route" }
    ],
    "default": "human_review"
  }
},
{
  "id": "record_route",
  "type": "set_state",
  "config": {
    "assignments": {
      "routed_at": { "jq": "now | tostring" },
      "route": { "literal": "automatic" }
    }
  }
}
```

## Validation tips

1. Validate document shape with the [JSON Schema](schema/index.md).
2. Run conformance or engine tests for jq edge cases on critical paths.
3. Prefer simple expressions in `switch` conditions for portability.
