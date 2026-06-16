import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { mintDelegateCorrelationId } from "../src/orchestrator/delegate-executor.mjs";
import {
  mapMcpActivityResultToDelegateResult,
  McpDelegateExecutor,
  resolveDelegateAgentBinding,
} from "../src/orchestrator/mcp-delegate-executor.mjs";

const echoServerPath = fileURLToPath(new URL("./fixtures/mcp-echo-stdio-server.mjs", import.meta.url));

function echoManifest() {
  return {
    mcpServers: {
      echoSrv: {
        command: process.execPath,
        args: [echoServerPath],
        env: {},
      },
    },
    delegateAgents: {
      "urn:test:agents:echo": { server: "echoSrv", tool: "echo" },
    },
  };
}

describe("resolveDelegateAgentBinding", () => {
  it("returns binding for known agent_id", () => {
    const r = resolveDelegateAgentBinding(echoManifest(), "urn:test:agents:echo");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.binding.server, "echoSrv");
      assert.equal(r.binding.tool, "echo");
    }
  });

  it("returns DELEGATE_AGENT_NOT_FOUND when agent is missing", () => {
    const r = resolveDelegateAgentBinding(echoManifest(), "urn:missing");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "DELEGATE_AGENT_NOT_FOUND");
  });

  it("returns DELEGATE_AGENT_NOT_FOUND when delegateAgents section is absent", () => {
    const r = resolveDelegateAgentBinding({ mcpServers: echoManifest().mcpServers }, "any");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "DELEGATE_AGENT_NOT_FOUND");
  });
});

describe("mapMcpActivityResultToDelegateResult", () => {
  it("maps activity failure to DELEGATE_PROTOCOL_ERROR", () => {
    const r = mapMcpActivityResultToDelegateResult(
      { ok: false, error: "tool failed", code: "MCP_TOOL_EXECUTION_ERROR" },
      "corr-1",
      "task-1"
    );
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "DELEGATE_PROTOCOL_ERROR");
      assert.match(r.error, /tool failed/);
    }
  });

  it("maps activity success to delegate output", () => {
    const r = mapMcpActivityResultToDelegateResult(
      { ok: true, output: { echoed: { x: 1 } } },
      "corr-1",
      "task-1"
    );
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.output, { echoed: { x: 1 } });
      assert.equal(r.delegateCorrelationId, "corr-1");
      assert.equal(r.externalTaskId, "task-1");
    }
  });
});

describe("McpDelegateExecutor", () => {
  it("rejects non-mcp protocols", async () => {
    const ex = new McpDelegateExecutor({ manifest: echoManifest() });
    const r = await ex.executeDelegate({
      executionId: "e1",
      node: { id: "d1", type: "agent_delegate", config: { agent_id: "urn:test:agents:echo" } },
      state: {},
      delegateInput: {},
      protocol: "sdk",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "DELEGATE_PROTOCOL_UNSUPPORTED");
  });

  it("returns DELEGATE_AGENT_NOT_FOUND for missing agent_id", async () => {
    const ex = new McpDelegateExecutor({ manifest: echoManifest() });
    const r = await ex.executeDelegate({
      executionId: "e1",
      node: { id: "d1", type: "agent_delegate", config: {} },
      state: {},
      delegateInput: {},
      protocol: "mcp",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "DELEGATE_AGENT_NOT_FOUND");
  });

  it("returns DELEGATE_AGENT_NOT_FOUND for unbound agent_id", async () => {
    const ex = new McpDelegateExecutor({ manifest: echoManifest() });
    const r = await ex.executeDelegate({
      executionId: "e1",
      node: { id: "d1", type: "agent_delegate", config: { agent_id: "urn:unknown" } },
      state: {},
      delegateInput: {},
      protocol: "mcp",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "DELEGATE_AGENT_NOT_FOUND");
  });

  it("invokes echo MCP tool via delegateAgents binding", async () => {
    const ex = new McpDelegateExecutor({ manifest: echoManifest() });
    const executionId = "mcp-delegate-exec-1";
    const r = await ex.executeDelegate({
      executionId,
      node: { id: "delegate", type: "agent_delegate", config: { agent_id: "urn:test:agents:echo" } },
      state: {},
      delegateInput: { task: "hello delegate" },
      protocol: "mcp",
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.delegateCorrelationId, mintDelegateCorrelationId(executionId, "delegate"));
      assert.match(r.externalTaskId, /^mcp-task-/);
      assert.deepEqual(r.output.echoed, { task: "hello delegate" });
    }
  });

  it("returns DELEGATE_PROTOCOL_ERROR when MCP tool reports isError", async () => {
    const manifest = {
      mcpServers: echoManifest().mcpServers,
      delegateAgents: {
        "urn:test:agents:fail": { server: "echoSrv", tool: "fail_tool" },
      },
    };
    const ex = new McpDelegateExecutor({ manifest });
    const r = await ex.executeDelegate({
      executionId: "e-fail",
      node: { id: "d1", type: "agent_delegate", config: { agent_id: "urn:test:agents:fail" } },
      state: {},
      delegateInput: {},
      protocol: "mcp",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "DELEGATE_PROTOCOL_ERROR");
      assert.match(r.error, /intentional/);
    }
  });
});
