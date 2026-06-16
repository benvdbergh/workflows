import assert from "node:assert";
import { describe, it } from "node:test";
import {
  buildCompositeActivityExecutor,
  CompositeActivityExecutor,
} from "../src/orchestrator/composite-activity-executor.mjs";

/**
 * @param {string} tag
 * @returns {import("../src/orchestrator/activity-executor.mjs").ActivityExecutor}
 */
function mockExecutor(tag) {
  return {
    async executeActivity(ctx) {
      return { ok: true, output: { routed: tag, nodeId: ctx.node.id } };
    },
  };
}

describe("CompositeActivityExecutor", () => {
  it("routes step, llm_call, and tool_call to configured sub-executors", async () => {
    const composite = new CompositeActivityExecutor({
      step: mockExecutor("step"),
      llm_call: mockExecutor("llm_call"),
      tool_call: mockExecutor("tool_call"),
    });

    const step = await composite.executeActivity({
      executionId: "e1",
      node: { id: "s1", type: "step", config: { handler: "urn:test" } },
      state: {},
    });
    assert.equal(step.ok, true);
    if (step.ok) assert.deepEqual(step.output, { routed: "step", nodeId: "s1" });

    const llm = await composite.executeActivity({
      executionId: "e1",
      node: { id: "l1", type: "llm_call", config: { model: "m" } },
      state: {},
    });
    assert.equal(llm.ok, true);
    if (llm.ok) assert.deepEqual(llm.output, { routed: "llm_call", nodeId: "l1" });

    const tool = await composite.executeActivity({
      executionId: "e1",
      node: { id: "t1", type: "tool_call", config: { server: "x", tool: "y" } },
      state: {},
    });
    assert.equal(tool.ok, true);
    if (tool.ok) assert.deepEqual(tool.output, { routed: "tool_call", nodeId: "t1" });
  });

  it("returns COMPOSITE_EXECUTOR_NOT_CONFIGURED when sub-executor is missing", async () => {
    const composite = buildCompositeActivityExecutor({ tool_call: mockExecutor("tool_call") });
    const r = await composite.executeActivity({
      executionId: "e1",
      node: { id: "l1", type: "llm_call", config: { model: "m" } },
      state: {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "COMPOSITE_EXECUTOR_NOT_CONFIGURED");
      assert.match(r.error, /llm_call/);
    }
  });

  it("uses fallback only when explicitly configured", async () => {
    const composite = buildCompositeActivityExecutor({
      tool_call: mockExecutor("tool_call"),
      fallback: mockExecutor("fallback"),
    });
    const r = await composite.executeActivity({
      executionId: "e1",
      node: { id: "s1", type: "step", config: { handler: "urn:test" } },
      state: {},
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.output.routed, "fallback");
  });

  it("rejects non-activity node types", async () => {
    const composite = buildCompositeActivityExecutor({
      step: mockExecutor("step"),
      llm_call: mockExecutor("llm_call"),
      tool_call: mockExecutor("tool_call"),
    });
    const r = await composite.executeActivity({
      executionId: "e1",
      node: { id: "w1", type: "wait", config: {} },
      state: {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "COMPOSITE_EXECUTOR_NOT_CONFIGURED");
  });
});
