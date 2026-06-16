import assert from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  formatMcpManifestValidationErrors,
  loadEngineDirectActivityExecutor,
  loadProductionActivityExecutor,
  loadStepHandlerRegistryFromEnv,
  resolveLlmOperatorConfigFromEnv,
  resolveWorkflowEngineMcpConfigPath,
} from "../src/adapters/mcp/stdio-server-config.mjs";
import { createWorkflowApplicationPort } from "../src/application/workflow-application-port.mjs";
import { buildCompositeActivityExecutor } from "../src/orchestrator/composite-activity-executor.mjs";
import { LlmActivityExecutor } from "../src/orchestrator/llm-activity-executor.mjs";
import { StepActivityExecutor } from "../src/orchestrator/step-activity-executor.mjs";
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

    const loaded = await loadProductionActivityExecutor({ manifestPath, env: {} });
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assert.ok(loaded.executor);

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

describe("loadProductionActivityExecutor", () => {
  it("returns undefined executor when no operator config is present", async () => {
    const r = await loadProductionActivityExecutor({
      manifestPath: null,
      llmConfig: null,
      stepHandlerRegistry: null,
      env: {},
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.executor, undefined);
  });

  it("builds composite when manifest and LLM config are set", async () => {
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
    const r = await loadProductionActivityExecutor({
      manifestPath,
      llmConfig: { apiKeyEnv: "TEST_LLM_KEY" },
      env: { TEST_LLM_KEY: "sk-test" },
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.ok(r.executor);
  });
});

describe("resolveLlmOperatorConfigFromEnv", () => {
  it("parses inline JSON", () => {
    const cfg = resolveLlmOperatorConfigFromEnv(
      { WORKFLOW_ENGINE_LLM_CONFIG: '{"apiKeyEnv":"OPENAI_API_KEY"}' },
      process.cwd()
    );
    assert.deepEqual(cfg, { apiKeyEnv: "OPENAI_API_KEY" });
  });
});

describe("loadStepHandlerRegistryFromEnv", () => {
  it("registers static outputs from inline JSON", () => {
    const registry = loadStepHandlerRegistryFromEnv(
      { WORKFLOW_ENGINE_STEP_HANDLERS: '{"urn:test:handler":{"value":42}}' },
      process.cwd()
    );
    assert.ok(registry);
    assert.ok(registry.get("urn:test:handler"));
  });
});

describe("CompositeActivityExecutor integration", () => {
  it("routes tool_call to MCP, llm_call to LLM adapter, step to handler registry", async () => {
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

    const toolLoaded = await loadEngineDirectActivityExecutor(manifestPath);
    assert.equal(toolLoaded.ok, true);
    if (!toolLoaded.ok) return;

    const stepRegistry = loadStepHandlerRegistryFromEnv(
      { WORKFLOW_ENGINE_STEP_HANDLERS: '{"urn:composite:test":{"stepValue":"ok"}}' },
      dir
    );
    assert.ok(stepRegistry);

    /** @type {import("../src/orchestrator/llm-activity-executor.mjs").LlmProvider} */
    const provider = {
      async chatCompletion() {
        return { content: JSON.stringify({ intent: "composite-llm" }) };
      },
    };

    const composite = buildCompositeActivityExecutor({
      tool_call: toolLoaded.executor,
      llm_call: new LlmActivityExecutor({
        operatorConfig: { apiKeyEnv: "K" },
        env: { K: "sk" },
        provider,
      }),
      step: new StepActivityExecutor({ registry: stepRegistry }),
    });

    const tool = await composite.executeActivity({
      executionId: "composite-1",
      node: { id: "tool-node", type: "tool_call", config: { server: "echoSrv", tool: "echo", arguments: { x: 1 } } },
      state: {},
    });
    assert.equal(tool.ok, true);
    if (tool.ok) assert.deepEqual(tool.output.echoed, { x: 1 });

    const llm = await composite.executeActivity({
      executionId: "composite-1",
      node: { id: "llm-node", type: "llm_call", config: { model: "stub" } },
      state: {},
    });
    assert.equal(llm.ok, true);
    if (llm.ok) assert.equal(llm.output.intent, "composite-llm");

    const step = await composite.executeActivity({
      executionId: "composite-1",
      node: { id: "step-node", type: "step", config: { handler: "urn:composite:test" } },
      state: {},
    });
    assert.equal(step.ok, true);
    if (step.ok) assert.equal(step.output.stepValue, "ok");
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
