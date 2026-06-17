# Run with MCP

This is the **canonical operator guide** for running `@agent-workflow/engine` through MCP stdio. Use a **development setup** (local `mcp-stdio-server.mjs` from a clone) only when modifying the engine or adapter.

> **Read order:** start here for wiring and tools → [Host-mediated activities](host-mediated-activities.md) (assistant hosts) → [MCP stdio host smoke runbook](../architecture/arc42-assets/runbooks/mcp-stdio-host-smoke.md) (QA acceptance) → [Lighthouse MCP walkthrough](../architecture/arc42-assets/demos/lighthouse-mcp-host-guided-demo-walkthrough.md) (guided demo) → [operator manifest contract](../architecture/arc42-assets/contracts/mcp-operator-manifest.md) (JSON schema).

## Package and bins

- npm scope: **`@agent-workflow`**
- MCP server bin: `workflows-engine-mcp`
- Validation CLI bin: `workflows-engine`

The package exposes **two** bins. Always pass **`-p` / `--package`** with `npx` so npm resolves the executable:

```bash
npx -y -p @agent-workflow/engine@0.1.5 workflows-engine-mcp
```

Without `-p`, you may see `npm error could not determine executable to run`.

## Install channels

**Moving alpha channel:**

```bash
npx -y -p @agent-workflow/engine@alpha workflows-engine-mcp
```

**Pinned reproducible version:**

```bash
npx -y -p @agent-workflow/engine@0.1.5 workflows-engine-mcp
```

Use `@alpha` for fast feedback; pin an exact version for bug reports and demos.

## Host configuration

Generic MCP client JSON:

```json
{
  "mcpServers": {
    "agent-workflow-engine": {
      "command": "npx",
      "args": [
        "-y",
        "-p",
        "@agent-workflow/engine@0.1.5",
        "workflows-engine-mcp"
      ]
    }
  }
}
```

Replace `0.1.5` with your target version or `@alpha`.

### Optional environment

| Variable | Purpose |
|----------|---------|
| `WORKFLOW_ENGINE_MCP_CONFIG` | JSON config for engine-direct activity manifests |
| `WORKFLOW_ENGINE_MCP_ALLOW_COMMANDS` | Extend allowed command basenames for engine-direct `tool_call` |
| `WORKFLOW_ENGINE_LLM_CONFIG` | Inline JSON or file path for `llm_call` operator credentials |
| `WORKFLOW_ENGINE_STEP_HANDLERS` | Inline JSON or file path: **static** handler URN → output map (see below) |
| `WORKFLOW_ENGINE_PROFILE` | Set to `demo` for stub fallback on unconfigured node types inside a partial composite |

See the [engine package README](https://github.com/benvdbergh/workflows/blob/main/packages/engine/README.md) for engine-direct manifests and composite routing.

### `step` handlers via environment (static outputs only)

`WORKFLOW_ENGINE_STEP_HANDLERS` bootstraps `StepActivityExecutor` for `workflows-engine-mcp`. The value is inline JSON or a path to a JSON file whose **keys are handler URNs** and **values are fixed output objects** — the same shape as conformance `stepHandlers` vectors.

**This env var does not register programmatic handlers.** Each URN is wired to an async function that returns the configured JSON object as-is. You cannot run custom code, read workflow state, call external APIs, or branch on inputs through this mechanism. It is intended for smoke tests, demos, and fixture replay — not production step logic.

For programmatic `step` handlers, use the library API at bootstrap:

```js
import { StepActivityExecutor, StepHandlerRegistry, createWorkflowApplicationPort } from "@agent-workflow/engine";

const registry = new StepHandlerRegistry();
registry.register("urn:my-app:handlers:lookup-customer", async (ctx) => {
  // ctx.executionId, ctx.node, ctx.state available
  return { customerId: "c-1", name: "Ada" };
});

const activityExecutor = new StepActivityExecutor({ registry: registry.createFrozenCopy() });
const port = createWorkflowApplicationPort({ store, activityExecutor });
```

See [`StepHandlerRegistry.register`](https://github.com/benvdbergh/workflows/blob/main/packages/engine/src/orchestrator/step-activity-executor.mjs) in `packages/engine/src/orchestrator/step-activity-executor.mjs` and the [Engine-direct `step` execution](https://github.com/benvdbergh/workflows/blob/main/packages/engine/README.md#engine-direct-step-execution-stepactivityexecutor) section of the engine README.

## MCP tools

| Tool | Purpose |
|------|---------|
| `workflow_start` | Validate definition + input; start execution |
| `workflow_status` | Inspect phase, current node, interrupt state |
| `workflow_resume` | Resume after `interrupt` with typed payload |
| `workflow_submit_activity` | Submit host-mediated activity results |

### Typical lifecycle

1. **`workflow_start`** — pass `definition` (workflow JSON object) and `input` (initial state seed).
2. **`workflow_status`** — repeat until `completed`, `failed`, or `awaiting_resume`.
3. **`workflow_resume`** — when status shows an interrupt; pass `resume_payload` matching the node's `resume_schema`.
4. **`workflow_submit_activity`** — when the engine requests a host-mediated `llm_call`, `tool_call`, or `step`. Pass **`activity_execution_mode: "host_mediated"`** on start/resume/submit when the host owns credentials. See [Host-mediated activities](host-mediated-activities.md).

### Stable error codes

| Code | Meaning |
|------|---------|
| `VALIDATION_ERROR` | Definition or input failed schema validation |
| `EXECUTION_NOT_FOUND` | Unknown execution id |
| `INVALID_RESUME_PAYLOAD` | Resume payload does not match interrupt schema |
| `ACTIVITY_SUBMIT_NOT_AWAITING` | Submit when no activity is pending |
| `ACTIVITY_SUBMIT_NODE_MISMATCH` | Submit targets wrong node |
| `ACTIVITY_SUBMIT_PARALLEL_MISMATCH` | Parallel branch correlation mismatch |
| `ENGINE_FAILURE` | Runtime engine error |
| `INTERNAL_ERROR` | Adapter failure |

## Lighthouse smoke test

1. Load `examples/lighthouse-customer-routing.workflow.json` from the repository (or embed the JSON in your host).
2. `workflow_start` with `{ "ticket_text": "I was charged twice on my last invoice" }`.
3. Observe `switch` routing via `workflow_status`.
4. For the default human route, `workflow_resume` with `{ "intent": "billing" }`.

Repository clone — start server manually:

```bash
npm run engine:mcp:stdio
```

## Development setup

When hacking the adapter or engine in a clone:

```json
{
  "mcpServers": {
    "workflow-engine-local": {
      "command": "node",
      "args": ["packages/engine/src/mcp-stdio-server.mjs"],
      "cwd": "/absolute/path/to/workflows"
    }
  }
}
```

## Security notes

- MCP stdio runs as the host user; treat workflow definitions as trusted code.
- Payload size is capped at 2 MiB UTF-8 JSON per definition/input/resume at the adapter.
- Persisted events redact common secret key names (`apiKey`, `token`, `password`, `secret`).

Operator checklist: [Security (operators)](security-operators.md).

## Further reading (repository)

- [Host-mediated activities](host-mediated-activities.md)
- [Lighthouse MCP walkthrough](https://github.com/benvdbergh/workflows/blob/main/docs/architecture/arc42-assets/demos/lighthouse-mcp-host-guided-demo-walkthrough.md)
- [MCP stdio host smoke runbook](https://github.com/benvdbergh/workflows/blob/main/docs/architecture/arc42-assets/runbooks/mcp-stdio-host-smoke.md)
