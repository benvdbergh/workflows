# Lighthouse MCP host guided demo walkthrough

This guide runs the lighthouse scenario through MCP host tools without redefining the EPIC-4 adapter contract.

## Scope and non-goals

- Scope: lighthouse workflow path using `workflow_start`, `workflow_status`, and `workflow_resume`.
- Non-goals: redefining adapter contracts, production auth, remote deployment hardening.

## Prerequisites

- Node.js `>=22.5.0`
- Dependencies installed:

```bash
npm install
```

- Lighthouse definition path: `examples/lighthouse-customer-routing.workflow.json`
- Contract baseline: `docs/architecture/mcp-stdio-host-smoke.md`

## 1) Launch MCP stdio adapter

From repository root:

```bash
npm run engine:mcp:stdio
```

Expected: process stays alive and waits for MCP requests on stdio.

## 2) Run host flow with lighthouse definition

### 2.1 `workflow_start`

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

### 2.2 `workflow_status`

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

### 2.3 `workflow_resume`

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
