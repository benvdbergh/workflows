# Lighthouse MCP host guided demo walkthrough

This guide runs the lighthouse scenario through MCP host tools without redefining the EPIC-4 adapter contract.

## Scope and non-goals

- Scope: lighthouse workflow path using `workflow_start`, `workflow_status`, and `workflow_resume`.
- Non-goals: redefining adapter contracts, production auth, remote deployment hardening.

## Prerequisites

- Node.js `>=22.5.0`
- Lighthouse definition path: `examples/lighthouse-customer-routing.workflow.json`
- Contract baseline: `docs/architecture/mcp-stdio-host-smoke.md`

For **development setup** only (local engine source): clone this repository and run `npm install` at the repo root.

## 1) Configure your MCP client (Cursor / Claude-style)

Pick one wiring mode. **Operator setup** is the default for MCP hosts: it runs the published package with `npx` and does not require a local clone. **Development setup** runs the adapter script from your checkout when you are changing engine or adapter code.

### Operator setup (published package)

Uses the npm package [`@agent-workflow/engine`](https://www.npmjs.com/package/@agent-workflow/engine). `@alpha` tracks the latest alpha publish; pin an exact version (for example `@0.1.0-alpha.4`) when you need reproducible bug reports or demos.

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

Notes:

- With **development setup**, use an absolute path in `args` so the client can launch the server reliably.
- Restart or reload your MCP host/client after saving config so tools are rediscovered.
- Expected tools: `workflow_start`, `workflow_status`, `workflow_resume`.

## 2) Launch MCP stdio adapter (development setup only)

If you use **operator setup**, the MCP host starts the server for you; skip this step.

From repository root (local checkout):

```bash
npm run engine:mcp:stdio
```

Expected: process stays alive and waits for MCP requests on stdio.

## 3) Run host flow with lighthouse definition

### 3.1 `workflow_start`

Use arguments:

```json
{
  "execution_id": "story-6-3-lighthouse-1",
  "definition": "<JSON object loaded from examples/lighthouse-customer-routing.workflow.json>",
  "input": { "ticket_text": "Unclear customer issue, needs triage." }
}
```

Expected outcome for this input:

- `status` is `interrupted`
- `node_id` is `human_review`

### 3.2 `workflow_status`

Use:

```json
{ "execution_id": "story-6-3-lighthouse-1" }
```

Expected shape:

```json
{
  "execution_id": "story-6-3-lighthouse-1",
  "phase": "interrupted",
  "current_node_id": "human_review"
}
```

### 3.3 `workflow_resume`

Submit interrupt response:

```json
{
  "execution_id": "story-6-3-lighthouse-1",
  "definition": "<same lighthouse definition object>",
  "resume_payload": { "intent": "billing" }
}
```

Expected completion:

- `status` is `completed`
- `result.intent` is `billing`

## Interrupt response and side-effect inspection

Interrupt response is submitted in `workflow_resume.resume_payload`.  
For lighthouse, setting `{ "intent": "billing" }` routes through `open_ticket` before `finish`.

Host-visible inspection options:

- Check `result` in `workflow_resume` response for terminal state projection.
- Call `workflow_status` after completion to confirm final phase.
- If your host exposes `structuredContent.final_state`, confirm `intent` and `confidence` match expected post-resume state.

## Structured error example

Call `workflow_status` with unknown execution id:

```json
{ "execution_id": "story-6-3-unknown-exec" }
```

Expected error shape:

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

## References

- `docs/architecture/mcp-stdio-host-smoke.md`
- `packages/engine/README.md`
- `examples/lighthouse-customer-routing.workflow.json`
