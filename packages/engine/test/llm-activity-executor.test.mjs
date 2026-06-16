import assert from "node:assert";
import { describe, it } from "node:test";
import { runLinearWorkflow } from "../src/orchestrator/linear-runner.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import {
  buildLlmChatMessages,
  LlmActivityExecutor,
  OpenAiCompatibleLlmProvider,
  parseLlmCallNodeConfig,
  resolveLlmApiKey,
  validateLlmStructuredOutput,
} from "../src/orchestrator/llm-activity-executor.mjs";

describe("resolveLlmApiKey", () => {
  it("reads api key from apiKeyEnv", () => {
    const r = resolveLlmApiKey({ apiKeyEnv: "OPENAI_API_KEY" }, { OPENAI_API_KEY: "sk-test" });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.apiKey, "sk-test");
  });

  it("fails when env var is missing", () => {
    const r = resolveLlmApiKey({ apiKeyEnv: "MISSING_KEY" }, {});
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "LLM_CREDENTIALS_MISSING");
  });

  it("fails for apiKeySecretRef until BEN-103 vault resolver", () => {
    const r = resolveLlmApiKey({ apiKeySecretRef: "vault/openai" }, {});
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "LLM_CREDENTIALS_MISSING");
      assert.match(r.error, /BEN-103/);
    }
  });
});

describe("parseLlmCallNodeConfig", () => {
  it("requires model", () => {
    const r = parseLlmCallNodeConfig({ system_prompt: "hi" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "LLM_CONFIG_INVALID");
  });

  it("accepts system_prompt, user_prompt, and output_schema", () => {
    const r = parseLlmCallNodeConfig({
      model: "gpt-4",
      system_prompt: "sys",
      user_prompt: "user",
      output_schema: { type: "object", properties: { a: { type: "string" } } },
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.config.model, "gpt-4");
      assert.equal(r.config.systemPrompt, "sys");
      assert.equal(r.config.userPrompt, "user");
      assert.ok(r.config.outputSchema);
    }
  });

  it("treats prompt as user prompt alias", () => {
    const r = parseLlmCallNodeConfig({ model: "m", prompt: "from-prompt" });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.config.userPrompt, "from-prompt");
  });
});

describe("validateLlmStructuredOutput", () => {
  it("validates against output_schema", () => {
    const schema = {
      type: "object",
      properties: { intent: { type: "string" }, confidence: { type: "number" } },
      required: ["intent", "confidence"],
    };
    const ok = validateLlmStructuredOutput({ intent: "billing", confidence: 0.9 }, schema);
    assert.equal(ok.ok, true);
    const bad = validateLlmStructuredOutput({ intent: "billing" }, schema);
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.code, "LLM_OUTPUT_VALIDATION_FAILED");
  });
});

describe("buildLlmChatMessages", () => {
  it("serializes state when user prompt is omitted", () => {
    const msgs = buildLlmChatMessages({ ticket_text: "help" }, { systemPrompt: "classify" });
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].role, "system");
    assert.equal(msgs[1].role, "user");
    assert.match(msgs[1].content, /ticket_text/);
  });
});

