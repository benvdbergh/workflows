# Node reference

Per-type configuration for the reference engine profile. Unknown `type` values fail schema validation.

## Common fields

All nodes may include:

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Unique in document |
| `type` | string | Discriminator (see below) |
| `config` | object | Type-specific |
| `retry` | object | Applied by engine (`max_attempts`, backoff, `non_retryable_errors`) |
| `timeout` | string | Per-activity deadline (`30s`, `500ms`, …); enforced in-process; advertised on `ActivityRequested` for host-mediated |
| `metadata` | object | Opaque annotations |

---

## `start`

Entry node. At most one per document.

```json
{ "id": "start", "type": "start" }
```

---

## `end`

Terminal node. Optional output shaping:

```json
{
  "id": "done",
  "type": "end",
  "config": {
    "output_mapping": {
      "result": { "jq": ".state | .summary" }
    }
  }
}
```

---

## `step`

Deterministic activity boundary. `config` must reference an implementation handler.

```json
{
  "id": "normalize",
  "type": "step",
  "config": { "handler": "normalize-ticket" }
}
```

---

## `llm_call`

Model invocation. Early demos may stub transcripts without changing document shape.

Optional `config.output_schema` (JSON Schema object) is validated at the **activity boundary** after completion (in-process executor or host `submitActivityOutcome`). Violations emit `ActivityFailed` with code **`OUTPUT_SCHEMA_VIOLATION`**.

```json
{
  "id": "classify",
  "type": "llm_call",
  "config": {
    "model": "gpt-4",
    "prompt": "Classify intent from: {{state.ticket_text}}",
    "output_schema": {
      "type": "object",
      "properties": {
        "intent": { "type": "string" },
        "confidence": { "type": "number" }
      },
      "required": ["intent", "confidence"]
    }
  }
}
```

---

## `tool_call`

External tool. Prefer MCP shape for portable fixtures:

```json
{
  "id": "search_kb",
  "type": "tool_call",
  "config": {
    "server": "knowledge-base",
    "tool": "search",
    "arguments": { "query": { "jq": ".state.intent" } }
  }
}
```

Host-mediated execution uses `workflow_submit_activity`. Engine-direct execution uses operator MCP manifests.

---

## `switch`

Route via jq `when` expressions:

```json
{
  "id": "route",
  "type": "switch",
  "config": {
    "cases": [
      { "when": ".state.intent == \"billing\" and .state.confidence > 0.8", "target": "open_ticket" },
      { "when": ".state.intent == \"technical\"", "target": "search_kb" }
    ],
    "default": "human_review"
  }
}
```

Prefer `cases` + `default` over duplicate static edges from the switch node.

---

## `interrupt`

Human-in-the-loop pause:

```json
{
  "id": "human_review",
  "type": "interrupt",
  "config": {
    "prompt": "Review classification and set intent",
    "resume_schema": {
      "type": "object",
      "required": ["intent"],
      "properties": { "intent": { "type": "string" } }
    }
  }
}
```

Resume with `workflow_resume` and a payload matching `resume_schema`.

---

## `parallel`

Fork/join with branch entries and join policy:

```json
{
  "id": "research",
  "type": "parallel",
  "config": {
    "join": "all",
    "branches": [
      { "name": "web", "entry": "search_web" },
      { "name": "docs", "entry": "search_docs" }
    ]
  }
}
```

`join`: `all` | `any` | `n_of_m` (with `n`). Exactly **one** static edge from the parallel node to the join target.

**Refused:** `interrupt` inside a parallel branch (`INTERRUPT_IN_PARALLEL_BRANCH`).

---

## `wait`

| `kind` | Config | Engine support |
|--------|--------|----------------|
| `duration` | `duration_ms` or `duration` string | Supported |
| `until` | ISO-8601 `until` timestamp | Supported |
| `signal` | signal name | **Host required** — bare engine fails |

```json
{
  "id": "cooldown",
  "type": "wait",
  "config": { "kind": "duration", "duration_ms": 5000 }
}
```

---

## `set_state`

Assign state via jq or literals:

```json
{
  "id": "tag_urgent",
  "type": "set_state",
  "config": {
    "assignments": {
      "priority": { "literal": "high" },
      "tags": { "jq": ".state.tags + [\"urgent\"]" }
    }
  }
}
```

---

## `agent_delegate`

Delegate to an external agent:

```json
{
  "id": "delegate_research",
  "type": "agent_delegate",
  "config": {
    "agent_id": "research-agent",
    "protocol": "a2a",
    "input_mapping": {
      "query": { "jq": ".state.research_query" }
    }
  }
}
```

`protocol`: `a2a` | `mcp` | `sdk`. Reference engine includes mock A2A lifecycle only.

---

## `subworkflow`

Nested workflow by reference:

```json
{
  "id": "run_tests",
  "type": "subworkflow",
  "config": {
    "workflow_ref": "urn:agent-workflow:examples:r3-unit-tests-child",
    "input_mapping": {
      "repo": { "jq": ".state.repo_path" }
    }
  }
}
```

Child definitions must be registered (`registerWorkflowRef`). Max nesting depth default: 4.

---

## Migration: `tool_call` → `agent_delegate`

| Bridge (`tool_call`) | Native (`agent_delegate`) |
|----------------------|---------------------------|
| `config.server` + `config.tool` | `config.agent_id` + `config.protocol` |
| Tool arguments | `config.input_mapping` |
| Ad-hoc correlation | `delegateCorrelationId`, `externalTaskId` on activity events |

Prefer `agent_delegate` for new workflows.
