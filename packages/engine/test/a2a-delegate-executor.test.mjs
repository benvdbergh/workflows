import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { findWorkflowRepoRoot } from "../src/validate.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { runGraphWorkflow } from "../src/orchestrator/workflow-graph-walker.mjs";
import { mintDelegateCorrelationId } from "../src/orchestrator/delegate-executor.mjs";
import {
  A2ADelegateExecutor,
  HttpA2ATransport,
  parseA2AOperatorConfig,
  parseA2ATaskResponse,
  pollA2ATaskUntilTerminal,
  resolveA2AApiKey,
} from "../src/orchestrator/a2a-delegate-executor.mjs";
import {
  clearWorkflowRefs,
  registerWorkflowRef,
} from "../src/orchestrator/workflow-ref-resolver.mjs";
import { createA2AMockHttpServer } from "./helpers/a2a-mock-http-server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findWorkflowRepoRoot(__dirname);

function loadJson(rel) {
  return JSON.parse(readFileSync(path.join(repoRoot, rel), "utf8"));
}

/**
 * @param {import("./helpers/a2a-mock-http-server.mjs").ReturnType<typeof createA2AMockHttpServer>} mock
 */
async function withMockA2AServer(mock, fn) {
  const { baseUrl, close } = await mock.listen();
  try {
    await fn(baseUrl);
  } finally {
    await close();
  }
}

describe("resolveA2AApiKey", () => {
  it("reads api key from apiKeyEnv", () => {
    const r = resolveA2AApiKey({ apiKeyEnv: "A2A_API_KEY" }, { A2A_API_KEY: "token-1" });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.apiKey, "token-1");
  });

  it("fails when env var is missing", () => {
    const r = resolveA2AApiKey({ apiKeyEnv: "MISSING_A2A_KEY" }, {});
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "A2A_CREDENTIALS_MISSING");
  });
});

describe("parseA2AOperatorConfig", () => {
  it("requires baseUrl", () => {
    const r = parseA2AOperatorConfig({});
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "A2A_CONFIG_INVALID");
  });

  it("normalizes baseUrl and defaults poll settings", () => {
    const r = parseA2AOperatorConfig({ baseUrl: "http://a2a.example/" });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.baseUrl, "http://a2a.example");
      assert.equal(r.pollIntervalMs, 500);
      assert.equal(r.pollTimeoutMs, 120_000);
    }
  });
});

describe("parseA2ATaskResponse", () => {
  it("parses completed task with output", () => {
    const task = parseA2ATaskResponse({
      id: "task-1",
      status: "completed",
      output: { patch: "// done" },
    });
    assert.equal(task.id, "task-1");
    assert.equal(task.status, "completed");
    assert.deepEqual(task.output, { patch: "// done" });
  });
});

