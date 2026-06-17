# @agent-workflow/sdk

JavaScript/TypeScript client for the [Agent Workflow Protocol](https://github.com/benvdbergh/workflows) reference engine. Responses use MCP-aligned `snake_case` DTOs; method options accept camelCase or snake_case.

## Install

```bash
npm install @agent-workflow/sdk @agent-workflow/engine
```

## Quickstart — REST backend (< 5 minutes)

**1. Start the reference REST server** (from a clone of this repo):

```bash
npm install
npm run engine:rest:serve
```

Default base URL: `http://127.0.0.1:8787`

**2. Run a workflow from Node:**

```javascript
import { WorkflowClient } from "@agent-workflow/sdk";

const client = new WorkflowClient({ baseUrl: "http://127.0.0.1:8787" });

const definition = {
  document: {
    schema: "https://agent-workflow.dev/schemas/workflow-definition.json",
    name: "hello-sdk",
    version: "1.0.0",
  },
  state_schema: { type: "object" },
  nodes: [
    { id: "start", type: "start" },
    { id: "end", type: "end" },
  ],
  edges: [
    { source: "__start__", target: "start" },
    { source: "start", target: "end" },
  ],
};

const { wf_id } = await client.registerDefinition(definition);

const started = await client.start({
  wfId: wf_id,
  executionId: "demo-1",
  input: {},
});
console.log(started.status); // "completed"

const status = await client.getStatus({ executionId: "demo-1" });
console.log(status.phase); // "completed"
```

You can skip `registerDefinition` and pass `definition` directly to `start`; the SDK registers it on the server first.

## Quickstart — in-memory (tests, no HTTP)

```javascript
import { createWorkflowApplicationPort, MemoryExecutionHistoryStore } from "@agent-workflow/engine";
import { WorkflowClient } from "@agent-workflow/sdk";

const port = createWorkflowApplicationPort({ store: new MemoryExecutionHistoryStore() });
const client = WorkflowClient.fromPort(port);

const definition = { /* same shape as above */ };

const started = await client.start({
  definition,
  executionId: "mem-1",
  input: {},
});
console.log(started.execution_id, started.status);
```

## API

| Method | Description |
|--------|-------------|
| `registerDefinition(definition)` | `POST /v1/workflows` (REST) or local id derivation (port) |
| `start({ wfId?, definition?, executionId?, input?, activityExecutionMode? })` | Start execution |
| `getStatus({ executionId })` | Poll execution phase |
| `resume({ executionId, definition, resumePayload? })` | Continue after `interrupt` |
| `submitActivity({ executionId, definition, input?, nodeId, outcome })` | Complete host-mediated activity |

Errors throw `SdkError` with a stable `code` (`VALIDATION_ERROR`, `EXECUTION_NOT_FOUND`, `INVALID_RESUME_PAYLOAD`, `ACTIVITY_SUBMIT_*`, `ENGINE_FAILURE`, …) parsed from REST `{ error: { code, message } }` bodies.

## TypeScript

Hand-maintained declarations ship in `src/types.d.ts`. No build step required — the package is ESM `.mjs` with JSDoc.

## Development

```bash
npm run sdk:test
```
