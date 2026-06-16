import assert from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  buildActivityRoutingSummary,
  formatActivityRoutingSummaryLog,
  formatMcpManifestValidationErrors,
  loadEngineDirectActivityExecutor,
  loadEngineDirectMcpDelegateExecutor,
  loadProductionActivityExecutor,
  loadProductionDelegateExecutor,
  loadStepHandlerRegistryFromEnv,
  resolveA2AOperatorConfigFromEnv,
  resolveLlmOperatorConfigFromEnv,
  resolveWorkflowEngineMcpConfigPath,
} from "../src/adapters/mcp/stdio-server-config.mjs";
import { createWorkflowApplicationPort } from "../src/application/workflow-application-port.mjs";
import { buildCompositeActivityExecutor } from "../src/orchestrator/composite-activity-executor.mjs";
import { buildCompositeDelegateExecutor } from "../src/orchestrator/composite-delegate-executor.mjs";
import { A2ADelegateExecutor, HttpA2ATransport } from "../src/orchestrator/a2a-delegate-executor.mjs";
import { LlmActivityExecutor } from "../src/orchestrator/llm-activity-executor.mjs";
import { StepActivityExecutor } from "../src/orchestrator/step-activity-executor.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { findWorkflowRepoRoot } from "../src/validate.mjs";
import { createA2AMockHttpServer } from "./helpers/a2a-mock-http-server.mjs";

