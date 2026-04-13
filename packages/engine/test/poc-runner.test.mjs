import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { findWorkflowRepoRoot, validateWorkflowDefinition } from "../src/validate.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { runPocWorkflow, resumePocWorkflow } from "../src/orchestrator/poc-runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadLighthouse() {
  const root = findWorkflowRepoRoot(__dirname);
  const p = path.join(root, "examples", "lighthouse-customer-routing.workflow.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

class CrashAfterHistorySeqStore {
  /**
   * @param {MemoryExecutionHistoryStore} inner
   * @param {string} executionId
   * @param {number} failAfterSeq
   */
  constructor(inner, executionId, failAfterSeq) {
    this.inner = inner;
    this.executionId = executionId;
    this.failAfterSeq = failAfterSeq;
    this.crashed = false;
  }

  append(executionId, input) {
    if (this.crashed) {
      throw new Error("simulated crash: process terminated");
    }
    const persisted = this.inner.listByExecution(executionId).length;
    if (executionId === this.executionId && persisted >= this.failAfterSeq) {
      this.crashed = true;
      throw new Error("simulated crash: process terminated");
    }
    return this.inner.append(executionId, input);
  }

  listByExecution(executionId) {
    return this.inner.listByExecution(executionId);
  }
}

describe("runPocWorkflow (lighthouse)", () => {
  it("technical intent stubs path search_kb → finish → completed", async () => {
    const definition = loadLighthouse();
    assert.equal(validateWorkflowDefinition(definition).ok, true);

    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-lh-tech";

    const out = await runPocWorkflow({
      definition,
      input: { ticket_text: "My API returns 500" },
      executionId,
      store,
      stubActivityOutputs: {
        classify: { intent: "technical", confidence: 0.9 },
        search_kb: { snippets: [] },
      },
    });

    assert.equal(out.status, "completed");
    assert.deepEqual(out.result, { intent: "technical", confidence: 0.9 });

    assert.equal(store.listByExecution(executionId).at(-1)?.name, "ExecutionCompleted");

    const scheduled = store
      .listByExecution(executionId)
      .filter((r) => r.name === "NodeScheduled")
      .map((r) => r.payload.nodeId);
    assert.ok(scheduled.includes("search_kb"));
    assert.ok(!scheduled.includes("human_review"));
    assert.ok(!scheduled.includes("open_ticket"));
  });

  it("default branch interrupts at human_review; valid resume completes via open_ticket", async () => {
    const definition = loadLighthouse();
    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-lh-interrupt";

    const first = await runPocWorkflow({
      definition,
      input: { ticket_text: "unclear" },
      executionId,
      store,
      stubActivityOutputs: {
        classify: { intent: "ambiguous", confidence: 0.3 },
      },
    });

    assert.deepEqual(first, {
      status: "interrupted",
      executionId,
      nodeId: "human_review",
      state: {
        ticket_text: "unclear",
        intent: "ambiguous",
        confidence: 0.3,
      },
    });

    const rowsAtInterrupt = store.listByExecution(executionId);
    const ir = rowsAtInterrupt.filter((r) => r.name === "InterruptRaised");
    assert.equal(ir.length, 1);
    assert.equal(ir[0].payload.nodeId, "human_review");
    assert.ok(typeof ir[0].payload.prompt === "string");

    const resumed = await resumePocWorkflow({
      definition,
      executionId,
      store,
      resumePayload: { intent: "billing" },
      stubActivityOutputs: {
        open_ticket: { ticket_id: "T-1" },
      },
    });

    assert.equal(resumed.status, "completed");
    assert.deepEqual(resumed.result, { intent: "billing", confidence: 0.3 });

    const names = store.listByExecution(executionId).map((r) => `${r.kind}:${r.name}`);
    const resumeIdx = names.indexOf("command:ResumeInterrupt");
    const resumedIdx = names.indexOf("event:InterruptResumed");
    assert.ok(resumeIdx >= 0 && resumedIdx > resumeIdx);
    assert.ok(names.includes("command:CompleteNode"));
    assert.equal(store.listByExecution(executionId).at(-1)?.name, "ExecutionCompleted");
  });

  it("invalid resume appends FailNode and ExecutionFailed", async () => {
    const definition = loadLighthouse();
    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-lh-bad-resume";

    await runPocWorkflow({
      definition,
      input: { ticket_text: "x" },
      executionId,
      store,
      stubActivityOutputs: {
        classify: { intent: "x", confidence: 0.1 },
      },
    });

    const nBefore = store.listByExecution(executionId).length;

    const bad = await resumePocWorkflow({
      definition,
      executionId,
      store,
      resumePayload: {},
    });

    assert.equal(bad.status, "failed");
    assert.match(bad.error ?? "", /resume|required|intent/i);

    const rows = store.listByExecution(executionId);
    assert.ok(rows.length > nBefore);
    const tail = rows.slice(nBefore);
    const failCmd = tail.find((r) => r.kind === "command" && r.name === "FailNode");
    const failEvt = tail.find((r) => r.kind === "event" && r.name === "ExecutionFailed");
    assert.ok(failCmd);
    assert.ok(failEvt);
    assert.equal(failCmd.payload.reason, "resume_validation_failed");
  });
});

describe("runPocWorkflow (switch precedence)", () => {
  it("ignores static edges from switch; cases win over sw→wrong edge", async () => {
    const fixturePath = path.join(__dirname, "fixtures", "switch-precedence.workflow.json");
    const definition = JSON.parse(readFileSync(fixturePath, "utf8"));
    assert.equal(validateWorkflowDefinition(definition).ok, true);

    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-sw-prec";

    const out = await runPocWorkflow({
      definition,
      input: { pick: "good" },
      executionId,
      store,
      stubActivityOutputs: {
        good_step: { via: "cases" },
      },
    });

    assert.equal(out.status, "completed");
    assert.deepEqual(out.result, { via: "cases" });

    const scheduled = store
      .listByExecution(executionId)
      .filter((r) => r.name === "NodeScheduled")
      .map((r) => r.payload.nodeId);
    assert.ok(scheduled.includes("good_step"));
    assert.ok(!scheduled.includes("wrong_only_via_edge"));
  });
});

describe("runPocWorkflow (deterministic replay matching)", () => {
  it("recovers after deterministic mid-run crash and converges with uninterrupted result", async () => {
    const definition = loadLighthouse();
    const executionId = "exec-replay-crash-recovery";

    const uninterruptedStore = new MemoryExecutionHistoryStore();
    let uninterruptedCalls = 0;
    const uninterrupted = await runPocWorkflow({
      definition,
      input: { ticket_text: "My API returns 500" },
      executionId: `${executionId}-baseline`,
      store: uninterruptedStore,
      activityExecutor: {
        async executeActivity(ctx) {
          uninterruptedCalls += 1;
          if (ctx.node.id === "classify") return { ok: true, output: { intent: "technical", confidence: 0.9 } };
          if (ctx.node.id === "search_kb") return { ok: true, output: { snippets: [] } };
          return { ok: true, output: {} };
        },
      },
    });
    assert.equal(uninterrupted.status, "completed");

    const persistedStore = new MemoryExecutionHistoryStore();
    const crashStore = new CrashAfterHistorySeqStore(persistedStore, executionId, 9);
    let crashRunCalls = 0;

    await assert.rejects(
      runPocWorkflow({
        definition,
        input: { ticket_text: "My API returns 500" },
        executionId,
        store: crashStore,
        activityExecutor: {
          async executeActivity(ctx) {
            crashRunCalls += 1;
            if (ctx.node.id === "classify") return { ok: true, output: { intent: "technical", confidence: 0.9 } };
            if (ctx.node.id === "search_kb") return { ok: true, output: { snippets: [] } };
            return { ok: true, output: {} };
          },
        },
      }),
      /simulated crash/
    );

    const rowsAfterCrash = persistedStore.listByExecution(executionId);
    assert.ok(rowsAfterCrash.length >= 9);
    assert.ok(rowsAfterCrash.some((r) => r.name === "ActivityCompleted" && r.payload.nodeId === "classify"));
    assert.ok(!rowsAfterCrash.some((r) => r.name === "ExecutionFailed"));
    assert.equal(crashRunCalls, 1);

    let restartCalls = 0;
    const recovered = await runPocWorkflow({
      definition,
      input: { ticket_text: "My API returns 500" },
      executionId,
      store: persistedStore,
      activityExecutor: {
        async executeActivity(ctx) {
          restartCalls += 1;
          if (ctx.node.id === "classify") {
            return { ok: false, error: "classify should be replayed from persisted history" };
          }
          if (ctx.node.id === "search_kb") return { ok: true, output: { snippets: [] } };
          return { ok: true, output: {} };
        },
      },
    });

    assert.equal(recovered.status, "completed");
    assert.deepEqual(recovered.result, uninterrupted.result);
    assert.equal(restartCalls, 1);

    const recoveredRows = persistedStore.listByExecution(executionId);
    const replayedCompletions = recoveredRows.filter(
      (r) => r.kind === "event" && r.name === "ActivityCompleted" && r.payload?.replayed === true
    );
    assert.ok(replayedCompletions.some((r) => r.payload.nodeId === "classify"));
    assert.equal(recoveredRows.at(-1)?.name, "ExecutionCompleted");
  });

  it("reuses historical activity completion and skips live execution", async () => {
    const definition = loadLighthouse();
    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-replay-match";

    let firstCalls = 0;
    const first = await runPocWorkflow({
      definition,
      input: { ticket_text: "My API returns 500" },
      executionId,
      store,
      activityExecutor: {
        async executeActivity(ctx) {
          firstCalls += 1;
          if (ctx.node.id === "classify") return { ok: true, output: { intent: "technical", confidence: 0.9 } };
          if (ctx.node.id === "search_kb") return { ok: true, output: { snippets: [] } };
          return { ok: true, output: {} };
        },
      },
    });
    assert.equal(first.status, "completed");
    assert.equal(firstCalls, 2);

    let replayCalls = 0;
    const replayed = await runPocWorkflow({
      definition,
      input: { ticket_text: "My API returns 500" },
      executionId,
      store,
      activityExecutor: {
        async executeActivity() {
          replayCalls += 1;
          return { ok: false, error: "should not run activity during replay" };
        },
      },
    });

    assert.equal(replayed.status, "completed");
    assert.deepEqual(replayed.result, { intent: "technical", confidence: 0.9 });
    assert.equal(replayCalls, 0);
  });

  it("fails with nondeterminism error code when replayed command sequence diverges", async () => {
    const definition = loadLighthouse();
    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-replay-diverge";

    const first = await runPocWorkflow({
      definition,
      input: { ticket_text: "My API returns 500" },
      executionId,
      store,
      stubActivityOutputs: {
        classify: { intent: "technical", confidence: 0.9 },
        search_kb: { snippets: [] },
      },
    });
    assert.equal(first.status, "completed");

    const diverged = JSON.parse(JSON.stringify(definition));
    const routeNode = diverged.nodes.find((n) => n.id === "route");
    routeNode.config.cases = [
      {
        when: '.intent == "technical"',
        target: "open_ticket",
      },
    ];
    routeNode.config.default = "open_ticket";

    const second = await runPocWorkflow({
      definition: diverged,
      input: { ticket_text: "My API returns 500" },
      executionId,
      store,
      stubActivityOutputs: {
        classify: { intent: "technical", confidence: 0.9 },
        open_ticket: { ticket_id: "T-2" },
      },
    });

    assert.equal(second.status, "failed");
    assert.match(second.error ?? "", /NONDETERMINISM_DETECTED/);
    assert.match(second.error ?? "", /Deterministic replay mismatch/);
  });
});

describe("runPocWorkflow (checkpoint policy)", () => {
  it("writes after_each_node checkpoints with recovery metadata linked to history boundaries", async () => {
    const definition = loadLighthouse();
    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-checkpoint-policy";

    const out = await runPocWorkflow({
      definition,
      input: { ticket_text: "My API returns 500" },
      executionId,
      store,
      stubActivityOutputs: {
        classify: { intent: "technical", confidence: 0.9 },
        search_kb: { snippets: [] },
      },
    });
    assert.equal(out.status, "completed");

    const rows = store.listByExecution(executionId);
    const checkpoints = rows.filter((r) => r.kind === "event" && r.name === "CheckpointWritten");
    assert.ok(checkpoints.length > 0);

    for (const checkpoint of checkpoints) {
      assert.equal(checkpoint.payload.executionId, executionId);
      assert.equal(checkpoint.payload.policy, "after_each_node");
      assert.equal(typeof checkpoint.payload.workflowVersion, "string");
      assert.equal(typeof checkpoint.payload.definitionHash, "string");
      assert.equal(checkpoint.payload.definitionHash.length, 64);
      assert.equal(typeof checkpoint.payload.lastAppliedEventSeq, "number");
      assert.equal(checkpoint.payload.lastAppliedEventSeq < checkpoint.seq, true);
      assert.equal(typeof checkpoint.payload.nodeId, "string");
      assert.equal(checkpoint.payload.stateRef?.kind, "inline_state");
      assert.equal(typeof checkpoint.payload.stateRef?.state, "object");

      const boundary = rows.find((r) => r.seq === checkpoint.payload.lastAppliedEventSeq);
      assert.ok(boundary);
      assert.equal(boundary.kind, "event");
      assert.ok(boundary.name === "StateUpdated" || boundary.name === "InterruptRaised");
    }
  });
});
