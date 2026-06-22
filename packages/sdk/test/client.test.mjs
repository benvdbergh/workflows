import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import {
  createRestWorkflowHandler,
  createWorkflowApplicationPort,
  DefinitionRegistry,
  MemoryExecutionHistoryStore,
} from "@agent-workflow/engine";
import { SdkError, WorkflowClient } from "../src/index.mjs";

function minimalValidWorkflowDefinition(name = "sdk-linear") {
  return {
    document: {
      schema: "https://agent-workflow.dev/schemas/workflow-definition.json",
      name,
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
}

function hostMediatedLinearDefinition() {
  return {
    document: {
      schema: "https://agent-workflow.dev/schemas/workflow-definition.json",
      name: "sdk-host-med",
      version: "1.0.0",
    },
    state_schema: {
      type: "object",
      properties: {
        out: { type: "string" },
      },
    },
    nodes: [
      { id: "start", type: "start" },
      {
        id: "work",
        type: "tool_call",
        config: { server: "demo-mcp", tool: "stub", arguments: {} },
      },
      { id: "end", type: "end", config: { output_mapping: ".out" } },
    ],
    edges: [
      { source: "__start__", target: "start" },
      { source: "start", target: "work" },
      { source: "work", target: "end" },
    ],
  };
}

/**
 * @param {(baseUrl: string) => Promise<void>} run
 */
async function withRestSdkServer(run) {
  const store = new MemoryExecutionHistoryStore();
  const definitionRegistry = new DefinitionRegistry();
  const workflowPort = createWorkflowApplicationPort({ store });
  const handler = createRestWorkflowHandler(workflowPort, { definitionRegistry, store });
  const server = createServer((req, res) => {
    handler(req, res).catch((error) => {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: String(error) } }));
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve(undefined))));
  }
}

describe("WorkflowClient REST transport", () => {
  it("registers, starts, and reads status via snake_case DTOs", async () => {
    await withRestSdkServer(async (baseUrl) => {
      const client = new WorkflowClient({ baseUrl });
      const definition = minimalValidWorkflowDefinition("sdk-rest-linear");
      const registered = await client.registerDefinition(definition);
      assert.equal(registered.wf_id, "sdk-rest-linear");

      const started = await client.start({
        wfId: registered.wf_id,
        executionId: "sdk-rest-1",
        input: {},
      });
      assert.equal(started.execution_id, "sdk-rest-1");
      assert.equal(started.status, "completed");

      const status = await client.getStatus({ executionId: "sdk-rest-1" });
      assert.equal(status.phase, "completed");
    });
  });

  it("auto-registers definition when start receives definition only", async () => {
    await withRestSdkServer(async (baseUrl) => {
      const client = new WorkflowClient({ baseUrl });
      const definition = minimalValidWorkflowDefinition("sdk-auto-reg");
      const started = await client.start({
        definition,
        executionId: "sdk-auto-1",
        input: {},
      });
      assert.equal(started.status, "completed");
    });
  });

  it("throws SdkError with MCP-aligned code on missing execution", async () => {
    await withRestSdkServer(async (baseUrl) => {
      const client = new WorkflowClient({ baseUrl });
      await assert.rejects(
        () => client.getStatus({ executionId: "missing" }),
        (error) => {
          assert.ok(error instanceof SdkError);
          assert.equal(error.code, "EXECUTION_NOT_FOUND");
          return true;
        }
      );
    });
  });

  it("completes host-mediated flow through submitActivity", async () => {
    await withRestSdkServer(async (baseUrl) => {
      const client = new WorkflowClient({ baseUrl });
      const definition = hostMediatedLinearDefinition();
      const executionId = "sdk-submit-1";
      const input = {};

      const started = await client.start({
        definition,
        executionId,
        input,
        activityExecutionMode: "host_mediated",
      });
      assert.equal(started.status, "awaiting_activity");
      assert.equal(started.node_id, "work");

      const submitted = await client.submitActivity({
        executionId,
        definition,
        input,
        nodeId: "work",
        outcome: { ok: true, result: { out: "from-sdk" } },
      });
      assert.equal(submitted.status, "completed");
      assert.equal(submitted.result, "from-sdk");
    });
  });
});

describe("WorkflowClient port transport", () => {
  it("runs linear workflow without HTTP", async () => {
    const store = new MemoryExecutionHistoryStore();
    const port = createWorkflowApplicationPort({ store });
    const client = WorkflowClient.fromPort(port);
    const definition = minimalValidWorkflowDefinition("sdk-port-linear");

    const started = await client.start({
      definition,
      executionId: "sdk-port-1",
      input: {},
    });
    assert.equal(started.execution_id, "sdk-port-1");
    assert.equal(started.status, "completed");

    const status = await client.getStatus({ execution_id: "sdk-port-1" });
    assert.equal(status.phase, "completed");
  });

  it("maps stale resume to INVALID_RESUME_PAYLOAD", async () => {
    const store = new MemoryExecutionHistoryStore();
    const port = createWorkflowApplicationPort({ store });
    const client = WorkflowClient.fromPort(port);
    const definition = minimalValidWorkflowDefinition("sdk-port-stale");

    await client.start({
      definition,
      executionId: "sdk-port-stale",
      input: {},
    });

    await assert.rejects(
      () =>
        client.resume({
          executionId: "sdk-port-stale",
          definition,
          resumePayload: { intent: "billing" },
        }),
      (error) => {
        assert.ok(error instanceof SdkError);
        assert.equal(error.code, "INVALID_RESUME_PAYLOAD");
        return true;
      }
    );
  });
});