const echoServerPath = fileURLToPath(new URL("./fixtures/mcp-echo-stdio-server.mjs", import.meta.url));
const linearFixturePath = fileURLToPath(new URL("./fixtures/linear.workflow.json", import.meta.url));
const delegateFixturePath = path.join(
  findWorkflowRepoRoot(path.dirname(fileURLToPath(import.meta.url))),
  "examples/conformance-agent-delegate-linear.workflow.json"
);

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

  it("returns routingSummary with missing routes for partial config without demo profile", async () => {
    const r = await loadProductionActivityExecutor({
      manifestPath: null,
      llmConfig: { apiKeyEnv: "TEST_LLM_KEY" },
      stepHandlerRegistry: null,
      env: { TEST_LLM_KEY: "sk-test" },
      profile: null,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.routingSummary, {
      llm_call: "production",
      tool_call: "missing",
      step: "missing",
      demoStubFallback: false,
    });
    assert.match(
      formatActivityRoutingSummaryLog(r.routingSummary),
      /activity routing: llm_call=production, tool_call=missing, step=missing/
    );
    assert.match(formatActivityRoutingSummaryLog(r.routingSummary), /demo stub fallback: inactive/);
  });

  it("returns routingSummary with stub(demo) for unconfigured routes when demo profile is active", async () => {
    const r = await loadProductionActivityExecutor({
      manifestPath: null,
      llmConfig: { apiKeyEnv: "TEST_LLM_KEY" },
      stepHandlerRegistry: null,
      env: { TEST_LLM_KEY: "sk-test", WORKFLOW_ENGINE_PROFILE: "demo" },
      profile: "demo",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.routingSummary, {
      llm_call: "production",
      tool_call: "stub(demo)",
      step: "stub(demo)",
      demoStubFallback: true,
    });
    assert.match(
      formatActivityRoutingSummaryLog(r.routingSummary),
      /activity routing: llm_call=production, tool_call=stub\(demo\), step=stub\(demo\)/
    );
    assert.match(formatActivityRoutingSummaryLog(r.routingSummary), /demo stub fallback: active/);
  });

  it("returns stub(default) routes when no operator config is present", async () => {
    const r = await loadProductionActivityExecutor({
      manifestPath: null,
      llmConfig: null,
      stepHandlerRegistry: null,
      env: {},
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.routingSummary, {
      llm_call: "stub(default)",
      tool_call: "stub(default)",
      step: "stub(default)",
      demoStubFallback: false,
    });
  });
});

describe("buildActivityRoutingSummary", () => {
  it("maps configured and unconfigured composite routes", () => {
    const summary = buildActivityRoutingSummary({
      hasLlm: true,
      hasTool: false,
      hasStep: false,
      demoStubFallback: false,
      compositeMode: true,
    });
    assert.deepEqual(summary, {
      llm_call: "production",
      tool_call: "missing",
      step: "missing",
      demoStubFallback: false,
    });
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

describe("resolveA2AOperatorConfigFromEnv", () => {
  it("parses inline JSON", () => {
    const cfg = resolveA2AOperatorConfigFromEnv(
      { WORKFLOW_ENGINE_A2A_CONFIG: '{"baseUrl":"http://a2a.example","apiKeyEnv":"A2A_KEY"}' },
      process.cwd()
    );
    assert.deepEqual(cfg, { baseUrl: "http://a2a.example", apiKeyEnv: "A2A_KEY" });
  });
});

describe("loadEngineDirectMcpDelegateExecutor", () => {
  it("returns undefined executor when manifest has no delegateAgents", async () => {
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
    const r = await loadEngineDirectMcpDelegateExecutor(manifestPath);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.executor, undefined);
  });

  it("loads McpDelegateExecutor when delegateAgents is present", async () => {
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
        delegateAgents: {
          "urn:test:agents:echo": { server: "echoSrv", tool: "echo" },
        },
      })
    );
    const r = await loadEngineDirectMcpDelegateExecutor(manifestPath);
    assert.equal(r.ok, true);
    if (r.ok) assert.ok(r.executor);
  });
});

describe("loadProductionDelegateExecutor", () => {
  it("returns undefined executor when no operator config is present", async () => {
    const r = await loadProductionDelegateExecutor({
      manifestPath: null,
      a2aConfig: null,
      env: {},
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.executor, undefined);
  });

  it("fails fast on invalid A2A config", async () => {
    const r = await loadProductionDelegateExecutor({
      manifestPath: null,
      a2aConfig: { apiKeyEnv: "K" },
      env: { K: "token" },
    });
    assert.equal(r.ok, false);
    if (!r.ok && "error" in r) assert.match(r.error, /baseUrl/);
  });

  it("builds composite when A2A config is set", async () => {
    const r = await loadProductionDelegateExecutor({
      manifestPath: null,
      a2aConfig: { baseUrl: "http://a2a.example", apiKeyEnv: "A2A_KEY" },
      env: { A2A_KEY: "token" },
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.ok(r.executor);
  });

  it("builds composite when manifest has delegateAgents", async () => {
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
        delegateAgents: {
          "urn:test:agents:echo": { server: "echoSrv", tool: "echo" },
        },
      })
    );
    const r = await loadProductionDelegateExecutor({ manifestPath, env: {} });
    assert.equal(r.ok, true);
    if (r.ok) assert.ok(r.executor);
  });

  it("adds MockA2ADelegateExecutor fallback when WORKFLOW_ENGINE_PROFILE=demo", async () => {
    const r = await loadProductionDelegateExecutor({
      manifestPath: null,
      a2aConfig: { baseUrl: "http://a2a.example", apiKeyEnv: "A2A_KEY" },
      env: { A2A_KEY: "token", WORKFLOW_ENGINE_PROFILE: "demo" },
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const sdkResult = await r.executor.executeDelegate({
      executionId: "demo-fallback-1",
      node: { id: "d1", type: "agent_delegate", config: { agent_id: "local" } },
      state: {},
      delegateInput: { task: "demo" },
      protocol: "sdk",
    });
    assert.equal(sdkResult.ok, true);
  });
});

describe("createWorkflowApplicationPort + production delegate executor", () => {
  it("workflow_start runs agent_delegate via MCP delegateAgents when configured", async () => {
    const definition = JSON.parse(readFileSync(delegateFixturePath, "utf8"));
    const delegateNode = definition.nodes.find((n) => n.id === "implement");
    assert.ok(delegateNode);
    delegateNode.config = {
      agent_id: "urn:test:agents:echo",
      protocol: "mcp",
      input_mapping: { task: "${ .task }" },
    };

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
        delegateAgents: {
          "urn:test:agents:echo": { server: "echoSrv", tool: "echo" },
        },
      })
    );

    const loaded = await loadProductionDelegateExecutor({ manifestPath, env: {} });
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assert.ok(loaded.executor);

    const store = new MemoryExecutionHistoryStore();
    const port = createWorkflowApplicationPort({ store, delegateExecutor: loaded.executor });
    const out = await port.startWorkflow({
      executionId: "port-delegate-mcp-1",
      definition,
      input: { task: "hello delegate" },
    });

    assert.equal(out.status, "completed");
    const rows = store.listByExecution("port-delegate-mcp-1");
    const completed = rows.filter((r) => r.name === "ActivityCompleted");
    assert.ok(completed.length >= 1);
    const last = completed[completed.length - 1];
    assert.deepEqual(last.payload.result.echoed, { task: "hello delegate" });
  });

  it("workflow_start runs agent_delegate via A2A config when configured", async () => {
    const definition = JSON.parse(readFileSync(delegateFixturePath, "utf8"));
    const mock = createA2AMockHttpServer();
    const { baseUrl, close } = await mock.listen();
    try {
      const loaded = await loadProductionDelegateExecutor({
        manifestPath: null,
        a2aConfig: { baseUrl, apiKeyEnv: "A2A_KEY", pollIntervalMs: 10, pollTimeoutMs: 5000 },
        env: { A2A_KEY: "test-token" },
      });
      assert.equal(loaded.ok, true);
      if (!loaded.ok) return;
      assert.ok(loaded.executor);

      const store = new MemoryExecutionHistoryStore();
      const port = createWorkflowApplicationPort({ store, delegateExecutor: loaded.executor });
      const out = await port.startWorkflow({
        executionId: "port-delegate-a2a-1",
        definition,
        input: { task: "implement feature" },
      });

      assert.equal(out.status, "completed");
      const rows = store.listByExecution("port-delegate-a2a-1");
      const completed = rows.filter((r) => r.name === "ActivityCompleted");
      assert.ok(completed.length >= 1);
      const last = completed[completed.length - 1];
      assert.match(String(last.payload.result.patch), /implement feature/);
    } finally {
      await close();
    }
  });
});

