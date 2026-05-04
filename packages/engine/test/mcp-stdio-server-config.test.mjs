import assert from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  formatMcpManifestValidationErrors,
  loadEngineDirectActivityExecutor,
  resolveWorkflowEngineMcpConfigPath,
} from "../src/adapters/mcp/stdio-server-config.mjs";
import { createWorkflowApplicationPort } from "../src/application/workflow-application-port.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";

const echoServerPath = fileURLToPath(new URL("./fixtures/mcp-echo-stdio-server.mjs", import.meta.url));
const linearFixturePath = fileURLToPath(new URL("./fixtures/linear.workflow.json", import.meta.url));

describe("resolveWorkflowEngineMcpConfigPath", () => {
  it("prefers --mcp-config over env", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wf-mcp-"));
    const a = path.join(dir, "a.json");
    const b = path.join(dir, "b.json");
    writeFileSync(a, "{}");
    writeFileSync(b, "{}");
    const prev = process.env.WORKFLOW_ENGINE_MCP_CONFIG;
    process.env.WORKFLOW_ENGINE_MCP_CONFIG = b;
    try {
      const argv = ["node", "mcp.mjs", "--mcp-config", a];
      assert.equal(resolveWorkflowEngineMcpConfigPath(argv, dir), a);
    } finally {
      if (prev === undefined) delete process.env.WORKFLOW_ENGINE_MCP_CONFIG;
      else process.env.WORKFLOW_ENGINE_MCP_CONFIG = prev;
    }
  });

  it("uses WORKFLOW_ENGINE_MCP_CONFIG when flag absent", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wf-mcp-"));
    const p = path.join(dir, "mcp.json");
    writeFileSync(p, "{}");
    const prev = process.env.WORKFLOW_ENGINE_MCP_CONFIG;
    process.env.WORKFLOW_ENGINE_MCP_CONFIG = "mcp.json";
    try {
      assert.equal(resolveWorkflowEngineMcpConfigPath(["node", "mcp.mjs"], dir), p);
    } finally {
      if (prev === undefined) delete process.env.WORKFLOW_ENGINE_MCP_CONFIG;
      else process.env.WORKFLOW_ENGINE_MCP_CONFIG = prev;
    }
  });

  it("returns null when not configured", () => {
    const prev = process.env.WORKFLOW_ENGINE_MCP_CONFIG;
    delete process.env.WORKFLOW_ENGINE_MCP_CONFIG;
    try {
      assert.equal(resolveWorkflowEngineMcpConfigPath(["node", "mcp.mjs"], process.cwd()), null);
    } finally {
      if (prev !== undefined) process.env.WORKFLOW_ENGINE_MCP_CONFIG = prev;
    }
  });
});

describe("loadEngineDirectActivityExecutor", () => {
  it("returns ok false for invalid manifest", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wf-mcp-"));
    const bad = path.join(dir, "bad.json");
    writeFileSync(bad, "{");
    const r = await loadEngineDirectActivityExecutor(bad);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.errors.length >= 1);
  });

  it("loads executor for valid manifest", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wf-mcp-"));
    const manifestPath = path.join(dir, "mcp.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        mcpServers: {
          echoSrv: {
            command: process.execPath,
            args: [echoServerPath],
            env: {},
          },
        },
      })
    );
    const r = await loadEngineDirectActivityExecutor(manifestPath);
    assert.equal(r.ok, true);
    if (r.ok) assert.ok(r.executor);
  });
});

describe("createWorkflowApplicationPort + engine-direct executor", () => {
  it("workflow_start runs tool_call via MCP when executor is configured", async () => {
    const definition = JSON.parse(readFileSync(linearFixturePath, "utf8"));
    const toolNode = definition.nodes.find((n) => n.id === "enrich");
    assert.ok(toolNode);
    toolNode.type = "tool_call";
    toolNode.config = { server: "echoSrv", tool: "echo", arguments: { via: "port" } };

    const dir = mkdtempSync(path.join(tmpdir(), "wf-mcp-"));
    const manifestPath = path.join(dir, "manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        mcpServers: {
          echoSrv: {
            command: process.execPath,
            args: [echoServerPath],
            env: {},
          },
        },
      })
    );

    const loaded = await loadEngineDirectActivityExecutor(manifestPath);
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;

    const store = new MemoryExecutionHistoryStore();
    const port = createWorkflowApplicationPort({ store, activityExecutor: loaded.executor });
    const out = await port.startWorkflow({
      executionId: "port-engine-direct-1",
      definition,
      input: { ticket_text: "hello" },
    });

    assert.equal(out.status, "completed");
    const rows = store.listByExecution("port-engine-direct-1");
    const completed = rows.filter((r) => r.name === "ActivityCompleted");
    assert.ok(completed.length >= 1);
    const last = completed[completed.length - 1];
    assert.deepEqual(last.payload.result.echoed, { via: "port" });
  });
});

describe("formatMcpManifestValidationErrors", () => {
  it("formats rows", () => {
    const s = formatMcpManifestValidationErrors([
      { instancePath: "/x", keyword: "type", message: "must be object" },
    ]);
    assert.match(s, /instancePath: \/x/);
    assert.match(s, /must be object/);
  });
});
