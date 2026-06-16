# A2A delegate mapping guide

This guide describes how the reference engine's **`A2ADelegateExecutor`** maps `agent_delegate` nodes with `protocol: "a2a"` to an HTTP A2A task API. Workflow JSON carries **agent identity and input mapping only**; operator credentials and the A2A base URL live in **operator config** (environment variables), not in workflow documents (RFC-07 §7.3).

For host-driven delegation (no in-process HTTP client), see [Host-mediated activities](host-mediated-activities.md).

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
| `apiKeySecretRef` | Yes* | Vault ref (deferred; use `apiKeyEnv` until vault resolver ships) |
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
- `input-required` is **not** handled in-process; use [host-mediated activities](host-mediated-activities.md) so the host can satisfy A2A input prompts and submit via `workflow_submit_activity`.

### Authentication

All requests send `Authorization: Bearer {apiKey}` where `apiKey` is resolved from operator config.

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
