import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCompositeDelegateExecutor,
  CompositeDelegateExecutor,
} from "../src/orchestrator/composite-delegate-executor.mjs";

/**
 * @param {string} tag
 * @returns {import("../src/orchestrator/delegate-executor.mjs").DelegateExecutor}
 */
function mockDelegateExecutor(tag) {
  return {
    async executeDelegate(ctx) {
      return {
        ok: true,
        output: { routed: tag, nodeId: ctx.node.id },
        delegateCorrelationId: `${ctx.executionId}:delegate:${ctx.node.id}`,
        externalTaskId: `${tag}-task-1`,
      };
    },
  };
}

describe("CompositeDelegateExecutor", () => {
  it("routes a2a, mcp, and sdk to configured sub-executors", async () => {
    const composite = new CompositeDelegateExecutor({
      a2a: mockDelegateExecutor("a2a"),
      mcp: mockDelegateExecutor("mcp"),
      sdk: mockDelegateExecutor("sdk"),
    });

    for (const protocol of ["a2a", "mcp", "sdk"]) {
      const r = await composite.executeDelegate({
        executionId: "e1",
        node: { id: `${protocol}-node`, type: "agent_delegate", config: { agent_id: "x" } },
        state: {},
        delegateInput: {},
        protocol,
      });
      assert.equal(r.ok, true);
      if (r.ok) assert.deepEqual(r.output, { routed: protocol, nodeId: `${protocol}-node` });
    }
  });

  it("returns DELEGATE_PROTOCOL_UNSUPPORTED when sub-executor is missing", async () => {
    const composite = buildCompositeDelegateExecutor({ mcp: mockDelegateExecutor("mcp") });
    const r = await composite.executeDelegate({
      executionId: "e1",
      node: { id: "d1", type: "agent_delegate", config: { agent_id: "x" } },
      state: {},
      delegateInput: {},
      protocol: "sdk",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "DELEGATE_PROTOCOL_UNSUPPORTED");
      assert.match(r.error, /sdk/);
    }
  });

  it("uses fallback when explicitly configured", async () => {
    const composite = buildCompositeDelegateExecutor({
      mcp: mockDelegateExecutor("mcp"),
      fallback: mockDelegateExecutor("fallback"),
    });
    const r = await composite.executeDelegate({
      executionId: "e1",
      node: { id: "d1", type: "agent_delegate", config: { agent_id: "x" } },
      state: {},
      delegateInput: {},
      protocol: "a2a",
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.output.routed, "fallback");
  });

  it("rejects unknown protocols", async () => {
    const composite = buildCompositeDelegateExecutor({ mcp: mockDelegateExecutor("mcp") });
    const r = await composite.executeDelegate({
      executionId: "e1",
      node: { id: "d1", type: "agent_delegate", config: { agent_id: "x" } },
      state: {},
      delegateInput: {},
      protocol: "unknown",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "DELEGATE_PROTOCOL_UNSUPPORTED");
  });
});
