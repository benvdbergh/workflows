import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMcpWorkflowToolHandlers } from "../src/adapters/mcp/workflow-tools.mjs";
import { createWorkflowApplicationPort } from "../src/application/workflow-application-port.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";

describe("MCP workflow adapter tool handlers", () => {
  it("maps workflow_start request and response with execution identity", async () => {
    const handlers = createMcpWorkflowToolHandlers({
      async startWorkflow(request) {
        return {
          executionId: request.executionId ?? "exec-generated",
          status: "interrupted",
          finalState: { ticket_text: "help" },
          nodeId: "human_review",
        };
      },
      async getWorkflowStatus() {
        throw new Error("not used");
      },
      async resumeWorkflow() {
        throw new Error("not used");
      },
    });

    const response = await handlers.workflow_start({
      execution_id: "exec-123",
      definition: { nodes: [], edges: [] },
      input: { ticket_text: "help" },
    });

    assert.equal(response.isError, undefined);
    assert.equal(response.structuredContent.execution_id, "exec-123");
    assert.equal(response.structuredContent.status, "interrupted");
    assert.equal(response.structuredContent.node_id, "human_review");
  });

  it("translates missing execution into structured adapter error", async () => {
    const port = createWorkflowApplicationPort({ store: new MemoryExecutionHistoryStore() });
    const handlers = createMcpWorkflowToolHandlers(port);

    const response = await handlers.workflow_status({
      execution_id: "missing-exec",
    });

    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, "EXECUTION_NOT_FOUND");
  });

  it("maps invalid resume payload engine failures to INVALID_RESUME_PAYLOAD", async () => {
    const handlers = createMcpWorkflowToolHandlers({
      async startWorkflow() {
        throw new Error("not used");
      },
      async getWorkflowStatus() {
        throw new Error("not used");
      },
      async resumeWorkflow() {
        return {
          executionId: "exec-55",
          status: "failed",
          error: "Resume payload invalid vs resume_schema: /intent is required",
        };
      },
    });

    const response = await handlers.workflow_resume({
      execution_id: "exec-55",
      definition: { nodes: [], edges: [] },
      resume_payload: {},
    });

    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, "INVALID_RESUME_PAYLOAD");
  });

  it("guards against uncaught exceptions with INTERNAL_ERROR result", async () => {
    const handlers = createMcpWorkflowToolHandlers({
      async startWorkflow() {
        throw new Error("boom");
      },
      async getWorkflowStatus() {
        throw new Error("not used");
      },
      async resumeWorkflow() {
        throw new Error("not used");
      },
    });

    const response = await handlers.workflow_start({
      execution_id: "exec-x",
      definition: { nodes: [], edges: [] },
      input: {},
    });

    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, "INTERNAL_ERROR");
  });
});
