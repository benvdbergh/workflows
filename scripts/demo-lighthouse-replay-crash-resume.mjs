import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SqliteExecutionHistoryStore, runPocWorkflow, validateWorkflowDefinition } from "../packages/engine/src/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const lighthousePath = path.join(repoRoot, "examples", "lighthouse-customer-routing.workflow.json");
const sqliteDir = path.join(repoRoot, ".tmp");
const sqlitePath = path.join(sqliteDir, "lighthouse-replay-demo.sqlite");

class CrashAfterHistorySeqStore {
  /**
   * @param {SqliteExecutionHistoryStore} inner
   * @param {string} executionId
   * @param {number} failAfterSeq
   */
  constructor(inner, executionId, failAfterSeq) {
    this.inner = inner;
    this.executionId = executionId;
    this.failAfterSeq = failAfterSeq;
    this.crashed = false;
  }

  append(executionId, input) {
    if (this.crashed) throw new Error("simulated crash: process terminated");
    const persisted = this.inner.listByExecution(executionId).length;
    if (executionId === this.executionId && persisted >= this.failAfterSeq) {
      this.crashed = true;
      throw new Error("simulated crash: process terminated");
    }
    return this.inner.append(executionId, input);
  }

  listByExecution(executionId) {
    return this.inner.listByExecution(executionId);
  }
}

function loadDefinition() {
  const definition = JSON.parse(readFileSync(lighthousePath, "utf8"));
  const validation = validateWorkflowDefinition(definition);
  assert.equal(validation.ok, true, "lighthouse definition must validate before replay demo");
  return definition;
}

function summarizeTail(rows, count = 8) {
  return rows.slice(-count).map((r) => `${r.kind}:${r.name}:${r.payload?.nodeId ?? "-"}`);
}

async function run() {
  mkdirSync(sqliteDir, { recursive: true });
  rmSync(sqlitePath, { force: true });
  const definition = loadDefinition();
  const input = { ticket_text: "My API returns 500 on /payments endpoint." };

  const baselineStore = new SqliteExecutionHistoryStore({ path: sqlitePath });
  const baselineExecutionId = "story-6-2-lighthouse-baseline";
  const baseline = await runPocWorkflow({
    definition,
    input,
    executionId: baselineExecutionId,
    store: baselineStore,
    stubActivityOutputs: {
      classify: { intent: "technical", confidence: 0.9 },
      search_kb: { snippets: [{ id: "kb-42" }] },
    },
  });
  assert.equal(baseline.status, "completed", "baseline run must complete");
  const baselineResult = baseline.result;
  baselineStore.close();

  const crashableStoreInner = new SqliteExecutionHistoryStore({ path: sqlitePath });
  const executionId = "story-6-2-lighthouse-crash-resume";
  const crashableStore = new CrashAfterHistorySeqStore(crashableStoreInner, executionId, 9);

  await assert.rejects(
    runPocWorkflow({
      definition,
      input,
      executionId,
      store: crashableStore,
      activityExecutor: {
        async executeActivity(ctx) {
          if (ctx.node.id === "classify") return { ok: true, output: { intent: "technical", confidence: 0.9 } };
          if (ctx.node.id === "search_kb") return { ok: true, output: { snippets: [{ id: "kb-42" }] } };
          return { ok: true, output: {} };
        },
      },
    }),
    /simulated crash/
  );

  const rowsAfterCrash = crashableStoreInner.listByExecution(executionId);
  assert.ok(rowsAfterCrash.some((r) => r.name === "ActivityCompleted" && r.payload.nodeId === "classify"));
  assert.ok(!rowsAfterCrash.some((r) => r.name === "ExecutionFailed"));
  crashableStoreInner.close();

  const recoveredStore = new SqliteExecutionHistoryStore({ path: sqlitePath });
  let restartCalls = 0;
  const recovered = await runPocWorkflow({
    definition,
    input,
    executionId,
    store: recoveredStore,
    activityExecutor: {
      async executeActivity(ctx) {
        restartCalls += 1;
        if (ctx.node.id === "classify") return { ok: false, error: "classify should have replayed from persisted history" };
        if (ctx.node.id === "search_kb") return { ok: true, output: { snippets: [{ id: "kb-42" }] } };
        return { ok: true, output: {} };
      },
    },
  });

  assert.equal(recovered.status, "completed", "recovered run must complete");
  assert.deepEqual(recovered.result, baselineResult, "recovered result must match baseline");
  assert.equal(restartCalls, 1, "restart should only execute search_kb once");

  const recoveredRows = recoveredStore.listByExecution(executionId);
  const replayedCompletions = recoveredRows.filter(
    (r) => r.kind === "event" && r.name === "ActivityCompleted" && r.payload?.replayed === true
  );
  assert.ok(
    replayedCompletions.some((r) => r.payload.nodeId === "classify"),
    "recovery should mark classify completion as replayed"
  );
  assert.equal(recoveredRows.at(-1)?.name, "ExecutionCompleted");

  console.log("Lighthouse replay demo: PASS");
  console.log(`- sqlite history: ${path.relative(repoRoot, sqlitePath)}`);
  console.log(`- baseline result: ${JSON.stringify(baselineResult)}`);
  console.log(`- recovered result: ${JSON.stringify(recovered.result)}`);
  console.log(`- restart live activity calls: ${restartCalls}`);
  console.log(`- recovered tail: ${JSON.stringify(summarizeTail(recoveredRows), null, 2)}`);
  recoveredStore.close();
}

run().catch((error) => {
  console.error("Lighthouse replay demo: FAIL");
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
