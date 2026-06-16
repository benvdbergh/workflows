# Host-mediated activities

Assistant-class MCP hosts (Cursor, Claude Desktop, Codex-style clients) already own tool servers, LLM credentials, and policy. **Host-mediated** activity execution keeps orchestration and history in `@agent-workflow/engine` while the **host performs** each `step`, `llm_call`, or `tool_call` and reports the outcome back.

> **Read order:** [Run with MCP](mcp-operator-guide.md) (wiring and tools) → this guide (activity loop) → [ADR-0002: Host-mediated activity execution](../architecture/adr/ADR-0002-host-mediated-activity-execution.md) (architecture decision) → [MCP stdio host smoke runbook](../architecture/arc42-assets/runbooks/mcp-stdio-host-smoke.md) (QA acceptance).

## When to use `host_mediated`

| Mode | Who runs activities | Typical use |
|------|---------------------|-------------|
| `in_process` (default) | Engine activity port (stub, engine-direct MCP, or injected executor) | Demos, CI, automation workers |
| `host_mediated` | MCP host out of band, then `workflow_submit_activity` | Assistant hosts that already aggregate MCP tools and API keys |

The runtime default is **`in_process`** for backward-compatible smoke tests. Assistant hosts **must opt in** to `host_mediated` on every control-plane call that can continue execution (see [ADR-0002](../architecture/adr/ADR-0002-host-mediated-activity-execution.md)).

## Opt-in: `activity_execution_mode`

Pass **`activity_execution_mode: "host_mediated"`** on:

| MCP tool | Parameter |
|----------|-----------|
| `workflow_start` | `activity_execution_mode` |
| `workflow_resume` | `activity_execution_mode` |
| `workflow_submit_activity` | `activity_execution_mode` |

Omit the field (or pass `"in_process"`) to keep the in-process stub or engine-direct profile.

Example start (lighthouse fixture):

```json
{
  "execution_id": "lighthouse-host-1",
  "definition": { "...": "examples/lighthouse-customer-routing.workflow.json" },
  "input": { "ticket_text": "I was charged twice on my last invoice" },
  "activity_execution_mode": "host_mediated"
}
```

Expected response: `status: "awaiting_activity"` with `node_id: "classify"` (first activity boundary).

## Host responsibilities

For each activity boundary the engine yields **`awaiting_activity`**. The host loop is:

1. **Read pending context** — from the tool result or `workflow_status`: `execution_id`, `node_id`, optional `parallel_span`, workflow `state`, and for **`agent_delegate`** nodes also `agent_id`, `protocol`, `delegate_input`, and `delegate_correlation_id`.
2. **Resolve the node** — look up `node_id` in the same `definition` object passed to `workflow_start` (type: `step`, `llm_call`, `tool_call`, or `agent_delegate`; `config` holds model, tool, handler URN, or delegate target).
3. **Perform work out of band** — invoke the host's LLM API, MCP `tools/call`, registered step handler, or external agent runtime (A2A/MCP/SDK per `agent_delegate` `protocol`). Credentials and side effects stay on the host; the engine does not call your tools or agents in this mode.
4. **Submit the outcome** — call `workflow_submit_activity` with the **same** `definition` and `input` as the original start, matching `node_id`, and a typed `outcome`.
5. **Repeat** — until status is `completed`, `failed`, or `interrupted` (then use `workflow_resume` for interrupt nodes).

### Submit shape

```json
{
  "execution_id": "lighthouse-host-1",
  "definition": "<same object as workflow_start>",
  "input": { "ticket_text": "I was charged twice on my last invoice" },
  "node_id": "classify",
  "activity_execution_mode": "host_mediated",
  "outcome": {
    "ok": true,
    "result": { "intent": "billing", "confidence": 0.92 }
  }
}
```

Success outcomes use `{ "ok": true, "result": { ... } }` (merged into workflow state per node completion). Failures use `{ "ok": false, "error": "...", "code": "..." }`.

For **`agent_delegate`** nodes, include the **`delegate_correlation_id`** from the pending `ActivityRequested` (also exposed on start/status responses). Optionally pass **`external_task_id`** for the host-side agent task reference. The engine validates that the submitted correlation id matches the pending request before recording `ActivityCompleted`.

```json
{
  "execution_id": "multi-agent-1",
  "definition": "<same object as workflow_start>",
  "input": { "task": "implement feature X" },
  "node_id": "implement",
  "activity_execution_mode": "host_mediated",
  "outcome": {
    "ok": true,
    "delegate_correlation_id": "multi-agent-1:delegate:implement",
    "external_task_id": "a2a-task-abc123",
    "result": { "patch": "// agent output", "delegate_status": "completed" }
  }
}
```

