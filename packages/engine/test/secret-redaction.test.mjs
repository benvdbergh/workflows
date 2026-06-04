import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { RedactingExecutionHistoryStore } from "../src/persistence/redacting-history-store.mjs";
import { REDACTED_VALUE, redactSecretsInPayload } from "../src/persistence/secret-redaction.mjs";

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
});
