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

/** Minimal valid POC workflow: start → tool_call → end (host_mediated tests). */
function hostMediatedLinearDefinition() {
  return {
    document: {
      schema: "https://example.org/agent-workflow/poc/v1/workflow-definition",
      name: "mcp-host-med-linear",
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

function unusedPortFn(name) {
  return async () => {
    throw new Error(`not used: ${name}`);
  };
}

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
      getWorkflowStatus: unusedPortFn("getWorkflowStatus"),
      resumeWorkflow: unusedPortFn("resumeWorkflow"),
      submitWorkflowActivity: unusedPortFn("submitWorkflowActivity"),
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
      startWorkflow: unusedPortFn("startWorkflow"),
      getWorkflowStatus: unusedPortFn("getWorkflowStatus"),
      resumeWorkflow: unusedPortFn("resumeWorkflow"),
      submitWorkflowActivity: unusedPortFn("submitWorkflowActivity"),
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
      startWorkflow: unusedPortFn("startWorkflow"),
      getWorkflowStatus: unusedPortFn("getWorkflowStatus"),
      submitWorkflowActivity: unusedPortFn("submitWorkflowActivity"),
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
      getWorkflowStatus: unusedPortFn("getWorkflowStatus"),
      resumeWorkflow: unusedPortFn("resumeWorkflow"),
      submitWorkflowActivity: unusedPortFn("submitWorkflowActivity"),
    });

    const response = await handlers.workflow_start({
      execution_id: "exec-x",
      definition: { nodes: [], edges: [] },
      input: {},
    });

    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, "INTERNAL_ERROR");
  });

  it("workflow_submit_activity completes host-mediated run with matching node and outcome", async () => {
    const definition = hostMediatedLinearDefinition();
    const store = new MemoryExecutionHistoryStore();
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store }));
    const executionId = "exec-mcp-submit-ok";
    const input = {};

    const started = await handlers.workflow_start({
      execution_id: executionId,
      definition,
      input,
      activity_execution_mode: "host_mediated",
    });
    assert.equal(started.isError, undefined);
    assert.equal(started.structuredContent.status, "awaiting_activity");
    assert.equal(started.structuredContent.node_id, "work");

    const submitted = await handlers.workflow_submit_activity({
      execution_id: executionId,
      definition,
      input,
      node_id: "work",
      outcome: { ok: true, result: { out: "from-host" } },
    });
    assert.equal(submitted.isError, undefined);
    assert.equal(submitted.structuredContent.status, "completed");
    assert.equal(submitted.structuredContent.result, "from-host");
  });

  it("workflow_submit_activity maps stale submit to ACTIVITY_SUBMIT_NOT_AWAITING", async () => {
    const definition = hostMediatedLinearDefinition();
    const store = new MemoryExecutionHistoryStore();
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store }));

    const response = await handlers.workflow_submit_activity({
      execution_id: "no-such-exec",
      definition,
      input: {},
      node_id: "work",
      outcome: { ok: true, result: { out: "x" } },
    });

    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, "ACTIVITY_SUBMIT_NOT_AWAITING");
  });

  it("workflow_submit_activity maps wrong node id to ACTIVITY_SUBMIT_NODE_MISMATCH", async () => {
    const definition = hostMediatedLinearDefinition();
    const store = new MemoryExecutionHistoryStore();
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store }));
    const executionId = "exec-mcp-submit-node";
    const input = {};

    const started = await handlers.workflow_start({
      execution_id: executionId,
      definition,
      input,
      activity_execution_mode: "host_mediated",
    });
    assert.equal(started.structuredContent.status, "awaiting_activity");

    const response = await handlers.workflow_submit_activity({
      execution_id: executionId,
      definition,
      input,
      node_id: "wrong",
      outcome: { ok: true, result: { out: "x" } },
    });

    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, "ACTIVITY_SUBMIT_NODE_MISMATCH");
  });

  it("workflow_submit_activity surfaces argument validation as VALIDATION_ERROR", async () => {
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store: new MemoryExecutionHistoryStore() }));

    const response = await handlers.workflow_submit_activity({
      execution_id: "e1",
      definition: { nodes: [], edges: [] },
      input: {},
      node_id: "n1",
    });

    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, "VALIDATION_ERROR");
  });
});