describe("CompositeDelegateExecutor integration", () => {
  it("routes a2a to A2ADelegateExecutor and mcp to manifest delegateAgents", async () => {
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
        delegateAgents: {
          "urn:test:agents:echo": { server: "echoSrv", tool: "echo" },
        },
      })
    );

    const mcpLoaded = await loadEngineDirectMcpDelegateExecutor(manifestPath);
    assert.equal(mcpLoaded.ok, true);
    if (!mcpLoaded.ok || !mcpLoaded.executor) return;

    const mock = createA2AMockHttpServer();
    const { baseUrl, close } = await mock.listen();
    try {
      const composite = buildCompositeDelegateExecutor({
        a2a: new A2ADelegateExecutor({
          operatorConfig: { baseUrl, apiKeyEnv: "K", pollIntervalMs: 10, pollTimeoutMs: 5000 },
          env: { K: "token" },
          transport: new HttpA2ATransport({ baseUrl }),
        }),
        mcp: mcpLoaded.executor,
      });

      const a2a = await composite.executeDelegate({
        executionId: "composite-delegate-1",
        node: { id: "a2a-node", type: "agent_delegate", config: { agent_id: "coder" } },
        state: {},
        delegateInput: { task: "a2a task" },
        protocol: "a2a",
      });
      assert.equal(a2a.ok, true);
      if (a2a.ok) assert.match(String(a2a.output.patch), /a2a task/);

      const mcp = await composite.executeDelegate({
        executionId: "composite-delegate-1",
        node: { id: "mcp-node", type: "agent_delegate", config: { agent_id: "urn:test:agents:echo" } },
        state: {},
        delegateInput: { task: "mcp task" },
        protocol: "mcp",
      });
      assert.equal(mcp.ok, true);
      if (mcp.ok) assert.deepEqual(mcp.output.echoed, { task: "mcp task" });
    } finally {
      await close();
    }
  });
});
