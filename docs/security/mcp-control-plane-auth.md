# MCP control-plane authentication

Operator guide for scoped bearer tokens on the workflow engine control plane.

## Overview

The reference engine supports **optional** scoped bearer tokens for lifecycle operations. When `WORKFLOW_ENGINE_AUTH_TOKENS` is configured:

- **REST** (`workflows-engine-rest`) requires `Authorization: Bearer <token>` on all workflow endpoints.
- **MCP stdio** does **not** enforce tokens — it relies on **OS process isolation** between the MCP host and the engine child process.

When the env var is unset or empty, auth is disabled (backward compatible for local development).

See [ADR-0005](../architecture/adr/ADR-0005-mcp-control-plane-auth.md) for design rationale.

## Configuration

```bash
export WORKFLOW_ENGINE_AUTH_TOKENS='[
  {"token":"agent-read","scopes":["read_history"]},
  {"token":"agent-run","scopes":["start","resume","submit_activity"]},
  {"token":"ops-admin","scopes":["start","resume","read_history","submit_activity"]}
]'
```

Or load from file:

```bash
export WORKFLOW_ENGINE_AUTH_TOKENS=file:./control-plane-tokens.json
```

Each record requires:

- `token` — opaque secret string (treat as credential; never commit to git)
- `scopes` — non-empty array of scope names (see below)

## Scopes

| Scope | Allows |
|-------|--------|
| `start` | Register definitions (`POST /v1/workflows`), start executions, cooperative cancel |
| `resume` | Resume interrupted executions |
| `read_history` | Status, list, events, checkpoint reads |
| `submit_activity` | Host-mediated activity submit and signal delivery |

### MCP tool mapping

| Tool | Scope |
|------|-------|
| `workflow_start` | `start` |
| `workflow_cancel` | `start` |
| `workflow_resume` | `resume` |
| `workflow_status` | `read_history` |
| `workflow_list` | `read_history` |
| `workflow_submit_activity` | `submit_activity` |
| `workflow_signal` | `submit_activity` |

## REST usage

```bash
curl -sS -H "Authorization: Bearer agent-read" \
  http://127.0.0.1:8787/v1/executions/my-exec-id
```

Missing or invalid tokens return HTTP **401** with:

```json
{ "error": { "code": "AUTH_ERROR", "message": "Missing or invalid bearer token." } }
```

Insufficient scope returns HTTP **403** with `AUTH_FORBIDDEN` and `details.reason: "insufficient_scope"` (plus `required_scope` / `granted_scopes`).

## MCP stdio boundary

`workflows-engine-mcp` communicates over stdin/stdout. There is no standard Authorization header on stdio. Security model:

1. **Trust boundary** — only the MCP host process should spawn the engine; use OS user permissions and host configuration to prevent untrusted clients from attaching.
2. **No token on stdio** — when auth is disabled (default), any client on the stdio session can invoke tools.
3. **Tokens configured** — REST enforces tokens; stdio remains unauthenticated by design. Do not expose stdio across network hops or shared multi-tenant hosts when tokens are required elsewhere.

For automated testing of MCP auth hooks, library callers may pass `authContext: { enforce: true, bearerToken }` to `createMcpWorkflowToolHandlers` — not exposed on the stdio binary.

## Error code

| Code | Meaning |
|------|---------|
| `AUTH_ERROR` | Missing, invalid, or under-scoped bearer token |

Aligned across MCP structured tool errors and REST JSON responses.

## Related

- [Alpha security baseline](alpha-security-baseline.md)
- [Definition signing v1 profile](definition-signing-v1-profile.md)
