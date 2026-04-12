import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import {
  assertNoCustomReducers,
  applyOutputWithReducers,
  computeLinearNodePath,
  runLinearWorkflow,
} from "../src/orchestrator/linear-runner.mjs";
import { validateWorkflowDefinition } from "../src/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures", "linear.workflow.json");

describe("runLinearWorkflow", () => {
  it("runs linear fixture, jq output_mapping binds to workflow state, history names are ordered", async () => {
    const definition = JSON.parse(readFileSync(fixturePath, "utf8"));
    const v = validateWorkflowDefinition(definition);
    assert.equal(v.ok, true);

    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-linear-1";
    const input = { ticket_text: "hello" };

    const out = await runLinearWorkflow({
      definition,
      input,
      executionId,
      store,
      stubActivityOutputs: {
        enrich: { intent: "support", tags: ["a", "b"] },
      },
    });

    assert.equal(out.status, "completed");
    assert.deepEqual(out.result, {
      result: { text: "hello", label: "support", allTags: ["a", "b"] },
    });
    assert.deepEqual(out.finalState, {
      ticket_text: "hello",
      intent: "support",
      tags: ["a", "b"],
    });

    const rows = store.listByExecution(executionId);
    const seqs = rows.map((r) => r.seq);
    assert.deepEqual(seqs, seqs.slice().sort((a, b) => a - b));

    const names = rows.map((r) => `${r.kind}:${r.name}`);
    assert.equal(rows[0].kind, "event");
    assert.equal(rows[0].name, "ExecutionStarted");
    assert.equal(rows[rows.length - 1].name, "ExecutionCompleted");

    const required = [
      "event:ExecutionStarted",
      "command:ScheduleNode",
      "event:NodeScheduled",
      "command:CompleteNode",
      "event:StateUpdated",
      "command:ScheduleNode",
      "event:NodeScheduled",
      "event:ActivityRequested",
      "event:ActivityCompleted",
      "command:CompleteNode",
      "event:StateUpdated",
      "command:ScheduleNode",
      "event:NodeScheduled",
      "command:CompleteNode",
      "event:ExecutionCompleted",
    ];
    let j = 0;
    for (const token of required) {
      const idx = names.indexOf(token, j);
      assert.ok(idx >= 0, `expected ${token} after index ${j}, got ${names.slice(j).join(", ")}`);
      j = idx + 1;
    }

    for (const r of rows) {
      assert.ok("executionId" in r.payload && r.payload.executionId === executionId);
      if (r.name === "ScheduleNode" || r.name === "NodeScheduled" || r.name === "CompleteNode") {
        assert.ok(typeof r.payload.nodeId === "string" && r.payload.nodeId.length > 0);
      }
    }
  });

  it("rejects state_schema reducer custom before run", () => {
    const definition = JSON.parse(readFileSync(fixturePath, "utf8"));
    definition.state_schema.properties.extra = { type: "string", reducer: "custom" };
    assert.throws(() => assertNoCustomReducers(definition), /custom/);
  });

  it("returns failed for branching graph", async () => {
    const definition = JSON.parse(readFileSync(fixturePath, "utf8"));
    definition.edges.push({ source: "begin", "target": "enrich" });
    const store = new MemoryExecutionHistoryStore();
    const out = await runLinearWorkflow({
      definition,
      input: { ticket_text: "x" },
      executionId: "exec-branch",
      store,
    });
    assert.equal(out.status, "failed");
    assert.match(out.error ?? "", /Non-linear|branch/i);
  });

  it("activity executor failure emits ActivityFailed, FailNode, ExecutionFailed in order", async () => {
    const definition = JSON.parse(readFileSync(fixturePath, "utf8"));
    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-activity-fail";

    /** @type {import("../src/orchestrator/activity-executor.mjs").ActivityExecutor} */
    const failingExecutor = {
      async executeActivity(ctx) {
        if (ctx.node.id === "enrich") {
          return { ok: false, error: "mock activity error", code: "MOCK" };
        }
        return { ok: true, output: {} };
      },
    };

    const out = await runLinearWorkflow({
      definition,
      input: { ticket_text: "hello" },
      executionId,
      store,
      activityExecutor: failingExecutor,
    });

    assert.equal(out.status, "failed");
    assert.equal(out.error, "mock activity error");

    const names = store.listByExecution(executionId).map((r) => `${r.kind}:${r.name}`);
    const required = [
      "event:ActivityRequested",
      "event:ActivityFailed",
      "command:FailNode",
      "event:ExecutionFailed",
    ];
    let j = 0;
    for (const token of required) {
      const idx = names.indexOf(token, j);
      assert.ok(idx >= 0, `expected ${token} after index ${j}, got ${names.slice(j).join(", ")}`);
      j = idx + 1;
    }

    const failedRow = store.listByExecution(executionId).find((r) => r.name === "ActivityFailed");
    assert.ok(failedRow);
    assert.equal(failedRow.payload.nodeId, "enrich");
    assert.equal(failedRow.payload.error, "mock activity error");
    assert.equal(failedRow.payload.code, "MOCK");
  });
});

describe("applyOutputWithReducers", () => {
  it("append and merge behave per POC", () => {
    const schema = {
      properties: {
        tags: { reducer: "append" },
        meta: { reducer: "merge" },
      },
    };
    let state = { tags: ["x"], meta: { a: 1 } };
    state = applyOutputWithReducers(state, { tags: ["y"], meta: { b: 2 } }, schema);
    assert.deepEqual(state.tags, ["x", "y"]);
    assert.deepEqual(state.meta, { a: 1, b: 2 });
  });
});

describe("computeLinearNodePath", () => {
  it("returns ordered ids for a simple chain", () => {
    const nodes = [
      { id: "begin", type: "start" },
      { id: "s", type: "step" },
      { id: "finish", type: "end" },
    ];
    const outgoing = new Map([
      ["__start__", ["begin"]],
      ["begin", ["s"]],
      ["s", ["finish"]],
    ]);
    assert.deepEqual(computeLinearNodePath(nodes, outgoing), ["begin", "s", "finish"]);
  });
});
