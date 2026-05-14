import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { runLinearWorkflow } from "../src/orchestrator/linear-runner.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import {
  callMcpToolStdio,
  mapMcpCallToolResultToActivityResult,
  mapMcpClientThrownError,
  McpManifestActivityExecutor,
} from "../src/orchestrator/mcp-stdio-activity-executor.mjs";

const echoServerPath = fileURLToPath(new URL("./fixtures/mcp-echo-stdio-server.mjs", import.meta.url));
const linearFixturePath = fileURLToPath(new URL("./fixtures/linear.workflow.json", import.meta.url));

describe("mapMcpClientThrownError", () => {
  it("maps McpError RequestTimeout", () => {
    const r = mapMcpClientThrownError(new McpError(ErrorCode.RequestTimeout, "slow", undefined));
    assert.equal(r.ok, false);
    assert.equal(r.code, "ACTIVITY_TIMEOUT");
  });

  it("maps McpError ConnectionClosed", () => {
    const r = mapMcpClientThrownError(new McpError(ErrorCode.ConnectionClosed, "closed", undefined));
    assert.equal(r.ok, false);
    assert.equal(r.code, "MCP_CONNECTION_CLOSED");
  });

  it("maps generic Error", () => {
    const r = mapMcpClientThrownError(new Error("spawn xyz failed"));
    assert.equal(r.ok, false);
    assert.equal(r.code, "MCP_CLIENT_ERROR");
  });
});

describe("mapMcpCallToolResultToActivityResult", () => {
  it("maps isError tool results", () => {
    const r = mapMcpCallToolResultToActivityResult({
      isError: true,
      content: [{ type: "text", text: "bad" }],
    });
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /bad/);
    assert.equal(r.code, "MCP_TOOL_EXECUTION_ERROR");
  });

  it("maps structuredContent to output", () => {
    const r = mapMcpCallToolResultToActivityResult({
      structuredContent: { a: 1 },
      content: [],
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.output, { a: 1 });
  });
});

describe("callMcpToolStdio (integration)", () => {
  it("invokes echo tool on fixture stdio server", async () => {
    const serverDef = {
      command: process.execPath,
      args: [echoServerPath],
      env: {},
    };
    const r = await callMcpToolStdio(serverDef, "echo", { hello: "mcp" }, { timeoutMs: 20_000 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.output.echoed, { hello: "mcp" });
    }
  });

  it("maps tool isError from fixture", async () => {
    const serverDef = {
      command: process.execPath,
      args: [echoServerPath],
      env: {},
    };
    const r = await callMcpToolStdio(serverDef, "fail_tool", {}, { timeoutMs: 20_000 });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.error, /intentional/);
      assert.equal(r.code, "MCP_TOOL_EXECUTION_ERROR");
    }
  });
});

describe("McpManifestActivityExecutor", () => {
  it("rejects non-tool_call nodes", async () => {
    const ex = new McpManifestActivityExecutor({
      manifest: { mcpServers: { x: { command: process.execPath, args: [], env: {} } } },
    });
    const r = await ex.executeActivity({
      executionId: "e1",
      node: { id: "n1", type: "step", config: { handler: "h" } },
      state: {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "ACTIVITY_EXECUTOR_UNSUPPORTED_NODE");
  });

  it("fails when server label is missing from manifest", async () => {
    const ex = new McpManifestActivityExecutor({
      manifest: { mcpServers: {} },
    });
    const r = await ex.executeActivity({
      executionId: "e1",
      node: { id: "t1", type: "tool_call", config: { server: "missing", tool: "echo", arguments: {} } },
      state: {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "MCP_SERVER_NOT_CONFIGURED");
  });

  it("runs tool_call via manifest server (integration)", async () => {
    const manifest = {
      mcpServers: {
        echoSrv: {
          command: process.execPath,
          args: [echoServerPath],
          env: {},
        },
      },
    };
    const definition = JSON.parse(readFileSync(linearFixturePath, "utf8"));
    const toolNode = definition.nodes.find((n) => n.id === "enrich");
    assert.ok(toolNode);
    toolNode.type = "tool_call";
    toolNode.config = { server: "echoSrv", tool: "echo", arguments: { via: "workflow" } };

    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-mcp-manifest-executor";
    const ex = new McpManifestActivityExecutor({ manifest, defaultTimeoutMs: 25_000 });
    const out = await runLinearWorkflow({
      definition,
      input: { ticket_text: "hello" },
      executionId,
      store,
      activityExecutor: ex,
    });
    assert.equal(out.status, "completed");
    const completed = store.listByExecution(executionId).filter((r) => r.name === "ActivityCompleted");
    assert.ok(completed.length >= 1);
    const last = completed[completed.length - 1];
    assert.deepEqual(last.payload.result.echoed, { via: "workflow" });
  });
});
