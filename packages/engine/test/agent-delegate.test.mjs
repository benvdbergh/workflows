import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { findWorkflowRepoRoot, validateWorkflowDefinition } from "../src/validate.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { runGraphWorkflow } from "../src/orchestrator/workflow-graph-walker.mjs";
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
});
