import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { findWorkflowRepoRoot, validateWorkflowDefinition } from "../src/validate.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { runLinearWorkflow } from "../src/orchestrator/linear-runner.mjs";
import { runPocWorkflow } from "../src/orchestrator/poc-runner.mjs";
import { hydrateReplayContext } from "../src/orchestrator/replay-loader.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const linearFixturePath = path.join(__dirname, "fixtures", "linear.workflow.json");

function loadLighthouse() {
  const root = findWorkflowRepoRoot(__dirname);
  const p = path.join(root, "examples", "lighthouse-customer-routing.workflow.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

describe("hydrateReplayContext", () => {
  it("hydrates ordered linear history with command/event correlation and replay results", async () => {
    const definition = JSON.parse(readFileSync(linearFixturePath, "utf8"));
    assert.equal(validateWorkflowDefinition(definition).ok, true);

    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-replay-linear";
    const out = await runLinearWorkflow({
      definition,
      input: { ticket_text: "hello" },
      executionId,
      store,
      stubActivityOutputs: {
        enrich: { intent: "support", tags: ["a", "b"] },
      },
    });
    assert.equal(out.status, "completed");

    const replay = hydrateReplayContext({ executionId, store, startMode: "genesis" });
    assert.equal(replay.startSeq, 1);
    assert.ok(replay.rows.length > 0);

    const seqs = replay.rows.map((row) => row.seq);
    assert.deepEqual(seqs, seqs.slice().sort((a, b) => a - b));
    assert.equal(replay.events[0]?.name, "ExecutionStarted");
    assert.equal(replay.lastPosition.status, "completed");

    const activityDone = replay.events.find((row) => row.name === "ActivityCompleted");
    assert.ok(activityDone);
    const correlation = replay.commandEventCorrelation.find((item) => item.eventSeq === activityDone.seq);
    assert.ok(correlation);
    assert.equal(correlation.commandName, "ScheduleNode");

    assert.deepEqual(replay.replayResults.get("enrich"), {
      intent: "support",
      tags: ["a", "b"],
    });
  });

  it("hydrates from latest valid checkpoint boundary when present", async () => {
    const definition = JSON.parse(readFileSync(linearFixturePath, "utf8"));
    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-replay-safe-point";

    const out = await runLinearWorkflow({
      definition,
      input: { ticket_text: "checkpointed" },
      executionId,
      store,
      stubActivityOutputs: {
        enrich: { intent: "support", tags: ["x"] },
      },
    });
    assert.equal(out.status, "completed");

    const boundarySeq = store.append(executionId, {
      kind: "event",
      name: "StateUpdated",
      payload: { executionId, nodeId: "manual", state: { ok: true } },
    });
    const checkpointSeq = store.append(executionId, {
      kind: "event",
      name: "CheckpointWritten",
      payload: {
        executionId,
        policy: "after_each_node",
        workflowVersion: "v-test",
        definitionHash: "abc123",
        lastAppliedEventSeq: boundarySeq,
        nodeId: "manual",
        stateRef: { kind: "inline_state", state: { ok: true } },
      },
    });
    assert.ok(checkpointSeq > boundarySeq);

    const replay = hydrateReplayContext({ executionId, store, startMode: "safe_point" });
    assert.equal(replay.startSeq, boundarySeq + 1);
    assert.ok(replay.rows.every((row) => row.seq >= boundarySeq + 1));
    assert.equal(replay.checkpoint.used, true);
    assert.equal(replay.checkpoint.policy, "after_each_node");
    assert.equal(replay.checkpoint.lastAppliedEventSeq, boundarySeq);
  });

  it("falls back to genesis replay when latest checkpoint is invalid", async () => {
    const definition = JSON.parse(readFileSync(linearFixturePath, "utf8"));
    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-replay-invalid-checkpoint";

    const out = await runLinearWorkflow({
      definition,
      input: { ticket_text: "checkpoint-invalid" },
      executionId,
      store,
      stubActivityOutputs: {
        enrich: { intent: "support", tags: ["z"] },
      },
    });
    assert.equal(out.status, "completed");

    store.append(executionId, {
      kind: "event",
      name: "CheckpointWritten",
      payload: {
        executionId,
        policy: "after_each_node",
        workflowVersion: "v-test",
        definitionHash: "abc123",
        lastAppliedEventSeq: 999999, // invalid boundary (beyond history)
        nodeId: "manual",
        stateRef: { kind: "inline_state", state: { ok: false } },
      },
    });

    const replay = hydrateReplayContext({ executionId, store, startMode: "safe_point" });
    assert.equal(replay.startSeq, 1);
    assert.equal(replay.checkpoint.used, false);
  });

  it("hydrates switch/interrupt history and derives interrupted cursor", async () => {
    const definition = loadLighthouse();
    assert.equal(validateWorkflowDefinition(definition).ok, true);

    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-replay-interrupt";

    const first = await runPocWorkflow({
      definition,
      input: { ticket_text: "unclear" },
      executionId,
      store,
      stubActivityOutputs: {
        classify: { intent: "ambiguous", confidence: 0.3 },
      },
    });
    assert.equal(first.status, "interrupted");

    const replay = hydrateReplayContext({ executionId, store });
    assert.equal(replay.lastPosition.status, "interrupted");
    assert.equal(replay.lastPosition.nodeId, "human_review");
    assert.deepEqual(replay.replayResults.get("classify"), {
      intent: "ambiguous",
      confidence: 0.3,
    });

    const interruptEvent = replay.events.find((row) => row.name === "InterruptRaised");
    assert.ok(interruptEvent);
  });
});
