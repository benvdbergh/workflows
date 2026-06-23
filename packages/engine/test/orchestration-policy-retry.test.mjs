import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { RetryCountingStepExecutor, RejectingActivityExecutor } from "../src/orchestrator/activity-executor.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { runGraphWorkflow, submitActivityOutcome } from "../src/orchestrator/workflow-graph-walker.mjs";
import {
  computeRetryBackoffMs,
  isNonRetryableError,
  parseDurationMs,
  resolveMaxAttempts,
  shouldRetryAfterFailure,
} from "../src/orchestrator/orchestration-policy.mjs";
import { findWorkflowRepoRoot } from "../src/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadRetryConformanceWorkflow() {
  const root = findWorkflowRepoRoot(__dirname);
  const p = path.join(root, "examples", "conformance-retry-step.workflow.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

describe("orchestration-policy retry", () => {
  it("parseDurationMs accepts ms/s/m/h suffixes", () => {
    assert.equal(parseDurationMs("500ms"), 500);
    assert.equal(parseDurationMs("2s"), 2000);
    assert.equal(parseDurationMs("1m"), 60_000);
    assert.equal(parseDurationMs("1h"), 3_600_000);
  });

  it("computeRetryBackoffMs applies linear minimum with cap", () => {
    const policy = { initial_interval: "1s", backoff_coefficient: 2, max_interval: "3s" };
    assert.equal(computeRetryBackoffMs(1, policy), 1000);
    assert.equal(computeRetryBackoffMs(2, policy), 2000);
    assert.equal(computeRetryBackoffMs(3, policy), 3000);
  });

  it("isNonRetryableError respects non_retryable_errors", () => {
    const policy = { non_retryable_errors: ["FATAL", "VALIDATION"] };
    assert.equal(isNonRetryableError("FATAL", policy), true);
    assert.equal(isNonRetryableError("TRANSIENT", policy), false);
  });

  it("resolveMaxAttempts defaults to 1 without retry policy", () => {
    assert.equal(resolveMaxAttempts({}), 1);
    assert.equal(resolveMaxAttempts({ retry: { max_attempts: 3 } }), 3);
  });

  it("shouldRetryAfterFailure stops at max_attempts and non_retryable_errors", () => {
    const policy = { non_retryable_errors: ["FATAL"] };
    assert.equal(shouldRetryAfterFailure(1, 3, "TRANSIENT", policy), true);
    assert.equal(shouldRetryAfterFailure(3, 3, "TRANSIENT", policy), false);
    assert.equal(shouldRetryAfterFailure(1, 3, "FATAL", policy), false);
  });

  it("in_process: fail twice succeed third with attempt events", async () => {
    const definition = loadRetryConformanceWorkflow();
    const store = new MemoryExecutionHistoryStore();
    const executionId = "retry-fail-twice-succeed-third";
    const executor = new RetryCountingStepExecutor({ failCount: 2, successOutput: { result: "ok" } });

    const out = await runGraphWorkflow({
      definition,
      input: {},
      executionId,
      store,
      activityExecutor: executor,
      activityExecutionMode: "in_process",
    });

    assert.equal(out.status, "completed");
    assert.equal(executor.invocationCount, 3);

    const events = store.listByExecution(executionId).filter((r) => r.kind === "event");
    const requested = events.filter((r) => r.name === "ActivityRequested" && r.payload?.nodeId === "work");
    const failed = events.filter((r) => r.name === "ActivityFailed" && r.payload?.nodeId === "work");
    const completed = events.filter((r) => r.name === "ActivityCompleted" && r.payload?.nodeId === "work");

    assert.equal(requested.length, 3);
    assert.deepEqual(requested.map((r) => r.payload.attempt), [1, 2, 3]);
    assert.equal(failed.length, 2);
    assert.equal(failed.every((r) => r.payload.willRetry === true), true);
    assert.equal(completed.length, 1);
  });

  it("non_retryable_errors stops early without exhausting max_attempts", async () => {
    const definition = loadRetryConformanceWorkflow();
    definition.nodes = definition.nodes.map((n) =>
      n.id === "work"
        ? {
            ...n,
            retry: { max_attempts: 5, non_retryable_errors: ["FATAL"] },
          }
        : n
    );
    const store = new MemoryExecutionHistoryStore();
    const executionId = "retry-non-retryable";

    class FatalFirstExecutor {
      invocationCount = 0;
      async executeActivity() {
        this.invocationCount += 1;
        return { ok: false, error: "fatal", code: "FATAL" };
      }
    }
    const executor = new FatalFirstExecutor();

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
      .filter((r) => r.kind === "event" && r.name === "ActivityFailed" && r.payload?.nodeId === "work");
    assert.equal(failed.length, 1);
    assert.equal(failed[0].payload.attempt, 1);
    assert.equal(failed[0].payload.willRetry, undefined);
  });

  it("max_attempts 1 behaves as single attempt without willRetry", async () => {
    const definition = loadRetryConformanceWorkflow();
    definition.nodes = definition.nodes.map((n) =>
      n.id === "work" ? { ...n, retry: { max_attempts: 1 } } : n
    );
    const store = new MemoryExecutionHistoryStore();
    const executionId = "retry-max-1";

    class AlwaysFailExecutor {
      async executeActivity() {
        return { ok: false, error: "once", code: "TRANSIENT" };
      }
    }

    const out = await runGraphWorkflow({
      definition,
      input: {},
      executionId,
      store,
      activityExecutor: new AlwaysFailExecutor(),
      activityExecutionMode: "in_process",
    });

    assert.equal(out.status, "failed");
    const events = store.listByExecution(executionId).filter((r) => r.kind === "event");
    assert.equal(events.filter((r) => r.name === "ActivityRequested").length, 1);
    const failed = events.find((r) => r.name === "ActivityFailed");
    assert.equal(failed?.payload?.attempt, 1);
    assert.equal(failed?.payload?.willRetry, undefined);
  });

  it("replay prefix through 2 failures + 1 success does not re-invoke executor", async () => {
    const definition = loadRetryConformanceWorkflow();
    const store = new MemoryExecutionHistoryStore();
    const executionId = "retry-replay-no-double-invoke";

    const prefix = [
      { kind: "event", name: "ExecutionStarted", payload: { workflowName: "conformance-retry-step", inputKeys: [] } },
      { kind: "command", name: "ScheduleNode", payload: { nodeId: "start" } },
      { kind: "event", name: "NodeScheduled", payload: { nodeId: "start" } },
      { kind: "command", name: "CompleteNode", payload: { nodeId: "start", output: {} } },
      { kind: "event", name: "StateUpdated", payload: { nodeId: "start", state: {} } },
      { kind: "command", name: "ScheduleNode", payload: { nodeId: "work" } },
      { kind: "event", name: "NodeScheduled", payload: { nodeId: "work" } },
      { kind: "event", name: "ActivityRequested", payload: { nodeId: "work", nodeType: "tool_call", attempt: 1 } },
      { kind: "event", name: "ActivityFailed", payload: { nodeId: "work", error: "e1", attempt: 1, willRetry: true } },
      { kind: "event", name: "ActivityRequested", payload: { nodeId: "work", nodeType: "tool_call", attempt: 2 } },
      { kind: "event", name: "ActivityFailed", payload: { nodeId: "work", error: "e2", attempt: 2, willRetry: true } },
      { kind: "event", name: "ActivityRequested", payload: { nodeId: "work", nodeType: "tool_call", attempt: 3 } },
      {
        kind: "event",
        name: "ActivityCompleted",
        payload: { nodeId: "work", result: { result: "ok" } },
      },
    ];
    for (const row of prefix) {
      store.append(executionId, {
        kind: /** @type {"command" | "event"} */ (row.kind),
        name: row.name,
        payload: { executionId, ...row.payload },
      });
    }

    const out = await runGraphWorkflow({
      definition,
      input: {},
      executionId,
      store,
      activityExecutor: new RejectingActivityExecutor(),
      activityExecutionMode: "in_process",
    });

    assert.equal(out.status, "completed");
    assert.equal(out.result, "ok");
  });

  it("host_mediated: submit failure retries then succeeds", async () => {
    const definition = loadRetryConformanceWorkflow();
    const store = new MemoryExecutionHistoryStore();
    const executionId = "retry-host-mediated";

    const first = await runGraphWorkflow({
      definition,
      input: {},
      executionId,
      store,
      activityExecutionMode: "host_mediated",
    });
    assert.equal(first.status, "awaiting_activity");
    assert.equal(first.nodeId, "work");

    const fail1 = await submitActivityOutcome({
      definition,
      executionId,
      store,
      input: {},
      nodeId: "work",
      outcome: { ok: false, error: "e1", code: "TRANSIENT" },
    });
    assert.equal(fail1.status, "awaiting_activity");

    const fail2 = await submitActivityOutcome({
      definition,
      executionId,
      store,
      input: {},
      nodeId: "work",
      outcome: { ok: false, error: "e2", code: "TRANSIENT" },
    });
    assert.equal(fail2.status, "awaiting_activity");

    const done = await submitActivityOutcome({
      definition,
      executionId,
      store,
      input: {},
      nodeId: "work",
      outcome: { ok: true, result: { result: "ok" } },
    });
    assert.equal(done.status, "completed");

    const events = store.listByExecution(executionId).filter((r) => r.kind === "event");
    const requested = events.filter((r) => r.name === "ActivityRequested" && r.payload?.nodeId === "work");
    assert.deepEqual(requested.map((r) => r.payload.attempt), [1, 2, 3]);
  });
});
