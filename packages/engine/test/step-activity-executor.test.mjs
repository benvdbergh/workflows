import assert from "node:assert";
import { describe, it } from "node:test";
import { runLinearWorkflow } from "../src/orchestrator/linear-runner.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import {
  parseStepNodeConfig,
  StepActivityExecutor,
  StepHandlerRegistry,
} from "../src/orchestrator/step-activity-executor.mjs";

describe("parseStepNodeConfig", () => {
  it("requires handler URN", () => {
    const r = parseStepNodeConfig({ code_ref: "x" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "STEP_CONFIG_INVALID");
  });

  it("accepts handler string", () => {
    const r = parseStepNodeConfig({ handler: "urn:test:handler" });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.config.handler, "urn:test:handler");
  });
});

describe("StepHandlerRegistry", () => {
  it("registers and retrieves handlers", () => {
    const registry = new StepHandlerRegistry();
    const fn = async () => ({ a: 1 });
    registry.register("urn:test:a", fn);
    assert.equal(registry.get("urn:test:a"), fn);
    assert.equal(registry.get("missing"), undefined);
  });

  it("createFrozenCopy rejects further register calls", () => {
    const registry = new StepHandlerRegistry();
    registry.register("urn:test:a", async () => ({}));
    const frozen = registry.createFrozenCopy();
    assert.throws(() => frozen.register("urn:test:b", async () => ({})), /frozen/);
    assert.ok(frozen.get("urn:test:a"));
  });
});

describe("StepActivityExecutor", () => {
  it("rejects non-step nodes", async () => {
    const registry = new StepHandlerRegistry();
    const ex = new StepActivityExecutor({ registry: registry.createFrozenCopy() });
    const r = await ex.executeActivity({
      executionId: "e1",
      node: { id: "n1", type: "llm_call", config: {} },
      state: {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "ACTIVITY_EXECUTOR_UNSUPPORTED_NODE");
  });

  it("returns STEP_CONFIG_INVALID for missing handler", async () => {
    const registry = new StepHandlerRegistry();
    const ex = new StepActivityExecutor({ registry: registry.createFrozenCopy() });
    const r = await ex.executeActivity({
      executionId: "e1",
      node: { id: "n1", type: "step", config: {} },
      state: {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "STEP_CONFIG_INVALID");
  });

  it("returns HANDLER_NOT_FOUND for unknown URN", async () => {
    const registry = new StepHandlerRegistry();
    const ex = new StepActivityExecutor({ registry: registry.createFrozenCopy() });
    const r = await ex.executeActivity({
      executionId: "e1",
      node: { id: "n1", type: "step", config: { handler: "urn:missing" } },
      state: {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "HANDLER_NOT_FOUND");
      assert.match(r.error, /urn:missing/);
    }
  });

  it("dispatches registered handler and returns plain object output", async () => {
    const registry = new StepHandlerRegistry();
    registry.register("urn:test:echo", async (ctx) => ({
      echoed: ctx.state.input,
      nodeId: ctx.node.id,
    }));
    const ex = new StepActivityExecutor({ registry: registry.createFrozenCopy() });
    const r = await ex.executeActivity({
      executionId: "e1",
      node: { id: "work", type: "step", config: { handler: "urn:test:echo" } },
      state: { input: "hello" },
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.output.echoed, "hello");
      assert.equal(r.output.nodeId, "work");
    }
  });

  it("passes through ActivityExecutorResult from handler", async () => {
    const registry = new StepHandlerRegistry();
    registry.register("urn:test:fail", async () => ({
      ok: false,
      error: "business rule",
      code: "CUSTOM",
    }));
    const ex = new StepActivityExecutor({ registry: registry.createFrozenCopy() });
    const r = await ex.executeActivity({
      executionId: "e1",
      node: { id: "work", type: "step", config: { handler: "urn:test:fail" } },
      state: {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "CUSTOM");
      assert.equal(r.error, "business rule");
    }
  });

  it("returns HANDLER_ERROR when handler throws", async () => {
    const registry = new StepHandlerRegistry();
    registry.register("urn:test:throw", async () => {
      throw new Error("handler blew up");
    });
    const ex = new StepActivityExecutor({ registry: registry.createFrozenCopy() });
    const r = await ex.executeActivity({
      executionId: "e1",
      node: { id: "work", type: "step", config: { handler: "urn:test:throw" } },
      state: {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "HANDLER_ERROR");
      assert.match(r.error, /blew up/);
    }
  });
});

describe("StepActivityExecutor with linear runner", () => {
  it("completes workflow when handler is registered", async () => {
    const definition = {
      document: {
        schema: "https://agent-workflow.dev/schemas/workflow-definition.json",
        name: "step-linear",
        version: "1.0.0",
      },
      state_schema: {
        type: "object",
        properties: { value: { type: "string" } },
      },
      nodes: [
        { id: "begin", type: "start" },
        {
          id: "work",
          type: "step",
          config: { handler: "urn:test:produce" },
        },
        { id: "finish", type: "end", config: { output_mapping: ".value" } },
      ],
      edges: [
        { source: "__start__", target: "begin" },
        { source: "begin", target: "work" },
        { source: "work", target: "finish" },
      ],
    };
    const registry = new StepHandlerRegistry();
    registry.register("urn:test:produce", async () => ({ value: "done" }));
    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-step-linear";
    const out = await runLinearWorkflow({
      definition,
      input: {},
      executionId,
      store,
      activityExecutor: new StepActivityExecutor({ registry: registry.createFrozenCopy() }),
    });
    assert.equal(out.status, "completed");
    assert.equal(out.result, "done");
    const failedRow = store.listByExecution(executionId).find((r) => r.name === "ActivityFailed");
    assert.equal(failedRow, undefined);
  });

  it("emits ActivityFailed with HANDLER_NOT_FOUND when handler is missing", async () => {
    const definition = {
      document: {
        schema: "https://agent-workflow.dev/schemas/workflow-definition.json",
        name: "step-linear-fail",
        version: "1.0.0",
      },
      state_schema: { type: "object", properties: {} },
      nodes: [
        { id: "begin", type: "start" },
        { id: "work", type: "step", config: { handler: "urn:test:missing" } },
        { id: "finish", type: "end" },
      ],
      edges: [
        { source: "__start__", target: "begin" },
        { source: "begin", target: "work" },
        { source: "work", target: "finish" },
      ],
    };
    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-step-fail";
    const out = await runLinearWorkflow({
      definition,
      input: {},
      executionId,
      store,
      activityExecutor: new StepActivityExecutor({
        registry: new StepHandlerRegistry().createFrozenCopy(),
      }),
    });
    assert.equal(out.status, "failed");
    const failedRow = store.listByExecution(executionId).find((r) => r.name === "ActivityFailed");
    assert.ok(failedRow);
    assert.equal(failedRow.payload.code, "HANDLER_NOT_FOUND");
  });
});
