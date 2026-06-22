import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { RedactingExecutionHistoryStore } from "../src/persistence/redacting-history-store.mjs";
import { REDACTED_VALUE, redactSecretsInPayload } from "../src/persistence/secret-redaction.mjs";
import { runLinearWorkflow } from "../src/orchestrator/linear-runner.mjs";
import { LlmActivityExecutor } from "../src/orchestrator/llm-activity-executor.mjs";
import { createEnvSecretResolver } from "../src/security/secret-resolver.mjs";

describe("redactSecretsInPayload", () => {
  it("redacts known secret keys at any depth", () => {
    const input = {
      ticket: "help",
      credentials: {
        apiKey: "sk-live",
        nested: { token: "t-1", ok: true },
      },
      password: "p",
      Secret: "s",
    };
    const out = redactSecretsInPayload(input);
    assert.deepEqual(out, {
      ticket: "help",
      credentials: {
        apiKey: REDACTED_VALUE,
        nested: { token: REDACTED_VALUE, ok: true },
      },
      password: REDACTED_VALUE,
      Secret: REDACTED_VALUE,
    });
  });
});

describe("RedactingExecutionHistoryStore", () => {
  it("redacts secrets on append", () => {
    const inner = new MemoryExecutionHistoryStore();
    const store = new RedactingExecutionHistoryStore(inner);
    store.append("exec-1", {
      kind: "event",
      name: "ActivityCompleted",
      payload: { executionId: "exec-1", output: { apiKey: "hidden" } },
    });
    const rows = store.listByExecution("exec-1");
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].payload.output, { apiKey: REDACTED_VALUE });
  });

  it("does not persist resolved LLM api keys from secret_ref at activity boundary", async () => {
    const inner = new MemoryExecutionHistoryStore();
    const store = new RedactingExecutionHistoryStore(inner);
    const resolvedSecret = "sk-resolved-never-persist";
    const secretResolver = createEnvSecretResolver({ LLM_SECRET: resolvedSecret });
    const definition = {
      document: {
        schema: "https://agent-workflow.dev/schemas/workflow-definition.json",
        name: "secret-redaction-llm",
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
    const executor = new LlmActivityExecutor({
      operatorConfig: { apiKeySecretRef: "env:LLM_SECRET" },
      env: {},
      secretResolver,
      provider: {
        async chatCompletion() {
          return { content: JSON.stringify({ result: "ok" }) };
        },
      },
    });
    const executionId = "exec-secret-ref";
    await runLinearWorkflow({
      definition,
      input: {},
      executionId,
      store,
      activityExecutor: executor,
    });
    const serialized = JSON.stringify(store.listByExecution(executionId));
    assert.doesNotMatch(serialized, new RegExp(resolvedSecret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});
