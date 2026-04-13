import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createMcpWorkflowToolHandlers } from "../src/adapters/mcp/workflow-tools.mjs";
import { createWorkflowApplicationPort } from "../src/application/workflow-application-port.mjs";
import { runPocWorkflow } from "../src/orchestrator/poc-runner.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { findWorkflowRepoRoot } from "../src/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadLighthouse() {
  const root = findWorkflowRepoRoot(__dirname);
  const fixturePath = path.join(root, "examples", "lighthouse-customer-routing.workflow.json");
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}

describe("MCP workflow adapter tool handlers", () => {
  it("workflow_start returns stable execution identity and follow-up metadata", async () => {
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

  it("workflow_start surfaces validation failures as structured adapter errors", async () => {
    const handlers = createMcpWorkflowToolHandlers({
      async startWorkflow() {
        throw new Error("not used");
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
    });

    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, "VALIDATION_ERROR");
  });

  it("workflow_status deterministically projects interrupted phase and cursor from persisted history", async () => {
    const definition = loadLighthouse();
    const store = new MemoryExecutionHistoryStore();
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store }));

    const started = await handlers.workflow_start({
      execution_id: "exec-status-1",
      definition,
      input: { ticket_text: "unclear" },
    });
    assert.equal(started.isError, undefined);
    assert.equal(started.structuredContent.status, "interrupted");

    const response = await handlers.workflow_status({
      execution_id: "exec-status-1",
    });

    assert.equal(response.isError, undefined);
    assert.equal(response.structuredContent.execution_id, "exec-status-1");
    assert.equal(response.structuredContent.phase, "interrupted");
    assert.equal(response.structuredContent.current_node_id, "human_review");
    assert.equal(response.structuredContent.last_error, undefined);
  });

  it("workflow_status translates missing execution into structured adapter error", async () => {
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store: new MemoryExecutionHistoryStore() }));

    const response = await handlers.workflow_status({
      execution_id: "missing-exec",
    });

    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, "EXECUTION_NOT_FOUND");
  });

  it("workflow_resume completes interrupted executions with valid payloads", async () => {
    const definition = loadLighthouse();
    const store = new MemoryExecutionHistoryStore();
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store }));

    const started = await handlers.workflow_start({
      execution_id: "exec-resume-happy",
      definition,
      input: { ticket_text: "unclear" },
    });
    assert.equal(started.structuredContent.status, "interrupted");

    const response = await handlers.workflow_resume({
      execution_id: "exec-resume-happy",
      definition,
      resume_payload: { intent: "billing" },
    });

    assert.equal(response.isError, undefined);
    assert.equal(response.structuredContent.execution_id, "exec-resume-happy");
    assert.equal(response.structuredContent.status, "completed");
    assert.deepEqual(response.structuredContent.result, { intent: "billing", confidence: null });
  });

  it("workflow_resume maps invalid resume payload engine failures to INVALID_RESUME_PAYLOAD", async () => {
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

  it("workflow_resume returns deterministic failure for stale/non-interrupt resume attempts", async () => {
    const definition = loadLighthouse();
    const store = new MemoryExecutionHistoryStore();
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store }));

    const run = await runPocWorkflow({
      definition,
      input: { ticket_text: "clear technical issue" },
      executionId: "exec-resume-stale",
      store,
      stubActivityOutputs: {
        classify: { intent: "technical", confidence: 0.9 },
        search_kb: { snippets: [] },
      },
    });
    assert.equal(run.status, "completed");

    const response = await handlers.workflow_resume({
      execution_id: "exec-resume-stale",
      definition,
      resume_payload: { intent: "billing" },
    });

    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, "INVALID_RESUME_PAYLOAD");
    assert.match(response.structuredContent.error.message, /cannot resume/i);
  });

  it("workflow_start guards against uncaught exceptions with INTERNAL_ERROR result", async () => {
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
