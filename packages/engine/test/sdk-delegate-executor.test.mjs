import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mintDelegateCorrelationId } from "../src/orchestrator/delegate-executor.mjs";
import {
  normalizeSdkDelegateHandlers,
  SdkDelegateExecutor,
} from "../src/orchestrator/sdk-delegate-executor.mjs";

describe("normalizeSdkDelegateHandlers", () => {
  it("copies Map entries", () => {
    const map = new Map([["a", async () => ({ x: 1 })]]);
    const normalized = normalizeSdkDelegateHandlers(map);
    assert.equal(normalized.get("a"), map.get("a"));
    assert.notEqual(normalized, map);
  });

  it("builds Map from plain object", () => {
    const handler = async () => ({ ok: true });
    const normalized = normalizeSdkDelegateHandlers({ "urn:agent": handler });
    assert.equal(normalized.get("urn:agent"), handler);
  });
});

describe("SdkDelegateExecutor", () => {
  it("rejects non-sdk protocols", async () => {
    const ex = new SdkDelegateExecutor({ handlers: {} });
    const r = await ex.executeDelegate({
      executionId: "e1",
      node: { id: "d1", type: "agent_delegate", config: { agent_id: "urn:agent" } },
      state: {},
      delegateInput: {},
      protocol: "mcp",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "DELEGATE_PROTOCOL_UNSUPPORTED");
  });

  it("returns DELEGATE_AGENT_NOT_FOUND when agent_id is missing", async () => {
    const ex = new SdkDelegateExecutor({
      handlers: { "urn:agent": async () => ({}) },
    });
    const r = await ex.executeDelegate({
      executionId: "e1",
      node: { id: "d1", type: "agent_delegate", config: {} },
      state: {},
      delegateInput: {},
      protocol: "sdk",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "DELEGATE_AGENT_NOT_FOUND");
  });

  it("returns DELEGATE_AGENT_NOT_FOUND when handler is not registered", async () => {
    const ex = new SdkDelegateExecutor({ handlers: {} });
    const r = await ex.executeDelegate({
      executionId: "e1",
      node: { id: "d1", type: "agent_delegate", config: { agent_id: "urn:missing" } },
      state: {},
      delegateInput: {},
      protocol: "sdk",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "DELEGATE_AGENT_NOT_FOUND");
  });

  it("invokes registered handler and returns output", async () => {
    const ex = new SdkDelegateExecutor({
      handlers: {
        "urn:test:agents:local": async (input) => ({
          patch: `// sdk patch for ${input.task}`,
          delegate_status: "completed",
        }),
      },
    });
    const executionId = "sdk-exec-1";
    const r = await ex.executeDelegate({
      executionId,
      node: { id: "implement", type: "agent_delegate", config: { agent_id: "urn:test:agents:local" } },
      state: {},
      delegateInput: { task: "refactor module" },
      protocol: "sdk",
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.delegateCorrelationId, mintDelegateCorrelationId(executionId, "implement"));
      assert.match(r.externalTaskId, /^sdk-task-/);
      assert.match(String(r.output.patch), /refactor module/);
      assert.equal(r.output.delegate_status, "completed");
    }
  });

  it("supports registerHandler extension point", async () => {
    const ex = new SdkDelegateExecutor();
    ex.registerHandler("urn:dynamic", async (input) => ({ echoed: input.value }));
    const r = await ex.executeDelegate({
      executionId: "e2",
      node: { id: "d2", type: "agent_delegate", config: { agent_id: "urn:dynamic" } },
      state: {},
      delegateInput: { value: 42 },
      protocol: "sdk",
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.output, { echoed: 42 });
  });

  it("returns DELEGATE_PROTOCOL_ERROR when handler throws", async () => {
    const ex = new SdkDelegateExecutor({
      handlers: {
        "urn:throws": async () => {
          throw new Error("handler exploded");
        },
      },
    });
    const r = await ex.executeDelegate({
      executionId: "e3",
      node: { id: "d3", type: "agent_delegate", config: { agent_id: "urn:throws" } },
      state: {},
      delegateInput: {},
      protocol: "sdk",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "DELEGATE_PROTOCOL_ERROR");
      assert.match(r.error, /handler exploded/);
    }
  });
});
