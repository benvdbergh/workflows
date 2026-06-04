import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MCP_ADAPTER_ERROR } from "../src/adapters/mcp/errors.mjs";
import {
  assertMcpJsonWithinSizeLimit,
  MAX_MCP_WORKFLOW_JSON_BYTES,
  measureUtf8JsonBytes,
  validateWorkflowStartTransportPayload,
} from "../src/adapters/mcp/transport-validation.mjs";
import { createMcpWorkflowToolHandlers } from "../src/adapters/mcp/workflow-tools.mjs";
import { createWorkflowApplicationPort } from "../src/application/workflow-application-port.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";

describe("MCP transport validation", () => {
  it("rejects oversized JSON with VALIDATION_ERROR", () => {
    const huge = { blob: "x".repeat(MAX_MCP_WORKFLOW_JSON_BYTES) };
    assert.throws(
      () => assertMcpJsonWithinSizeLimit("definition", huge),
      (err) => err.code === MCP_ADAPTER_ERROR.VALIDATION_ERROR
    );
  });

  it("rejects invalid workflow definition at transport", () => {
    assert.throws(
      () =>
        validateWorkflowStartTransportPayload(
          { nodes: [], edges: [] },
          {}
        ),
      (err) => err.code === MCP_ADAPTER_ERROR.VALIDATION_ERROR
    );
  });

  it("workflow_start maps engine definition validation to VALIDATION_ERROR", async () => {
    const store = new MemoryExecutionHistoryStore();
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store }));
    const invalidDefinition = {
      document: {
        schema: "https://example.org/agent-workflow/poc/v1/workflow-definition",
        name: "bad",
        version: "1",
      },
      nodes: [{ id: "start", type: "start" }],
      edges: [],
    };
    const response = await handlers.workflow_start({
      execution_id: "exec-invalid-def",
      definition: invalidDefinition,
      input: {},
    });
    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, "VALIDATION_ERROR");
    assert.ok(measureUtf8JsonBytes(invalidDefinition) < MAX_MCP_WORKFLOW_JSON_BYTES);
  });
});
