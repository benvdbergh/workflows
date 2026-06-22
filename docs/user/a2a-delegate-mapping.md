# A2A delegate mapping guide

This guide describes how the reference engine's **`A2ADelegateExecutor`** maps `agent_delegate` nodes with `protocol: "a2a"` to an HTTP A2A task API. Workflow JSON carries **agent identity and input mapping only**; operator credentials and the A2A base URL live in **operator config** (environment variables), not in workflow documents (RFC-07 §7.3).

For host-driven delegation (no in-process HTTP client), see [Host-mediated activities](host-mediated-activities.md).

> **Operator warning — in-process A2A blocks the control plane:** When a workflow uses **`A2ADelegateExecutor`** (in-process HTTP submit + poll), delegate execution runs **synchronously inside** `workflow_start`, `workflow_resume`, or any continuation that reaches an `agent_delegate` node. The poll loop may run for up to **`pollTimeoutMs`** (default **120 seconds**) before returning or failing. **MCP stdio hosts** (Cursor, Claude Desktop, and similar) often enforce shorter tool-call timeouts and will disconnect mid-poll. For **long-running**, **interactive**, or **`input-required`** A2A tasks, use **`activity_execution_mode: "host_mediated"`** from the first control-plane call so the engine yields `awaiting_activity` and the host delegates out of band. See [Migrating from in-process A2A when a task needs input](#migrating-from-in-process-a2a-when-a-task-needs-input) below.

## When to use

| Mode | Delegate port | Use case |
|------|---------------|----------|
| Default (omit `delegateExecutor`) | `MockA2ADelegateExecutor` | CI, demos, offline development |
| `A2ADelegateExecutor` | HTTP submit + poll | Production A2A agent runtimes |
| `activity_execution_mode: host_mediated` | None (host submits outcome) | Assistant hosts that own agent credentials |

Wire the production executor when constructing the application port or graph walker:

```javascript
import { A2ADelegateExecutor, createWorkflowApplicationPort } from "@agent-workflow/engine";

const port = createWorkflowApplicationPort({
  store,
  delegateExecutor: new A2ADelegateExecutor({
    operatorConfig: {
      baseUrl: process.env.A2A_BASE_URL,
      apiKeyEnv: "A2A_API_KEY",
      pollIntervalMs: 500,
      pollTimeoutMs: 120_000,
    },
  }),
});
```

## Operator configuration

| Field | Required | Description |
|-------|----------|-------------|
| `baseUrl` | Yes | A2A HTTP API root (no trailing slash), e.g. `https://a2a.example.com` |
| `apiKeyEnv` | Yes* | Env var holding the Bearer token sent as `Authorization: Bearer …` |
| `apiKeySecretRef` | Yes* | Secret ref (`env:VAR` or `file:path`); see [secret-ref-operator-config.md](../security/secret-ref-operator-config.md) |
| `pollIntervalMs` | No | Poll interval while status is non-terminal (default `500`) |
| `pollTimeoutMs` | No | Max wait for `completed` / `failed` (default `120000`) |

\* One of `apiKeyEnv` or `apiKeySecretRef` is required.

Example environment:

```bash
export A2A_BASE_URL=https://a2a.example.com
export A2A_API_KEY=your-operator-token
```

## HTTP task API (reference mapping)

The executor uses a minimal task surface aligned with RFC-06 A2A lifecycle semantics (`submitted` → `working` → `completed` / `failed`).

### Submit task

`POST {baseUrl}/tasks`

Request:

```json
{
  "agent_id": "coder",
  "correlation_id": "{executionId}:delegate:{nodeId}",
  "input": { "task": "implement feature X" }
}
```

- `agent_id` — from `config.agent_id` on the `agent_delegate` node.
- `correlation_id` — engine-minted `delegateCorrelationId` (`mintDelegateCorrelationId(executionId, nodeId)`).
- `input` — resolved `input_mapping` payload (workflow state → delegate input).

Response `201`:

```json
{
  "id": "a2a-task-abc123",
  "status": "submitted"
}
```

### Poll task status

`GET {baseUrl}/tasks/{id}`

Response `200`:

```json
{
  "id": "a2a-task-abc123",
  "status": "working",
  "output": { "patch": "// …", "delegate_status": "completed" },
  "error": "optional when status is failed"
}
```

Supported `status` values: `submitted`, `working`, `input-required`, `completed`, `failed`.

- The executor polls until `completed` or `failed` (or timeout).
- `input-required` is **not** handled in-process — the poll loop **throws** instead of yielding. Use [host-mediated activities](host-mediated-activities.md) so the host can satisfy A2A input prompts and submit via `workflow_submit_activity` (see [Migrating from in-process A2A when a task needs input](#migrating-from-in-process-a2a-when-a-task-needs-input)).

### Authentication

All requests send `Authorization: Bearer {apiKey}` where `apiKey` is resolved from operator config.

## Migrating from in-process A2A when a task needs input

**Symptom:** A workflow started with in-process `A2ADelegateExecutor` (default MCP stdio path when a custom delegate port is wired, or library use with `activity_execution_mode: "in_process"`) fails or stalls when the A2A runtime returns **`input-required`** on poll — for example:

```
A2A task "a2a-task-abc123" requires host input (input-required); use host_mediated activity mode for interactive delegates
```

Or the MCP host times out while `workflow_start` is still inside the poll loop (up to **`pollTimeoutMs`**, default 120s).

**Fix:** Treat interactive delegates as **host-mediated from the start**. Do not rely on in-process poll to bridge human-in-the-loop or multi-turn agent prompts.

### 1. Start with `host_mediated`

Fixture: `examples/conformance-agent-delegate-linear.workflow.json`.

```json
{
  "execution_id": "multi-agent-interactive-1",
  "definition": { "...": "conformance-agent-delegate-linear.workflow.json" },
  "input": { "task": "implement feature X" },
  "activity_execution_mode": "host_mediated"
}
```

Response (engine yields immediately — no in-process HTTP poll):

```json
{
  "status": "awaiting_activity",
  "node_id": "implement",
  "agent_id": "coder",
  "protocol": "a2a",
  "delegate_input": { "task": "implement feature X" },
  "delegate_correlation_id": "multi-agent-interactive-1:delegate:implement"
}
```

### 2. Host submits A2A task and polls out of band

The host (not the engine) calls `POST {baseUrl}/tasks` with `delegate_input`, then polls `GET {baseUrl}/tasks/{id}` using its own timeout policy.

When the first poll returns **`input-required`**, the host satisfies the prompt (user message, form, tool result) via the A2A runtime's input API, then continues polling until `completed` or `failed` — without holding an MCP stdio tool call open.

Example non-terminal poll (host-side):

```json
{
  "id": "a2a-task-abc123",
  "status": "input-required",
  "output": { "prompt": "Which API style should the patch use?" }
}
```

After the host supplies input and the task reaches **`completed`**:

```json
{
  "id": "a2a-task-abc123",
  "status": "completed",
  "output": { "patch": "// …", "delegate_status": "completed" }
}
```

### 3. Submit delegate outcome to the engine

```json
{
  "execution_id": "multi-agent-interactive-1",
  "definition": "<same object as workflow_start>",
  "input": { "task": "implement feature X" },
  "node_id": "implement",
  "activity_execution_mode": "host_mediated",
  "outcome": {
    "ok": true,
    "delegate_correlation_id": "multi-agent-interactive-1:delegate:implement",
    "external_task_id": "a2a-task-abc123",
    "result": { "patch": "// …", "delegate_status": "completed" }
  }
}
```

| In-process A2A | Host-mediated A2A |
|----------------|-------------------|
| Poll runs inside `workflow_start` / resume (blocks MCP stdio) | Engine returns `awaiting_activity` immediately |
| `input-required` → executor throws | Host handles `input-required` and multi-turn poll |
| Host timeout risk on long delegates | Host controls poll interval and timeouts |

Full host loop: [Host-mediated activities — `agent_delegate` host loop](host-mediated-activities.md#agent_delegate-host-loop).

## Workflow history correlation

On in-process execution the engine emits:

| Event | Fields |
|-------|--------|
| `ActivityRequested` | `delegateCorrelationId`, `agentId`, `protocol`, `delegateInput` |
| `ActivityCompleted` | `delegateCorrelationId`, `externalTaskId` (= A2A task `id`), `result` (= task `output`) |
| `ActivityFailed` | `error`, optional `code` |

`delegateCorrelationId` is always `{executionId}:delegate:{nodeId}`. `externalTaskId` is the A2A server task id from submit/poll responses.

## Stable error codes

| Code | Meaning |
|------|---------|
| `A2A_CONFIG_INVALID` | Missing `baseUrl` or node `agent_id` |
| `A2A_CREDENTIALS_MISSING` | `apiKeyEnv` unset/empty or unresolved `apiKeySecretRef` |
| `A2A_PROVIDER_ERROR` | HTTP/transport failure or poll timeout |
| `A2A_TASK_FAILED` | A2A task reached `failed` status |
| `DELEGATE_PROTOCOL_UNSUPPORTED` | `A2ADelegateExecutor` invoked for non-`a2a` protocol |

## Testing with the mock A2A server

Engine tests and conformance use an in-process mock HTTP server (`packages/engine/test/helpers/a2a-mock-http-server.mjs`) implementing the same `/tasks` contract. Run the opt-in r3 multi-agent smoke in tests:

```bash
npm test -- --test-name-pattern "r3-multi-agent-coding implement"
```

Or run the full engine test suite:

```bash
npm test
```

## Vendor-specific adapters

Real A2A deployments may use Agent Cards, SSE streaming, or different path layouts. Wrap those details in a custom `A2ATransport` implementation and inject it into `A2ADelegateExecutor({ transport })` while preserving `delegateCorrelationId` / `externalTaskId` on delegate results.
