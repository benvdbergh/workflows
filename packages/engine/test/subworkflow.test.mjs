import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, beforeEach } from "node:test";
import { findWorkflowRepoRoot, validateWorkflowDefinition } from "../src/validate.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { runGraphWorkflow } from "../src/orchestrator/workflow-graph-walker.mjs";
import { hydrateReplayContext } from "../src/orchestrator/replay-loader.mjs";
import { mintChildExecutionId } from "../src/orchestrator/subworkflow-runtime.mjs";
import {
  clearWorkflowRefs,
  registerWorkflowRef,
} from "../src/orchestrator/workflow-ref-resolver.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findWorkflowRepoRoot(__dirname);

function loadJson(rel) {
  return JSON.parse(readFileSync(path.join(repoRoot, rel), "utf8"));
}

describe("subworkflow", () => {
  beforeEach(() => {
    clearWorkflowRefs();
  });

  it("runs parent with nested child execution and merges child state", async () => {
    const parent = loadJson("examples/conformance-subworkflow-parent.workflow.json");
    const child = loadJson("examples/r3-unit-tests-child.workflow.json");
    assert.equal(validateWorkflowDefinition(parent).ok, true);
    assert.equal(validateWorkflowDefinition(child).ok, true);

    registerWorkflowRef("urn:awp:wf:unit-tests", child);

    const store = new MemoryExecutionHistoryStore();
    const executionId = "test-subworkflow-happy";
    const out = await runGraphWorkflow({
      definition: parent,
      input: { repo: "acme/widget" },
      executionId,
      store,
      stubActivityOutputs: {
        run_tests: { tests_passed: true },
      },
    });

    assert.equal(out.status, "completed");
    assert.equal(out.finalState?.tests_passed, true);
    assert.equal(out.finalState?.done, true);

    const childId = mintChildExecutionId(executionId, "verify");
    const childRows = store.listByExecution(childId);
    assert.ok(childRows.some((r) => r.kind === "event" && r.name === "ExecutionCompleted"));

    const parentRows = store.listByExecution(executionId);
    assert.ok(parentRows.some((r) => r.name === "SubworkflowStarted"));
    assert.ok(parentRows.some((r) => r.name === "SubworkflowCompleted"));
    assert.ok(parentRows.some((r) => r.name === "StartSubworkflow"));
    assert.ok(parentRows.some((r) => r.name === "CompleteSubworkflow"));
  });

  it("fails parent when child workflow fails", async () => {
    const parent = loadJson("examples/conformance-subworkflow-parent.workflow.json");
    const child = loadJson("examples/r3-unit-tests-child.workflow.json");
    registerWorkflowRef("urn:awp:wf:unit-tests", child);

    /** @type {import("../src/orchestrator/activity-executor.mjs").ActivityExecutor} */
    const childFailingExecutor = {
      async executeActivity(ctx) {
        if (ctx.executionId.includes(":sub:")) {
          return { ok: false, error: "child activity failed" };
        }
        return { ok: true, output: {} };
      },
    };

    const store = new MemoryExecutionHistoryStore();
    const out = await runGraphWorkflow({
      definition: parent,
      input: { repo: "acme/widget" },
      executionId: "test-subworkflow-child-fail",
      store,
      activityExecutor: childFailingExecutor,
    });

    assert.equal(out.status, "failed");
    const rows = store.listByExecution("test-subworkflow-child-fail");
    assert.ok(rows.some((r) => r.name === "ExecutionFailed"));
  });

  it("replay hydrates SubworkflowCompleted and tail skips child invocation", async () => {
    const parent = loadJson("examples/conformance-subworkflow-parent.workflow.json");
    const child = loadJson("examples/r3-unit-tests-child.workflow.json");
    registerWorkflowRef("urn:awp:wf:unit-tests", child);

    const store = new MemoryExecutionHistoryStore();
    const executionId = "test-subworkflow-replay";
    const childExecutionId = mintChildExecutionId(executionId, "verify");

    store.append(executionId, {
      kind: "event",
      name: "ExecutionStarted",
      payload: { executionId, workflowName: "conformance-subworkflow-parent", inputKeys: ["repo"] },
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
      payload: { executionId, nodeId: "start", state: { repo: "acme/widget" } },
    });
    store.append(executionId, {
      kind: "command",
      name: "ScheduleNode",
      payload: { executionId, nodeId: "verify" },
    });
    store.append(executionId, {
      kind: "event",
      name: "NodeScheduled",
      payload: { executionId, nodeId: "verify" },
    });
    store.append(executionId, {
      kind: "command",
      name: "StartSubworkflow",
      payload: {
        executionId,
        nodeId: "verify",
        workflowRef: "urn:awp:wf:unit-tests",
        childExecutionId,
      },
    });
    store.append(executionId, {
      kind: "event",
      name: "SubworkflowStarted",
      payload: {
        executionId,
        nodeId: "verify",
        workflowRef: "urn:awp:wf:unit-tests",
        parentExecutionId: executionId,
        childExecutionId,
      },
    });
    store.append(executionId, {
      kind: "event",
      name: "SubworkflowCompleted",
      payload: {
        executionId,
        nodeId: "verify",
        workflowRef: "urn:awp:wf:unit-tests",
        parentExecutionId: executionId,
        childExecutionId,
        childFinalState: { repo: "acme/widget", tests_passed: true },
        mergedOutput: { repo: "acme/widget", tests_passed: true },
      },
    });

    const replay = hydrateReplayContext({ executionId, store });
    const verifyReplay = replay.replayResults.get("verify");
    assert.ok(verifyReplay);
    assert.equal(verifyReplay.childExecutionId, childExecutionId);

    const out = await runGraphWorkflow({
      definition: parent,
      input: { repo: "acme/widget" },
      executionId,
      store,
      assertNoSubworkflowInvocation: true,
      stubActivityOutputs: {
        run_tests: { tests_passed: false },
      },
    });

    assert.equal(out.status, "completed");
    assert.equal(out.finalState?.tests_passed, true);
    assert.equal(store.listByExecution(childExecutionId).length, 0);
  });
});
