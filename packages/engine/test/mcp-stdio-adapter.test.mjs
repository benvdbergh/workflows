import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createMcpWorkflowToolHandlers } from "../src/adapters/mcp/workflow-tools.mjs";
import { createWorkflowApplicationPort } from "../src/application/workflow-application-port.mjs";
import { StubActivityExecutor } from "../src/orchestrator/activity-executor.mjs";
import { mintDelegateCorrelationId } from "../src/orchestrator/delegate-executor.mjs";
import { runGraphWorkflow } from "../src/orchestrator/workflow-graph-walker.mjs";
import { mintChildExecutionId } from "../src/orchestrator/subworkflow-runtime.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { findWorkflowRepoRoot } from "../src/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Minimal valid workflow: start → tool_call → end (host_mediated tests). */
/** Minimal schema-valid definition for mock port tests (transport AJV passes). */
function minimalValidWorkflowDefinition() {
  return {
    document: {
      schema: "https://agent-workflow.dev/schemas/workflow-definition.json",
      name: "mcp-mock",
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

function loadRepoJson(relPath) {
  const root = findWorkflowRepoRoot(__dirname);
  return JSON.parse(readFileSync(path.join(root, relPath), "utf8"));
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
      signalWorkflow: unusedPortFn("signalWorkflow"),
      cancelWorkflow: unusedPortFn("cancelWorkflow"),
      listWorkflowExecutions: unusedPortFn("listWorkflowExecutions"),
    });

    const response = await handlers.workflow_start({
      execution_id: "exec-123",
      definition: minimalValidWorkflowDefinition(),
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
      signalWorkflow: unusedPortFn("signalWorkflow"),
      cancelWorkflow: unusedPortFn("cancelWorkflow"),
      listWorkflowExecutions: unusedPortFn("listWorkflowExecutions"),
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

  it("workflow_status projects delegate_correlation_id after agent_delegate completion", async () => {
    const definition = loadRepoJson("examples/conformance-agent-delegate-linear.workflow.json");
    const store = new MemoryExecutionHistoryStore();
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store }));
    const executionId = "mcp-status-delegate-1";

    const started = await handlers.workflow_start({
      execution_id: executionId,
      definition,
      input: { task: "ship correlation on status" },
    });
    assert.equal(started.structuredContent.status, "completed");

    const response = await handlers.workflow_status({ execution_id: executionId });
    assert.equal(response.isError, undefined);
    assert.equal(response.structuredContent.phase, "completed");
    assert.equal(
      response.structuredContent.delegate_correlation_id,
      mintDelegateCorrelationId(executionId, "implement")
    );
  });

  it("workflow_status projects child and parent execution ids after subworkflow completion", async () => {
    const definition = loadRepoJson("examples/conformance-subworkflow-parent.workflow.json");
    const store = new MemoryExecutionHistoryStore();
    const handlers = createMcpWorkflowToolHandlers(
      createWorkflowApplicationPort({
        store,
        activityExecutor: new StubActivityExecutor({ run_tests: { tests_passed: true } }),
      })
    );
    const executionId = "mcp-status-subworkflow-1";

    const started = await handlers.workflow_start({
      execution_id: executionId,
      definition,
      input: { repo: "acme/widget" },
    });
    assert.equal(started.structuredContent.status, "completed");

    const response = await handlers.workflow_status({ execution_id: executionId });
    assert.equal(response.isError, undefined);
    assert.equal(response.structuredContent.phase, "completed");
    assert.equal(
      response.structuredContent.child_execution_id,
      mintChildExecutionId(executionId, "verify")
    );
    assert.equal(response.structuredContent.parent_execution_id, executionId);
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
      signalWorkflow: unusedPortFn("signalWorkflow"),
      cancelWorkflow: unusedPortFn("cancelWorkflow"),
      listWorkflowExecutions: unusedPortFn("listWorkflowExecutions"),
      async resumeWorkflow() {
        return {
          executionId: "exec-55",
          status: "failed",
          code: "INVALID_RESUME_PAYLOAD",
          error: "Resume payload invalid vs resume_schema: /intent is required",
        };
      },
    });

    const response = await handlers.workflow_resume({
      execution_id: "exec-55",
      definition: minimalValidWorkflowDefinition(),
      resume_payload: {},
    });

    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, "INVALID_RESUME_PAYLOAD");
  });

  it("workflow_resume maps unknown typed resume failures to ENGINE_FAILURE", async () => {
    const handlers = createMcpWorkflowToolHandlers({
      startWorkflow: unusedPortFn("startWorkflow"),
      getWorkflowStatus: unusedPortFn("getWorkflowStatus"),
      submitWorkflowActivity: unusedPortFn("submitWorkflowActivity"),
      signalWorkflow: unusedPortFn("signalWorkflow"),
      cancelWorkflow: unusedPortFn("cancelWorkflow"),
      listWorkflowExecutions: unusedPortFn("listWorkflowExecutions"),
      async resumeWorkflow() {
        return {
          executionId: "exec-unknown",
          status: "failed",
          code: "UNEXPECTED_FAILURE",
          error: "unexpected runtime failure",
        };
      },
    });

    const response = await handlers.workflow_resume({
      execution_id: "exec-unknown",
      definition: minimalValidWorkflowDefinition(),
      resume_payload: {},
    });

    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, "ENGINE_FAILURE");
  });

  it("workflow_resume returns deterministic failure for stale/non-interrupt resume attempts", async () => {
    const definition = loadLighthouse();
    const store = new MemoryExecutionHistoryStore();
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store }));

    const run = await runGraphWorkflow({
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
      signalWorkflow: unusedPortFn("signalWorkflow"),
      cancelWorkflow: unusedPortFn("cancelWorkflow"),
      listWorkflowExecutions: unusedPortFn("listWorkflowExecutions"),
    });

    const response = await handlers.workflow_start({
      execution_id: "exec-x",
      definition: minimalValidWorkflowDefinition(),
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

  function signalWaitDefinition() {
    const root = findWorkflowRepoRoot(__dirname);
    return JSON.parse(
      readFileSync(path.join(root, "examples", "conformance-signal-wait.workflow.json"), "utf8")
    );
  }

  it("workflow_signal completes signal wait run", async () => {
    const definition = signalWaitDefinition();
    const store = new MemoryExecutionHistoryStore();
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store }));
    const executionId = "exec-mcp-signal-ok";
    const input = {};

    const started = await handlers.workflow_start({
      execution_id: executionId,
      definition,
      input,
    });
    assert.equal(started.structuredContent.status, "awaiting_signal");
    assert.equal(started.structuredContent.node_id, "await_approval");
    assert.equal(started.structuredContent.signal_name, "approved");

    const signaled = await handlers.workflow_signal({
      execution_id: executionId,
      definition,
      input,
      signal_name: "approved",
      payload: { approved_by: "alice" },
    });
    assert.equal(signaled.isError, undefined);
    assert.equal(signaled.structuredContent.status, "completed");
    assert.equal(signaled.structuredContent.result, "alice");
  });

  it("workflow_signal maps unknown execution to EXECUTION_NOT_FOUND", async () => {
    const definition = signalWaitDefinition();
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store: new MemoryExecutionHistoryStore() }));

    const response = await handlers.workflow_signal({
      execution_id: "no-such-exec",
      definition,
      input: {},
      signal_name: "approved",
    });

    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, "EXECUTION_NOT_FOUND");
  });

  it("workflow_cancel cooperatively cancels awaiting_signal run", async () => {
    const definition = signalWaitDefinition();
    const store = new MemoryExecutionHistoryStore();
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store }));
    const executionId = "exec-mcp-cancel-ok";
    const input = {};

    const started = await handlers.workflow_start({
      execution_id: executionId,
      definition,
      input,
    });
    assert.equal(started.structuredContent.status, "awaiting_signal");

    const cancelled = await handlers.workflow_cancel({
      execution_id: executionId,
      reason: "operator abort",
    });
    assert.equal(cancelled.isError, undefined);
    assert.equal(cancelled.structuredContent.status, "cancelled");
    assert.equal(cancelled.structuredContent.reason, "operator abort");

    const status = await handlers.workflow_status({ execution_id: executionId });
    assert.equal(status.structuredContent.phase, "cancelled");
    assert.equal(status.structuredContent.last_error, "operator abort");
  });

  it("workflow_cancel maps terminal execution to CANCEL_NOT_ALLOWED", async () => {
    const definition = signalWaitDefinition();
    const store = new MemoryExecutionHistoryStore();
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store }));
    const executionId = "exec-mcp-cancel-terminal";
    const input = {};

    await handlers.workflow_start({ execution_id: executionId, definition, input });
    await handlers.workflow_signal({
      execution_id: executionId,
      definition,
      input,
      signal_name: "approved",
    });

    const response = await handlers.workflow_cancel({ execution_id: executionId });
    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, "CANCEL_NOT_ALLOWED");
  });

  it("workflow_list filters by projected phase", async () => {
    const definition = signalWaitDefinition();
    const store = new MemoryExecutionHistoryStore();
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store }));
    const input = {};

    await handlers.workflow_start({
      execution_id: "exec-list-awaiting",
      definition,
      input,
    });
    await handlers.workflow_start({
      execution_id: "exec-list-completed",
      definition,
      input,
    });
    await handlers.workflow_signal({
      execution_id: "exec-list-completed",
      definition,
      input,
      signal_name: "approved",
    });

    const awaitingOnly = await handlers.workflow_list({ phase: "awaiting_signal" });
    assert.equal(awaitingOnly.isError, undefined);
    assert.equal(awaitingOnly.structuredContent.executions.length, 1);
    assert.equal(awaitingOnly.structuredContent.executions[0].execution_id, "exec-list-awaiting");
    assert.equal(awaitingOnly.structuredContent.executions[0].phase, "awaiting_signal");

    const completedOnly = await handlers.workflow_list({ phase: "completed" });
    assert.equal(completedOnly.structuredContent.executions.length, 1);
    assert.equal(completedOnly.structuredContent.executions[0].execution_id, "exec-list-completed");
    assert.equal(completedOnly.structuredContent.executions[0].definition_name, definition.document.name);
  });

  it("workflow_list paginates with cursor", async () => {
    const store = new MemoryExecutionHistoryStore();
    const handlers = createMcpWorkflowToolHandlers(createWorkflowApplicationPort({ store }));
    const definition = minimalValidWorkflowDefinition();

    for (let i = 0; i < 3; i += 1) {
      await handlers.workflow_start({
        execution_id: `exec-page-${i}`,
        definition,
        input: {},
      });
    }

    const page1 = await handlers.workflow_list({ limit: 2 });
    assert.equal(page1.structuredContent.executions.length, 2);
    assert.equal(typeof page1.structuredContent.next_cursor, "string");

    const page2 = await handlers.workflow_list({
      limit: 2,
      cursor: page1.structuredContent.next_cursor,
    });
    assert.equal(page2.structuredContent.executions.length, 1);
    assert.equal(page2.structuredContent.next_cursor, undefined);
  });
});
