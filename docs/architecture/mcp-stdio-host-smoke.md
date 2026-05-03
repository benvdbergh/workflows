# MCP stdio host smoke path (Story-4-3)

This runbook verifies the EPIC-4 MCP stdio adapter from an MCP-capable host using a deterministic `start -> status -> resume` flow plus one structured error assertion.

## Scope and non-goals

- Scope: local POC smoke validation of `workflow_start`, `workflow_status`, and `workflow_resume`.
- Non-goals: production auth, multi-tenant isolation, secret management hardening, remote exposure.

## Prerequisites

- Node.js `>=22.5.0`
- **Operator setup:** the host runs the published [`@agent-workflow/engine`](https://www.npmjs.com/package/@agent-workflow/engine) via `npx` (no clone). Use **`0.0.2`** or **`@alpha`** once it resolves to a build that bundles the POC schema; see [No-install MCP quickstart](../releases/alpha-release-notes.md#no-install-mcp-quickstart-npx).
- **Development setup:** clone this repository, then from the repo root:

```bash
npm install
```

## 1) Launch the MCP stdio server (development setup only)

Skip this section if the host starts the server for you (**operator setup**; see section 2).

From repository root:

```bash
npm run engine:mcp:stdio
```

Expected behavior:

- Process stays running and waits on stdio for MCP requests.
- No startup banner is required; absence of immediate crash is success.

## 2) Connect from an MCP-capable host (copy/paste)

### Operator setup (published package)

```json
{
  "mcpServers": {
    "workflow-engine": {
      "command": "npx",
      "args": ["-y", "-p", "@agent-workflow/engine@alpha", "workflows-engine-mcp"]
    }
  }
}
```

Pin a version instead of `@alpha` when you need a fixed build ([release notes](../releases/alpha-release-notes.md#no-install-mcp-quickstart-npx)).

### Development setup (local engine checkout)

```json
{
  "mcpServers": {
    "workflow-engine": {
      "command": "node",
      "args": ["C:/path/to/your/workflows/packages/engine/src/mcp-stdio-server.mjs"]
    }
  }
}
```

Use an absolute path in `args` for **development setup**.

After connect, discover tools and confirm the host exposes:

- `workflow_start`
- `workflow_status`
- `workflow_resume`

## Canonical workflow definition

Use **one** parsed JSON object for every `definition` field in section 3: the **lighthouse golden fixture** in `examples/lighthouse-customer-routing.workflow.json` (same definition CI validates with `schemas/workflow-definition-poc.json`).

| Context | How to obtain it |
|--------|------------------|
| Clone present | Read and parse `examples/lighthouse-customer-routing.workflow.json` at the repository root. Pass the **parsed root object** as `definition` (not a file path string). |
| No clone (operator) | Download and parse the same file from the default branch, e.g. `https://raw.githubusercontent.com/benvdbergh/workflows/master/examples/lighthouse-customer-routing.workflow.json`. |

Reuse the **same in-memory object** for `workflow_start` and `workflow_resume`. For any other workflow, validate from a clone first: `npm run engine:validate -- path/to/workflow.json`.

## 3) Deterministic smoke flow with expected outputs

Use the lighthouse object from the **Canonical workflow definition** table above for each `definition` below.

### 3.1 `workflow_start`

Args:

```json
{
  "execution_id": "story-4-3-smoke-1",
  "definition": "<lighthouse fixture from the table above>",
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
  "definition": "<same object as in 3.1>",
  "resume_payload": { "intent": "billing" }
}
```

Expected structured result shape:

```json
{
  "execution_id": "story-4-3-smoke-1",
  "status": "completed",
  "result": { "intent": "billing", "confidence": 0.3 }
}
```

With the default POC stub, `confidence` is deterministic for this fixture (see `packages/engine/test/poc-runner.test.mjs`). Assert `status` and `intent` first; treat numeric fields as stub-specific unless a real activity adapter is configured.

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

Some MCP hosts surface the same failure as plain text; the required behavior is **`EXECUTION_NOT_FOUND`**, not the exact JSON wrapper.

## POC security posture and deferred hardening

Current posture for this smoke path:

- Local-only stdio transport between host and adapter process.
- No authentication or authorization layer in the adapter.
- In-memory execution history store in the stdio entrypoint process (non-persistent and single-process POC behavior).

Deferred hardening tracks to RFC-07:

- `docs/RFC/rfc-07-security-model.md` for identity, policy enforcement, and secret handling expectations.
- EPIC-level note on GitHub ([#21 — MCP stdio integration surface](https://github.com/benvdbergh/workflows/issues/21)) keeps auth hardening explicitly out of POC scope.