describe("LlmActivityExecutor", () => {
  it("rejects non-llm_call nodes", async () => {
    const ex = new LlmActivityExecutor({ operatorConfig: { apiKeyEnv: "K" }, env: { K: "sk" } });
    const r = await ex.executeActivity({
      executionId: "e1",
      node: { id: "n1", type: "step", config: {} },
      state: {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "ACTIVITY_EXECUTOR_UNSUPPORTED_NODE");
  });

  it("returns LLM_CONFIG_INVALID for missing model", async () => {
    const ex = new LlmActivityExecutor({ operatorConfig: { apiKeyEnv: "K" }, env: { K: "sk" } });
    const r = await ex.executeActivity({
      executionId: "e1",
      node: { id: "n1", type: "llm_call", config: { system_prompt: "x" } },
      state: {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "LLM_CONFIG_INVALID");
  });

  it("returns LLM_CREDENTIALS_MISSING without operator config", async () => {
    const ex = new LlmActivityExecutor({ env: {} });
    const r = await ex.executeActivity({
      executionId: "e1",
      node: { id: "n1", type: "llm_call", config: { model: "gpt-4" } },
      state: {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "LLM_CREDENTIALS_MISSING");
  });

  it("returns LLM_PROVIDER_ERROR when provider throws", async () => {
    /** @type {import("../src/orchestrator/llm-activity-executor.mjs").LlmProvider} */
    const provider = {
      async chatCompletion() {
        throw new Error("upstream unavailable");
      },
    };
    const ex = new LlmActivityExecutor({
      operatorConfig: { apiKeyEnv: "K" },
      env: { K: "sk" },
      provider,
    });
    const r = await ex.executeActivity({
      executionId: "e1",
      node: { id: "classify", type: "llm_call", config: { model: "gpt-4", system_prompt: "go" } },
      state: { ticket_text: "billing" },
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "LLM_PROVIDER_ERROR");
      assert.match(r.error, /upstream/);
    }
  });

  it("validates structured output from mocked provider", async () => {
    /** @type {import("../src/orchestrator/llm-activity-executor.mjs").LlmProvider} */
    const provider = {
      async chatCompletion(req) {
        assert.equal(req.model, "stub-or-live");
        assert.equal(req.responseFormat?.type, "json_object");
        assert.ok(req.messages.some((m) => m.role === "system"));
        return { content: JSON.stringify({ intent: "billing", confidence: 0.95 }) };
      },
    };
    const ex = new LlmActivityExecutor({
      operatorConfig: { apiKeyEnv: "K" },
      env: { K: "sk" },
      provider,
    });
    const r = await ex.executeActivity({
      executionId: "e1",
      node: {
        id: "classify",
        type: "llm_call",
        config: {
          model: "stub-or-live",
          system_prompt: "Classify intent.",
          output_schema: {
            type: "object",
            properties: { intent: { type: "string" }, confidence: { type: "number" } },
            required: ["intent", "confidence"],
          },
        },
      },
      state: { ticket_text: "I was charged twice" },
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.output.intent, "billing");
      assert.equal(r.output.confidence, 0.95);
    }
  });

  it("returns LLM_OUTPUT_VALIDATION_FAILED for schema mismatch", async () => {
    /** @type {import("../src/orchestrator/llm-activity-executor.mjs").LlmProvider} */
    const provider = {
      async chatCompletion() {
        return { content: JSON.stringify({ intent: "billing" }) };
      },
    };
    const ex = new LlmActivityExecutor({
      operatorConfig: { apiKeyEnv: "K" },
      env: { K: "sk" },
      provider,
    });
    const r = await ex.executeActivity({
      executionId: "e1",
      node: {
        id: "classify",
        type: "llm_call",
        config: {
          model: "m",
          output_schema: {
            type: "object",
            properties: { intent: { type: "string" }, confidence: { type: "number" } },
            required: ["intent", "confidence"],
          },
        },
      },
      state: {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "LLM_OUTPUT_VALIDATION_FAILED");
  });
});

describe("OpenAiCompatibleLlmProvider", () => {
  it("maps fetch response to assistant content", async () => {
    /** @type {typeof fetch} */
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    const provider = new OpenAiCompatibleLlmProvider({ baseUrl: "https://example.test/v1", fetchImpl });
    const res = await provider.chatCompletion({
      apiKey: "sk",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    });
    assert.equal(res.content, '{"a":1}');
  });

  it("throws on HTTP error", async () => {
    /** @type {typeof fetch} */
    const fetchImpl = async () => new Response("rate limited", { status: 429 });
    const provider = new OpenAiCompatibleLlmProvider({ fetchImpl });
    await assert.rejects(() =>
      provider.chatCompletion({
        apiKey: "sk",
        model: "m",
        messages: [{ role: "user", content: "hi" }],
      })
    );
  });
});

describe("LlmActivityExecutor with linear runner", () => {
  it("emits ActivityFailed with LLM_PROVIDER_ERROR on provider failure", async () => {
    const definition = {
      document: {
        schema: "https://agent-workflow.dev/schemas/workflow-definition.json",
        name: "llm-linear",
        version: "1.0.0",
      },
      state_schema: { type: "object", properties: {} },
      nodes: [
        { id: "begin", type: "start", config: { input_schema: { type: "object" } } },
        { id: "classify", type: "llm_call", config: { model: "m", user_prompt: "u" } },
        { id: "finish", type: "end", config: { output_mapping: "{ ok: true }" } },
      ],
      edges: [
        { source: "__start__", target: "begin" },
        { source: "begin", target: "classify" },
        { source: "classify", target: "finish" },
      ],
    };
    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-llm-fail";
    const executor = new LlmActivityExecutor({
      operatorConfig: { apiKeyEnv: "K" },
      env: { K: "sk" },
      provider: {
        async chatCompletion() {
          throw new Error("upstream down");
        },
      },
    });
    const out = await runLinearWorkflow({
      definition,
      input: {},
      executionId,
      store,
      activityExecutor: executor,
    });
    assert.equal(out.status, "failed");
    const failedRow = store.listByExecution(executionId).find((r) => r.name === "ActivityFailed");
    assert.ok(failedRow);
    assert.equal(failedRow.payload.code, "LLM_PROVIDER_ERROR");
    assert.match(failedRow.payload.error, /upstream down/);
  });
});
