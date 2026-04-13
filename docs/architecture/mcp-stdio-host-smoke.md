# MCP stdio host smoke path (Story-4-3)

This runbook verifies the EPIC-4 MCP stdio adapter from an MCP-capable host using a deterministic `start -> status -> resume` flow plus one structured error assertion.

## Scope and non-goals

- Scope: local POC smoke validation of `workflow_start`, `workflow_status`, and `workflow_resume`.
- Non-goals: production auth, multi-tenant isolation, secret management hardening, remote exposure.

## Prerequisites

- Node.js `>=22.5.0`
- Repository dependencies installed:

```bash
npm install
```

## 1) Launch the MCP stdio server (copy/paste)

From repository root:

```bash
npm run engine:mcp:stdio
```

Expected behavior:

- Process stays running and waits on stdio for MCP requests.
- No startup banner is required; absence of immediate crash is success.

## 2) Connect from an MCP-capable host (copy/paste)

Example host wiring for clients that accept command-based MCP server config:

```json
{
  "mcpServers": {
    "workflow-engine": {
      "command": "node",
      "args": ["C:/Users/vandenbb/repos/workflows/packages/engine/src/mcp-stdio-server.mjs"]
    }
  }
}
```

After connect, discover tools and confirm the host sees:

- `workflow_start`
- `workflow_status`
- `workflow_resume`

## 3) Deterministic smoke flow with expected outputs

Use this workflow definition payload in host tool calls (`definition` argument):

```json
{
  "document": { "schema": "https://agent-workflow-protocol.dev/schema/workflow-definition-poc/v1" },
  "workflow_id": "smoke-lighthouse",
  "version": "1.0.0",
  "state_schema": {
    "type": "object",
    "properties": {
      "ticket_text": { "type": "string" },
      "intent": { "type": "string" },
      "confidence": { "type": ["number", "null"] }
    },
    "required": ["ticket_text"],
    "additionalProperties": true
  },
  "nodes": [
    { "id": "start", "type": "start", "config": {} },
    { "id": "classify", "type": "step", "config": { "activity": "classify_ticket" } },
    {
      "id": "route",
      "type": "switch",
      "config": {
        "cases": [
          { "when": ".intent == \"billing\"", "next": "end_billing" },
          { "when": ".intent == \"technical\"", "next": "end_technical" }
        ],
        "default": "human_review"
      }
    },
    {
      "id": "human_review",
      "type": "interrupt",
      "config": {
        "prompt": "Please classify ticket intent manually.",
        "resume_schema": {
          "type": "object",
          "properties": { "intent": { "type": "string", "enum": ["billing", "technical"] } },
          "required": ["intent"],
          "additionalProperties": false
        }
      }
    },
    {
      "id": "end_billing",
      "type": "end",
      "config": { "output_mapping": "{ intent: .intent, confidence: .confidence }" }
    },
    {
      "id": "end_technical",
      "type": "end",
      "config": { "output_mapping": "{ intent: .intent, confidence: .confidence }" }
    }
  ],
  "edges": [
    { "source": "__start__", "target": "start" },
    { "source": "start", "target": "classify" },
    { "source": "classify", "target": "route" },
    { "source": "human_review", "target": "end_billing" }
  ]
}
```

### 3.1 `workflow_start`

Args:

```json
{
  "execution_id": "story-4-3-smoke-1",
  "definition": "<paste definition JSON above as object>",
  "input": { "ticket_text": "unclear issue from customer" }
}
```

Expected structured result shape:

```json
{
  "execution_id": "story-4-3-smoke-1",
  "status": "interrupted",
  "node_id": "human_review"
}
```

### 3.2 `workflow_status`

Args:

```json
{ "execution_id": "story-4-3-smoke-1" }
```

Expected structured result shape:

```json
{
  "execution_id": "story-4-3-smoke-1",
  "phase": "interrupted",
  "current_node_id": "human_review"
}
```

### 3.3 `workflow_resume`

Args:

```json
{
  "execution_id": "story-4-3-smoke-1",
  "definition": "<same definition object>",
  "resume_payload": { "intent": "billing" }
}
```

Expected structured result shape:

```json
{
  "execution_id": "story-4-3-smoke-1",
  "status": "completed",
  "result": { "intent": "billing", "confidence": null }
}
```

## 4) Structured error assertion (required)

Call `workflow_status` with an unknown execution id:

Args:

```json
{ "execution_id": "story-4-3-missing-exec" }
```

Expected tool error result (shape):

```json
{
  "isError": true,
  "structuredContent": {
    "error": {
      "code": "EXECUTION_NOT_FOUND"
    }
  }
}
```

This verifies adapter-level structured mapping instead of opaque process crashes.

## POC security posture and deferred hardening

Current posture for this smoke path:

- Local-only stdio transport between host and adapter process.
- No authentication or authorization layer in the adapter.
- In-memory execution history store in the stdio entrypoint process (non-persistent and single-process POC behavior).

Deferred hardening tracks to RFC-07:

- `docs/RFC/rfc-07-security-model.md` for identity, policy enforcement, and secret handling expectations.
- EPIC-level note in `docs/epics/Epic-4-MCP-stdio-integration-surface.md` keeps auth hardening explicitly out of POC scope.