describe("A2ADelegateExecutor", () => {
  it("rejects non-a2a protocols", async () => {
    const ex = new A2ADelegateExecutor({
      operatorConfig: { baseUrl: "http://example", apiKeyEnv: "K" },
      env: { K: "token" },
    });
    const r = await ex.executeDelegate({
      executionId: "e1",
      node: { id: "n1", type: "agent_delegate", config: { agent_id: "coder" } },
      state: {},
      delegateInput: {},
      protocol: "mcp",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "DELEGATE_PROTOCOL_UNSUPPORTED");
  });

  it("fails when credentials are missing", async () => {
    const ex = new A2ADelegateExecutor({
      operatorConfig: { baseUrl: "http://example", apiKeyEnv: "MISSING" },
      env: {},
    });
    const r = await ex.executeDelegate({
      executionId: "e1",
      node: { id: "implement", type: "agent_delegate", config: { agent_id: "coder" } },
      state: {},
      delegateInput: { task: "x" },
      protocol: "a2a",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "A2A_CREDENTIALS_MISSING");
  });

  it("submits task, polls working, and returns completed output", async () => {
    const mock = createA2AMockHttpServer({ workingPolls: 1 });
    await withMockA2AServer(mock, async (baseUrl) => {
      const ex = new A2ADelegateExecutor({
        operatorConfig: {
          baseUrl,
          apiKeyEnv: "A2A_TEST_KEY",
          pollIntervalMs: 10,
          pollTimeoutMs: 5_000,
        },
        env: { A2A_TEST_KEY: "secret" },
      });
      const executionId = "a2a-exec-1";
      const r = await ex.executeDelegate({
        executionId,
        node: { id: "implement", type: "agent_delegate", config: { agent_id: "coder" } },
        state: { task: "fix bug" },
        delegateInput: { task: "fix bug" },
        protocol: "a2a",
      });
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.equal(r.delegateCorrelationId, mintDelegateCorrelationId(executionId, "implement"));
        assert.equal(r.externalTaskId, "a2a-task-1");
        assert.match(String(r.output.patch), /fix bug/);
        assert.equal(r.output.delegate_status, "completed");
      }
      assert.equal(mock.tasks.size, 1);
    });
  });

  it("returns A2A_TASK_FAILED when server reports failed status", async () => {
    const mock = createA2AMockHttpServer({ workingPolls: 0, failTaskId: "a2a-task-1", failError: "agent crashed" });
    await withMockA2AServer(mock, async (baseUrl) => {
      const ex = new A2ADelegateExecutor({
        operatorConfig: { baseUrl, apiKeyEnv: "A2A_TEST_KEY", pollIntervalMs: 5, pollTimeoutMs: 2_000 },
        env: { A2A_TEST_KEY: "secret" },
      });
      const r = await ex.executeDelegate({
        executionId: "e-fail",
        node: { id: "implement", type: "agent_delegate", config: { agent_id: "coder" } },
        state: {},
        delegateInput: { task: "fail me" },
        protocol: "a2a",
      });
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.equal(r.code, "A2A_TASK_FAILED");
        assert.match(r.error, /agent crashed/);
      }
    });
  });

  it("runs conformance linear workflow with correlation fields on activity events", async () => {
    const definition = loadJson("examples/conformance-agent-delegate-linear.workflow.json");
    const mock = createA2AMockHttpServer();
    await withMockA2AServer(mock, async (baseUrl) => {
      const store = new MemoryExecutionHistoryStore();
      const executionId = "a2a-linear-wf";
      const out = await runGraphWorkflow({
        definition,
        input: { task: "implement feature X" },
        executionId,
        store,
        delegateExecutor: new A2ADelegateExecutor({
          operatorConfig: { baseUrl, apiKeyEnv: "A2A_TEST_KEY", pollIntervalMs: 10, pollTimeoutMs: 5_000 },
          env: { A2A_TEST_KEY: "secret" },
        }),
      });
      assert.equal(out.status, "completed");
      const rows = store.listByExecution(executionId);
      const requested = rows.find((r) => r.name === "ActivityRequested" && r.payload?.nodeId === "implement");
      const completed = rows.find((r) => r.name === "ActivityCompleted" && r.payload?.nodeId === "implement");
      assert.ok(requested);
      assert.equal(requested.payload?.delegateCorrelationId, mintDelegateCorrelationId(executionId, "implement"));
      assert.ok(completed);
      assert.equal(completed.payload?.externalTaskId, "a2a-task-1");
      assert.equal(completed.payload?.delegateCorrelationId, requested.payload?.delegateCorrelationId);
    });
  });

  it("runs r3-multi-agent-coding implement step via A2A against mock server", async () => {
    clearWorkflowRefs();
    registerWorkflowRef("urn:awp:wf:unit-tests", loadJson("examples/r3-unit-tests-child.workflow.json"));
    const parent = loadJson("examples/r3-multi-agent-coding.workflow.json");
    const mock = createA2AMockHttpServer();
    await withMockA2AServer(mock, async (baseUrl) => {
      const store = new MemoryExecutionHistoryStore();
      const executionId = "r3-a2a-multi-agent";
      const run = await runGraphWorkflow({
        definition: parent,
        input: { task: "fix bug", repo: "acme/app" },
        executionId,
        store,
        delegateExecutor: new A2ADelegateExecutor({
          operatorConfig: { baseUrl, apiKeyEnv: "A2A_TEST_KEY", pollIntervalMs: 10, pollTimeoutMs: 5_000 },
          env: { A2A_TEST_KEY: "secret" },
        }),
        stubActivityOutputs: {
          run_tests: { tests_passed: true },
        },
      });
      assert.equal(run.status, "interrupted");
      assert.equal(typeof run.state?.patch, "string");
      const rows = store.listByExecution(executionId);
      const completed = rows.find((r) => r.name === "ActivityCompleted" && r.payload?.nodeId === "implement");
      assert.ok(completed);
      assert.equal(completed.payload?.externalTaskId, "a2a-task-1");
    });
  });
});

describe("HttpA2ATransport + pollA2ATaskUntilTerminal", () => {
  it("uses injectable fetch against mock server", async () => {
    const mock = createA2AMockHttpServer({ workingPolls: 2 });
    await withMockA2AServer(mock, async (baseUrl) => {
      const transport = new HttpA2ATransport({ baseUrl });
      const submitted = await transport.submitTask({
        apiKey: "tok",
        agentId: "coder",
        correlationId: "c1",
        input: { task: "hello" },
      });
      assert.equal(submitted.status, "submitted");
      const terminal = await pollA2ATaskUntilTerminal(transport, "tok", submitted.id, 5, 2_000);
      assert.equal(terminal.status, "completed");
      assert.ok(terminal.output?.patch);
    });
  });
});
