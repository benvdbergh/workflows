# ADR-0005: MCP control-plane scoped bearer auth

**Status:** Accepted  
**Date:** 2026-06-22  
**Tags:** security, MCP, REST, authZ, R4

## Context

The reference engine exposes workflow lifecycle operations through MCP tools and an HTTP REST adapter (`workflows-engine-rest`). Alpha deployments assumed **OS process isolation** for MCP stdio (single trusted host process on stdin/stdout). Unattended automation and multi-tenant REST surfaces need **action-level authorization** without widening engine trust zones.

BEN-105 implements scoped bearer tokens for the control plane while preserving backward compatibility when no tokens are configured.

## Decision

### 1. Token format and scopes

Operators configure tokens via `WORKFLOW_ENGINE_AUTH_TOKENS` (inline JSON array or `file:path`):

```json
[
  { "token": "opaque-secret", "scopes": ["start", "read_history"] }
]
```

**Core scopes (minimum set):**

| Scope | Meaning |
|-------|---------|
| `start` | Start executions and register definitions; cooperative cancel |
| `resume` | Resume interrupted executions |
| `read_history` | Read status, list executions, fetch events/checkpoints |
| `submit_activity` | Host-mediated activity submit and signal delivery |

When `WORKFLOW_ENGINE_AUTH_TOKENS` is unset or empty, auth is **disabled** (local dev / stdio default).

### 2. Tool and route mapping

| MCP tool | Required scope | Rationale |
|----------|----------------|-----------|
| `workflow_start` | `start` | Creates execution |
| `workflow_resume` | `resume` | Continues interrupt |
| `workflow_status` | `read_history` | Read-only observation |
| `workflow_list` | `read_history` | Read-only listing |
| `workflow_submit_activity` | `submit_activity` | Mutates awaiting activity |
| `workflow_signal` | `submit_activity` | Unblocks wait — same privilege as external input |
| `workflow_cancel` | `start` | Lifecycle control — same class as start |

REST RFC-05 routes map to the same scopes (`POST /v1/workflows` → `start`, `GET /v1/executions/{id}/events` → `read_history`, etc.) in `control-plane-auth.mjs`.

### 3. Enforcement surfaces

| Surface | Enforcement |
|---------|-------------|
| **REST** (`rest-handler.mjs`) | `Authorization: Bearer <token>` on all workflow routes when tokens configured |
| **MCP stdio** | **No token channel** — relies on OS process isolation; auth not enforced on stdio even when tokens are configured |
| **MCP HTTP** (future) | `createMcpWorkflowToolHandlers` accepts `authContext: { enforce: true, bearerToken }` for transport-level hook |

Unauthorized calls return stable adapter code **`AUTH_ERROR`** (`401` on REST).

### 4. Error contract

`AUTH_ERROR` is added to `MCP_ADAPTER_ERROR` alongside existing validation and execution errors. MCP tools surface it via `structuredContent.error.code`; REST returns JSON `{ error: { code, message } }`.

## Considered options

1. **Per-tool API keys in manifest** — rejected; duplicates operator manifest and does not compose with REST.
2. **Stdio `_auth_token` in tool args** — rejected for production; documented REST-primary model avoids leaking tokens into workflow tool payloads.
3. **OAuth2 / JWT** — deferred to post-GA; opaque scoped tokens suffice for alpha→R4 runway.

## Consequences

- **Positive:** REST automation can enforce least privilege; error code is stable for integrators.
- **Positive:** Stdio local dev unchanged when env unset.
- **Negative:** Stdio with tokens configured does not auto-enforce — operators must not expose stdio across trust boundaries.
- **Negative:** Token store is static env config (no rotation API in-engine).

## Follow-up

- MCP HTTP transport adapter with Bearer metadata passthrough.
- Token rotation / external IdP integration (R4+ GA hardening).
- SDK client automatic `Authorization` header from operator config.

## References

- `packages/engine/src/security/control-plane-auth.mjs`
- `docs/security/mcp-control-plane-auth.md`
- `docs/security/alpha-security-baseline.md`
- RFC-05 integration interfaces
- BEN-105 / BEN-86 security epic
