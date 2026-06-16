import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { findWorkflowRepoRoot, validateWorkflowDefinition } from "../src/validate.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { runGraphWorkflow, resumeGraphWorkflow, submitActivityOutcome } from "../src/orchestrator/workflow-graph-walker.mjs";
import { hydrateReplayContext } from "../src/orchestrator/replay-loader.mjs";
import {
  RejectingDelegateExecutor,
  mintDelegateCorrelationId,
} from "../src/orchestrator/delegate-executor.mjs";
import {
  clearWorkflowRefs,
  registerWorkflowRef,
} from "../src/orchestrator/workflow-ref-resolver.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findWorkflowRepoRoot(__dirname);

function loadJson(rel) {
  return JSON.parse(readFileSync(path.join(repoRoot, rel), "utf8"));
}

describe("agent_delegate", () => {
  it("validates agent_delegate node and rejects invalid protocol in schema", () => {
    const linear = loadJson("examples/conformance-agent-delegate-linear.workflow.json");
    assert.equal(validateWorkflowDefinition(linear).ok, true);

    const bad = loadJson("examples/fixtures.invalid/agent-delegate-invalid-protocol.workflow.json");
    const badResult = validateWorkflowDefinition(bad);
    assert.equal(badResult.ok, false);
    assert.ok(
      badResult.errors?.some(
        (e) => e.instancePath?.includes("protocol") && (e.keyword === "enum" || e.message?.includes("enum"))
      )
    );
  });

  it("runs mock A2A delegate and emits correlation fields on activity events", async () => {
    const definition = loadJson("examples/conformance-agent-delegate-linear.workflow.json");
    const store = new MemoryExecutionHistoryStore();
    const executionId = "test-delegate-happy";
    const out = await runGraphWorkflow({
      definition,
      input: { task: "implement feature X" },
      executionId,
      store,
    });

    assert.equal(out.status, "completed");
    assert.equal(typeof out.finalState?.patch, "string");

    const rows = store.listByExecution(executionId);
    const requested = rows.find((r) => r.name === "ActivityRequested" && r.payload?.nodeId === "implement");
    const completed = rows.find((r) => r.name === "ActivityCompleted" && r.payload?.nodeId === "implement");
    assert.ok(requested);
    assert.equal(requested.payload?.nodeType, "agent_delegate");
    assert.equal(requested.payload?.agentId, "coder");
    assert.equal(requested.payload?.protocol, "a2a");
    assert.equal(
      requested.payload?.delegateCorrelationId,
      mintDelegateCorrelationId(executionId, "implement")
    );
    assert.ok(completed);
    assert.equal(completed.payload?.delegateCorrelationId, requested.payload?.delegateCorrelationId);
    assert.equal(typeof completed.payload?.externalTaskId, "string");
  });

  it("host_mediated yields awaiting_activity with delegate context without invoking delegate port", async () => {
    const definition = loadJson("examples/conformance-agent-delegate-linear.workflow.json");
    const store = new MemoryExecutionHistoryStore();
    const executionId = "test-delegate-host-mediated";
    const correlationId = mintDelegateCorrelationId(executionId, "implement");

    const out = await runGraphWorkflow({
      definition,
      input: { task: "host delegate task" },
      executionId,
      store,
      activityExecutionMode: "host_mediated",
      delegateExecutor: new RejectingDelegateExecutor(),
    });

    assert.equal(out.status, "awaiting_activity");
    assert.equal(out.nodeId, "implement");
    assert.equal(out.agentId, "coder");
    assert.equal(out.protocol, "a2a");
    assert.equal(out.delegateCorrelationId, correlationId);
    assert.deepEqual(out.delegateInput, { task: "host delegate task" });

    const rows = store.listByExecution(executionId);
    const requested = rows.find((r) => r.name === "ActivityRequested" && r.payload?.nodeId === "implement");
    assert.ok(requested);
    assert.deepEqual(requested.payload?.delegateInput, { task: "host delegate task" });
    assert.equal(requested.payload?.delegateCorrelationId, correlationId);
  });

  it("submitActivityOutcome completes host_mediated agent_delegate with correlation validation", async () => {
    const definition = loadJson("examples/conformance-agent-delegate-linear.workflow.json");
    const store = new MemoryExecutionHistoryStore();
    const executionId = "test-delegate-host-submit";
    const correlationId = mintDelegateCorrelationId(executionId, "implement");

    const pending = await runGraphWorkflow({
      definition,
      input: { task: "submit path" },
      executionId,
      store,
      activityExecutionMode: "host_mediated",
      delegateExecutor: new RejectingDelegateExecutor(),
    });
    assert.equal(pending.status, "awaiting_activity");

    const badCorrelation = await submitActivityOutcome({
      definition,
      executionId,
      store,
      input: { task: "submit path" },
      nodeId: "implement",
      outcome: {
        ok: true,
        delegateCorrelationId: "wrong-correlation",
        result: { patch: "// bad" },
      },
    });
    assert.equal(badCorrelation.status, "failed");
    assert.equal(badCorrelation.code, "SUBMIT_VALIDATION_ERROR");

    const done = await submitActivityOutcome({
      definition,
      executionId,
      store,
      input: { task: "submit path" },
      nodeId: "implement",
      outcome: {
        ok: true,
        delegateCorrelationId: correlationId,
        externalTaskId: "a2a-task-host-submit",
        result: { patch: "// host patch", delegate_status: "completed" },
      },
      activityExecutionMode: "host_mediated",
    });

    assert.equal(done.status, "completed");
    assert.equal(done.finalState?.patch, "// host patch");

    const completed = store
      .listByExecution(executionId)
      .find((r) => r.name === "ActivityCompleted" && r.payload?.nodeId === "implement" && r.payload?.replayed !== true);
    assert.ok(completed);
    assert.equal(completed.payload?.delegateCorrelationId, correlationId);
    assert.equal(completed.payload?.externalTaskId, "a2a-task-host-submit");
  });

  it("replay with ActivityCompleted prefix does not invoke delegate port", async () => {
    const definition = loadJson("examples/conformance-agent-delegate-linear.workflow.json");
    const store = new MemoryExecutionHistoryStore();
    const executionId = "test-delegate-replay";
    const correlationId = mintDelegateCorrelationId(executionId, "implement");

    store.append(executionId, {
      kind: "event",
      name: "ExecutionStarted",
      payload: { executionId, workflowName: "conformance-agent-delegate-linear", inputKeys: ["task"] },
    });
    store.append(executionId, {
      kind: "command",
      name: "ScheduleNode",
      payload: { executionId, nodeId: "start" },
    });
    store.append(executionId, {
      kind: "event",
      name: "NodeScheduled",
      payload: { executionId, nodeId: "start" },
    });
    store.append(executionId, {
      kind: "command",
      name: "CompleteNode",
      payload: { executionId, nodeId: "start", output: {} },
    });
    store.append(executionId, {
      kind: "event",
      name: "StateUpdated",
      payload: { executionId, nodeId: "start", state: { task: "replay task" } },
    });
    store.append(executionId, {
      kind: "command",
      name: "ScheduleNode",
      payload: { executionId, nodeId: "implement" },
    });
    store.append(executionId, {
      kind: "event",
      name: "NodeScheduled",
      payload: { executionId, nodeId: "implement" },
    });
    store.append(executionId, {
      kind: "event",
      name: "ActivityRequested",
      payload: {
        executionId,
        nodeId: "implement",
        nodeType: "agent_delegate",
        agentId: "coder",
        protocol: "a2a",
        delegateCorrelationId: correlationId,
      },
    });
    store.append(executionId, {
      kind: "event",
      name: "ActivityCompleted",
      payload: {
        executionId,
        nodeId: "implement",
        result: { patch: "// from history", delegate_status: "completed" },
        delegateCorrelationId: correlationId,
        externalTaskId: "a2a-task-historical",
      },
    });

    const replay = hydrateReplayContext({ executionId, store });
    const stored = replay.replayResults.get("implement");
    assert.ok(stored);
    assert.equal(stored.__delegateCorrelationId, correlationId);

    const out = await runGraphWorkflow({
      definition,
      input: { task: "replay task" },
      executionId,
      store,
      delegateExecutor: new RejectingDelegateExecutor(),
      assertNoDelegateExecutorInvocation: true,
    });

    assert.equal(out.status, "completed");
    assert.equal(out.finalState?.patch, "// from history");

    const rows = store.listByExecution(executionId);
    const requestedForImplement = rows.filter(
      (r) => r.name === "ActivityRequested" && r.payload?.nodeId === "implement"
    );
    assert.equal(
      requestedForImplement.length,
      1,
      "replay must not append a second ActivityRequested for agent_delegate"
    );
    assert.ok(
      rows.some(
        (r) =>
          r.kind === "command" &&
          r.name === "CompleteNode" &&
          r.payload?.nodeId === "implement"
      ),
      "continuation must CompleteNode after historical ActivityCompleted"
    );
  });

  it("r3 multi-agent coding workflow runs implement as agent_delegate then subworkflow", async () => {
    clearWorkflowRefs();
    const parent = loadJson("examples/r3-multi-agent-coding.workflow.json");
    const child = loadJson("examples/r3-unit-tests-child.workflow.json");
    registerWorkflowRef("urn:awp:wf:unit-tests", child);
    assert.equal(validateWorkflowDefinition(parent).ok, true);

    const store = new MemoryExecutionHistoryStore();
    const executionId = "test-r3-multi-agent";
    const run = await runGraphWorkflow({
      definition: parent,
      input: { task: "fix bug", repo: "acme/app" },
      executionId,
      store,
      stubActivityOutputs: {
        run_tests: { tests_passed: true },
      },
    });

    assert.equal(run.status, "interrupted");
    assert.equal(typeof run.state?.patch, "string");

    const rows = store.listByExecution(executionId);
    assert.ok(rows.some((r) => r.name === "ActivityCompleted" && r.payload?.nodeId === "implement"));
    assert.ok(rows.some((r) => r.name === "SubworkflowCompleted" && r.payload?.nodeId === "verify"));
  });

  it("resumeGraphWorkflow after r3 interrupt completes review → end", async () => {
    clearWorkflowRefs();
    const parent = loadJson("examples/r3-multi-agent-coding.workflow.json");
    const child = loadJson("examples/r3-unit-tests-child.workflow.json");
    registerWorkflowRef("urn:awp:wf:unit-tests", child);

    const store = new MemoryExecutionHistoryStore();
    const executionId = "test-r3-resume-review";
    const first = await runGraphWorkflow({
      definition: parent,
      input: { task: "fix bug", repo: "acme/app" },
      executionId,
      store,
      stubActivityOutputs: {
        run_tests: { tests_passed: true },
      },
    });

    assert.equal(first.status, "interrupted");
    assert.equal(first.nodeId, "review");

    const resumed = await resumeGraphWorkflow({
      definition: parent,
      executionId,
      store,
      resumePayload: { approve: true },
    });

    assert.equal(resumed.status, "completed");
    assert.equal(resumed.finalState?.approve, true);

    const rows = store.listByExecution(executionId);
    assert.ok(rows.some((r) => r.name === "InterruptResumed" && r.payload?.nodeId === "review"));
    assert.equal(rows.at(-1)?.name, "ExecutionCompleted");
  });

  it("resumeGraphWorkflow forwards custom delegateExecutor on post-interrupt delegate", async () => {
    /** @type {object} */
    const definition = {
      document: {
        schema: "https://agent-workflow.dev/schemas/workflow-definition.json",
        name: "delegate-after-interrupt",
        version: "1.0.0",
      },
      state_schema: {
        type: "object",
        properties: {
          task: { type: "string" },
          patch: { type: "string" },
          approve: { type: "boolean" },
        },
      },
      nodes: [
        { id: "start", type: "start" },
        {
          id: "review",
          type: "interrupt",
          config: {
            prompt: "Proceed with delegate?",
            resume_schema: {
              type: "object",
              properties: { approve: { type: "boolean" } },
              required: ["approve"],
            },
          },
        },
        {
          id: "implement",
          type: "agent_delegate",
          config: {
            agent_id: "coder",
            protocol: "a2a",
            input_mapping: { task: "${ .task }" },
          },
        },
        { id: "end", type: "end" },
      ],
      edges: [
        { source: "__start__", target: "start" },
        { source: "start", target: "review" },
        { source: "review", target: "implement" },
        { source: "implement", target: "end" },
      ],
    };
    assert.equal(validateWorkflowDefinition(definition).ok, true);

    const store = new MemoryExecutionHistoryStore();
    const executionId = "test-resume-custom-delegate";
    const first = await runGraphWorkflow({
      definition,
      input: { task: "custom delegate path" },
      executionId,
      store,
    });
    assert.equal(first.status, "interrupted");
    assert.equal(first.nodeId, "review");

    let delegateInvoked = false;
    /** @type {import("../src/orchestrator/delegate-executor.mjs").DelegateExecutor} */
    const customDelegate = {
      async executeDelegate(ctx) {
        delegateInvoked = true;
        return {
          ok: true,
          output: { patch: "// custom executor patch" },
          delegateCorrelationId: mintDelegateCorrelationId(ctx.executionId, ctx.node.id),
          externalTaskId: "custom-ext-1",
        };
      },
    };

    const resumed = await resumeGraphWorkflow({
      definition,
      executionId,
      store,
      resumePayload: { approve: true },
      delegateExecutor: customDelegate,
    });

    assert.equal(resumed.status, "completed");
    assert.equal(delegateInvoked, true);
    assert.equal(resumed.finalState?.patch, "// custom executor patch");
  });
});
