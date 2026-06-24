import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MemoryExecutionHistoryStore,
  runGraphWorkflow,
  submitActivityOutcome,
  validateWorkflowDefinition,
} from "../packages/engine/src/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const lighthousePath = path.join(repoRoot, "examples", "lighthouse-customer-routing.workflow.json");
const executionId = "e2e-lighthouse-host-mediated-tech";

function loadDefinition() {
  const definition = JSON.parse(readFileSync(lighthousePath, "utf8"));
  const validation = validateWorkflowDefinition(definition);
  assert.equal(validation.ok, true, "lighthouse definition must validate before E2E run");
  return definition;
}

function assertTechnicalRouting(store, executionId) {
  const scheduled = store
    .listByExecution(executionId)
    .filter((r) => r.name === "NodeScheduled")
    .map((r) => r.payload.nodeId);
  assert.ok(scheduled.includes("search_kb"), "technical route must schedule search_kb");
  assert.ok(!scheduled.includes("human_review"), "technical route must not schedule human_review");
  assert.ok(!scheduled.includes("open_ticket"), "technical route must not schedule open_ticket");
}

async function run() {
  const definition = loadDefinition();
  const input = { ticket_text: "My API returns 500 on /payments endpoint." };
  const store = new MemoryExecutionHistoryStore();

  const awaitingClassify = await runGraphWorkflow({
    definition,
    input,
    executionId,
    store,
    activityExecutionMode: "host_mediated",
  });
  assert.equal(awaitingClassify.status, "awaiting_activity", "run must yield at first activity");
  assert.equal(awaitingClassify.nodeId, "classify");

  const awaitingSearchKb = await submitActivityOutcome({
    definition,
    executionId,
    store,
    input,
    nodeId: "classify",
    outcome: { ok: true, result: { intent: "technical", confidence: 0.9 } },
    activityExecutionMode: "host_mediated",
  });
  assert.equal(awaitingSearchKb.status, "awaiting_activity", "classify submit must continue to next activity");
  assert.equal(awaitingSearchKb.nodeId, "search_kb");

  const completed = await submitActivityOutcome({
    definition,
    executionId,
    store,
    input,
    nodeId: "search_kb",
    outcome: { ok: true, result: { snippets: [{ id: "kb-42", title: "Payments API 500" }] } },
    activityExecutionMode: "host_mediated",
  });
  assert.equal(completed.status, "completed", "search_kb submit must complete execution");
  assert.deepEqual(completed.result, { intent: "technical", confidence: 0.9 });

  assertTechnicalRouting(store, executionId);

  const rows = store.listByExecution(executionId);
  const activityCompleted = rows.filter((r) => r.kind === "event" && r.name === "ActivityCompleted");
  assert.equal(
    activityCompleted.filter((r) => r.payload?.nodeId === "classify").length,
    1,
    "classify must have exactly one ActivityCompleted"
  );
  assert.equal(
    activityCompleted.filter((r) => r.payload?.nodeId === "search_kb").length,
    1,
    "search_kb must have exactly one ActivityCompleted"
  );
  assert.ok(
    activityCompleted.every((r) => r.payload?.replayed !== true),
    "host-mediated submits must not be replay-only stubs"
  );
  assert.equal(rows.at(-1)?.name, "ExecutionCompleted");

  console.log("Lighthouse host-mediated E2E: PASS");
  console.log(`- execution_id: ${executionId}`);
  console.log(`- result: ${JSON.stringify(completed.result)}`);
  console.log(`- routed nodes: search_kb (technical path)`);
}

run().catch((error) => {
  console.error("Lighthouse host-mediated E2E: FAIL");
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
