# Author workflows

Workflows are **declarative JSON documents** describing a directed graph of nodes, initial state shape, and routing.

## Top-level structure

| Field | Required | Purpose |
|-------|----------|---------|
| `document` | Yes | `schema`, `name`, `version`; optional `description` |
| `state_schema` | Yes | JSON Schema for workflow state |
| `nodes` | Yes | Non-empty array of node objects |
| `edges` | Yes | Directed edges between nodes |
| `checkpointing` | No | Checkpoint policy (`after_each_node`, `every_n_nodes`, `disabled`) |

Top-level `extensions` is **not supported** — documents with unknown top-level fields fail validation.

## Document metadata

```json
{
  "document": {
    "schema": "https://agent-workflow.dev/schemas/workflow-definition.json",
    "name": "customer-routing",
    "version": "1.0.0",
    "description": "Route support tickets by intent"
  }
}
```

- **`document.schema`** — protocol profile URI (stable across alpha; versioned registry deferred to GA).
- **`document.version`** — your workflow semver, not the engine package version.

## Nodes and edges

Every node has at minimum:

```json
{
  "id": "classify",
  "type": "llm_call",
  "config": {}
}
```

Edges connect nodes:

```json
{ "source": "__start__", "target": "classify" },
{ "source": "classify", "target": "route" }
```

For **`switch`**, routing is usually expressed in `config.cases` and `config.default` rather than static edges from the switch node.

For **`parallel`**, one edge leaves the parallel node to the join target; each branch starts at an entry node listed in `config.branches`.

## Node types (summary)

| Type | Role |
|------|------|
| `start` | Entry (at most one) |
| `end` | Terminal; optional `output_mapping` |
| `step` | Deterministic handler boundary |
| `llm_call` | Model invocation |
| `tool_call` | External tool (MCP-shaped for portability) |
| `switch` | Conditional routing via jq `when` |
| `interrupt` | Human-in-the-loop pause |
| `parallel` | Fork/join branches |
| `wait` | Duration, until timestamp, or signal (host) |
| `set_state` | jq/literal state assignments |
| `agent_delegate` | Delegate to external agent (A2A/MCP/SDK) |
| `subworkflow` | Nested workflow by reference |

Full configuration reference: [Node reference](node-reference.md).

## State and reducers

Declare state shape in `state_schema`. Per-property reducers control how node outputs merge:

| Reducer | Behavior |
|---------|----------|
| `overwrite` | Default — replace value |
| `append` | Append to array |
| `merge` | Shallow object merge |

`custom` reducers are not supported in the reference engine profile.

Details: [State, jq and reducers](state-jq-reducers.md).

## Checkpointing

Optional top-level block:

```json
{
  "checkpointing": {
    "strategy": "after_each_node"
  }
}
```

Strategies: `after_each_node` (default), `every_n_nodes` (requires `n`), `disabled`.

## Authoring checklist

1. Normalize to **canonical JSON** before validate/run.
2. Run `npm run engine:validate -- your.workflow.json` or site [schema validation](schema/index.md).
3. Check [Compatibility matrix](compatibility.md) — schema acceptance ≠ runtime support for optional features.
4. Avoid **`interrupt` inside `parallel` branches** — refused by the reference engine.
5. Register child workflow URNs for **`subworkflow`** via `registerWorkflowRef` in host code.

## Examples

Runnable fixtures and scenarios: [Examples](examples.md).
