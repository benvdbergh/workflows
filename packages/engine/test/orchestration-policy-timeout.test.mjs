import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { runGraphWorkflow } from "../src/orchestrator/workflow-graph-walker.mjs";
import {
  executeActivityWithTimeout,
  parseDurationMs,
  resolveNodeTimeoutMs,
} from "../src/orchestrator/orchestration-policy.mjs";
import { findWorkflowRepoRoot } from "../src/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadRetryConformanceWorkflow() {
  const root = findWorkflowRepoRoot(__dirname);
  const p = path.join(root, "examples", "conformance-retry-step.workflow.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

function workflowWithTimeout(timeout) {
  const definition = loadRetryConformanceWorkflow();
  definition.nodes = definition.nodes.map((n) => (n.id === "work" ? { ...n, timeout, retry: undefined } : n));
  return definition;
}

class DelayedExecutor {
  /**
   * @param {number} delayMs
   */
  constructor(delayMs) {
    this.delayMs = delayMs;
    this.invocationCount = 0;
  }

  async executeActivity() {
    this.invocationCount += 1;
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return { ok: true, output: { result: "ok" } };
  }
}

describe("orchestration-policy timeout", () => {
  it("resolveNodeTimeoutMs parses duration strings and returns undefined when absent", () => {
    assert.equal(resolveNodeTimeoutMs({}), undefined);
    assert.equal(resolveNodeTimeoutMs({ timeout: "  " }), undefined);
    assert.equal(resolveNodeTimeoutMs({ timeout: "500ms" }), 500);
    assert.equal(parseDurationMs("2s"), 2000);
  });

  it("executeActivityWithTimeout returns TIMEOUT when executor exceeds deadline", async () => {
    const executor = new DelayedExecutor(200);
    const result = await executeActivityWithTimeout(
      executor,
      { executionId: "e1", node: { id: "work", type: "step" }, state: {} },
      50
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "TIMEOUT");
      assert.match(result.error, /timed out/i);
    }
  });

  it("in_process: slow executor exceeds node timeout → TIMEOUT failure", async () => {
    const definition = workflowWithTimeout("50ms");
    const store = new MemoryExecutionHistoryStore();
    const executionId = "timeout-slow-fail";
    const executor = new DelayedExecutor(200);

    const out = await runGraphWorkflow({
      definition,
      input: {},
      executionId,
      store,
      activityExecutor: executor,
      activityExecutionMode: "in_process",
    });

    assert.equal(out.status, "failed");
    assert.equal(executor.invocationCount, 1);
    const failed = store
      .listByExecution(executionId)
      .find((r) => r.kind === "event" && r.name === "ActivityFailed" && r.payload?.nodeId === "work");
    assert.equal(failed?.payload?.code, "TIMEOUT");
  });

  it("in_process: fast executor within node timeout → success", async () => {
    const definition = workflowWithTimeout("200ms");
    const store = new MemoryExecutionHistoryStore();
    const executionId = "timeout-fast-ok";
    const executor = new DelayedExecutor(20);

    const out = await runGraphWorkflow({
      definition,
      input: {},
      executionId,
      store,
      activityExecutor: executor,
      activityExecutionMode: "in_process",
    });

    assert.equal(out.status, "completed");
    assert.equal(executor.invocationCount, 1);
    const completed = store
      .listByExecution(executionId)
      .find((r) => r.kind === "event" && r.name === "ActivityCompleted" && r.payload?.nodeId === "work");
    assert.ok(completed);
  });

  it("in_process: node without timeout does not impose walker deadline", async () => {
    const definition = loadRetryConformanceWorkflow();
    definition.nodes = definition.nodes.map((n) =>
      n.id === "work" ? { ...n, retry: undefined, timeout: undefined } : n
    );
    const store = new MemoryExecutionHistoryStore();
    const executionId = "timeout-absent";
    const executor = new DelayedExecutor(20);

    const out = await runGraphWorkflow({
      definition,
      input: {},
      executionId,
      store,
      activityExecutor: executor,
      activityExecutionMode: "in_process",
    });

    assert.equal(out.status, "completed");
    assert.equal(executor.invocationCount, 1);
  });

  it("host_mediated: ActivityRequested includes timeoutMs when node has timeout", async () => {
    const definition = workflowWithTimeout("30s");
    const store = new MemoryExecutionHistoryStore();
    const executionId = "timeout-host-mediated";

    const out = await runGraphWorkflow({
      definition,
      input: {},
      executionId,
      store,
      activityExecutionMode: "host_mediated",
    });

    assert.equal(out.status, "awaiting_activity");
    const requested = store
      .listByExecution(executionId)
      .find((r) => r.kind === "event" && r.name === "ActivityRequested" && r.payload?.nodeId === "work");
    assert.equal(requested?.payload?.timeoutMs, 30_000);
  });
});
