import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, it } from "node:test";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { SqliteExecutionHistoryStore } from "../src/persistence/sqlite-history-store.mjs";

/**
 * @param {{ append: Function; listByExecution: Function; close?: () => void }} store
 */
function runContract(store) {
  const exA = "exec-a";
  const exB = "exec-b";

  const s1 = store.append(exA, { kind: "command", name: "StartRun", payload: { x: 1 } });
  const s2 = store.append(exA, { kind: "event", name: "RunStarted", payload: { x: 2 } });
  const s3 = store.append(exA, { kind: "command", name: "Step", payload: { x: 3 } });

  assert.equal(s1, 1);
  assert.equal(s2, 2);
  assert.equal(s3, 3);

  const listed = store.listByExecution(exA);
  assert.equal(listed.length, 3);
  for (let i = 0; i < listed.length; i++) {
    assert.equal(listed[i].seq, i + 1);
    assert.equal(listed[i].executionId, exA);
  }
  const seqs = listed.map((r) => r.seq);
  const sorted = [...seqs].sort((a, b) => a - b);
  assert.deepEqual(seqs, sorted);

  const before = store.listByExecution(exA).length;
  store.append(exA, { kind: "event", name: "More", payload: {} });
  const after = store.listByExecution(exA).length;
  assert.equal(after, before + 1);

  const b1 = store.append(exB, { kind: "command", name: "Other", payload: {} });
  const b2 = store.append(exB, { kind: "event", name: "OtherEvt", payload: { n: 1 } });
  assert.equal(b1, 1);
  assert.equal(b2, 2);
  assert.equal(store.listByExecution(exB).length, 2);
}

describe("MemoryExecutionHistoryStore", () => {
  it("orders by monotonic seq, append-only growth, independent executions start at 1", () => {
    const store = new MemoryExecutionHistoryStore();
    runContract(store);
  });
});

describe("SqliteExecutionHistoryStore", () => {
  /** @type {SqliteExecutionHistoryStore | null} */
  let store = null;
  /** @type {DatabaseSync | null} */
  let db = null;

  afterEach(() => {
    store?.close();
    try {
      db?.close();
    } catch {
      /* already closed */
    }
    store = null;
    db = null;
  });

  it("orders by monotonic seq, append-only growth, independent executions start at 1", () => {
    db = new DatabaseSync(":memory:");
    store = new SqliteExecutionHistoryStore({ database: db });
    runContract(store);
  });
});