Under **`parallel`**, include the same **`parallel_span`** the engine returned when submitting for a branch activity (see [MCP stdio host smoke runbook](../architecture/arc42-assets/runbooks/mcp-stdio-host-smoke.md)).

### Stable submit error codes

| Code | Meaning |
|------|---------|
| `ACTIVITY_SUBMIT_NOT_AWAITING` | No pending `ActivityRequested` |
| `ACTIVITY_SUBMIT_NODE_MISMATCH` | `node_id` does not match the pending request |
| `ACTIVITY_SUBMIT_PARALLEL_MISMATCH` | Branch correlation does not match |

Full MCP error table: [Run with MCP](mcp-operator-guide.md#stable-error-codes).

## Cursor MCP configuration (credential ownership)

Register the workflow engine as one MCP server. Register **tool and LLM servers separately** on the host — the engine orchestrates; the host executes.

```json
{
  "mcpServers": {
    "workflow-engine": {
      "command": "npx",
      "args": [
        "-y",
        "-p",
        "@agent-workflow/engine@alpha",
        "workflows-engine-mcp"
      ]
    },
    "support-mcp": {
      "command": "npx",
      "args": ["-y", "@your-org/support-mcp-server"],
      "env": {
        "SUPPORT_API_KEY": "${env:SUPPORT_API_KEY}"
      }
    }
  }
}
```

**Trust boundary:**

- **`workflow-engine`** — validation, graph walking, history; no host LLM or business-tool credentials required for `host_mediated`.
- **`support-mcp`** (and similar) — owned by the host; invoked only when the assistant handles an `awaiting_activity` for a `tool_call` node (for example lighthouse `open_ticket` / `search_kb`).
- **LLM provider keys** — stay in the host environment; used when completing `llm_call` nodes (for example lighthouse `classify`).

Do **not** point `WORKFLOW_ENGINE_MCP_CONFIG` at host tool servers unless you intentionally run **engine-direct** `tool_call` (see [ADR-0003](../architecture/adr/ADR-0003-engine-direct-mcp-activity-execution.md)). Host-mediated and engine-direct are complementary profiles.

## Lighthouse walkthrough (`classify` → `tool_call`)

Fixture: `examples/lighthouse-customer-routing.workflow.json`.

| Step | Host action | Expected engine status |
|------|-------------|------------------------|
| 1. `workflow_start` with `host_mediated` | Pass ticket text | `awaiting_activity`, `node_id: "classify"` |
| 2. Complete `classify` (`llm_call`) | Host LLM returns `{ intent, confidence }`; `workflow_submit_activity` | `awaiting_activity`, `node_id: "open_ticket"` or `"search_kb"` (via `switch`), or `interrupted` at `human_review` when confidence is low |
| 3. Complete `open_ticket` (`tool_call`) | Host calls `support-mcp` / `create_ticket`; submit tool result | `completed` with mapped intent/confidence |

Conformance parity vector `parity.r2.host_mediated_lighthouse_classify` exercises the billing path (`classify` → `open_ticket` → `finish`) with simulated host submits.

## `agent_delegate` host loop

Fixture: `examples/conformance-agent-delegate-linear.workflow.json` (start → `implement` agent_delegate → end).

| Step | Host action | Expected engine status |
|------|-------------|------------------------|
| 1. `workflow_start` with `host_mediated` | Pass `{ task }` input | `awaiting_activity`, `node_id: "implement"`, `agent_id: "coder"`, `protocol: "a2a"`, `delegate_input`, `delegate_correlation_id` |
| 2. Invoke external agent | Host runs A2A/MCP/SDK agent using `delegate_input`; no engine delegate port call | (out of band) |
| 3. `workflow_submit_activity` | Submit `result` plus matching `delegate_correlation_id` (and optional `external_task_id`) | `completed` with delegate output merged into state |

The engine records `ActivityRequested` with `agentId`, `protocol`, `delegateInput`, and `delegateCorrelationId` in history. Replay with a prefix that already includes `ActivityCompleted` for the delegate node does **not** re-invoke the host or delegate port.

Conformance vectors: `parity.r3.host_mediated_delegate_submit` (port/MCP parity) and `replay.delegate.prefix_requested_submit_tail` (prefix + submit replay tail).

## Related documentation

- [Run with MCP](mcp-operator-guide.md) — package install, tool reference, development setup
- [ADR-0002: Host-mediated activity execution](../architecture/adr/ADR-0002-host-mediated-activity-execution.md)
- [Engine package README](https://github.com/benvdbergh/workflows/blob/main/packages/engine/README.md) — library API and MCP tool schemas
- [Integration parity matrix](../architecture/arc42-assets/contracts/integration-parity-matrix.md) — port ↔ MCP conformance vectors
