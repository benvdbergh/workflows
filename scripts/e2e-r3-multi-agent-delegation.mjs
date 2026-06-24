import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  A2ADelegateExecutor,
  clearWorkflowRefs,
  MemoryExecutionHistoryStore,
  mintDelegateCorrelationId,
  registerWorkflowRef,
  runGraphWorkflow,
  validateWorkflowDefinition,
} from "../packages/engine/src/index.mjs";
import { createA2AMockHttpServer } from "../packages/engine/test/helpers/a2a-mock-http-server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const parentPath = path.join(repoRoot, "examples", "r3-multi-agent-coding.workflow.json");
const childPath = path.join(repoRoot, "examples", "r3-unit-tests-child.workflow.json");
const executionId = "e2e-r3-multi-agent-delegation";

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function loadDefinition() {
  const definition = loadJson(parentPath);
  const validation = validateWorkflowDefinition(definition);
  assert.equal(validation.ok, true, "r3-multi-agent-coding definition must validate before E2E run");
  return definition;
}

/**
 * @param {import("../packages/engine/test/helpers/a2a-mock-http-server.mjs").ReturnType<typeof createA2AMockHttpServer>} mock
 */
async function withMockA2AServer(mock, fn) {
  const { baseUrl, close } = await mock.listen();
  try {
    await fn(baseUrl);
  } finally {
    await close();
  }
}

async function run() {
  clearWorkflowRefs();
  registerWorkflowRef("urn:awp:wf:unit-tests", loadJson(childPath));

  const definition = loadDefinition();
  const input = { task: "fix bug", repo: "acme/app" };
  const mock = createA2AMockHttpServer();

  await withMockA2AServer(mock, async (baseUrl) => {
    const store = new MemoryExecutionHistoryStore();
    const runResult = await runGraphWorkflow({
      definition,
      input,
      executionId,
      store,
      delegateExecutor: new A2ADelegateExecutor({
        operatorConfig: {
          baseUrl,
          apiKeyEnv: "A2A_TEST_KEY",
          pollIntervalMs: 10,
          pollTimeoutMs: 5_000,
        },
        env: { A2A_TEST_KEY: "secret" },
      }),
      stubActivityOutputs: {
        run_tests: { tests_passed: true },
      },
    });

    assert.equal(runResult.status, "interrupted", "workflow must interrupt at human review");
    assert.equal(runResult.nodeId, "review", "interrupt must be at review node");
    assert.equal(typeof runResult.state?.patch, "string", "implement delegate must write patch to state");
    assert.equal(runResult.state?.tests_passed, true, "verify subworkflow must set tests_passed");

    const rows = store.listByExecution(executionId);
    const implementCompleted = rows.find(
      (r) => r.name === "ActivityCompleted" && r.payload?.nodeId === "implement"
    );
    assert.ok(implementCompleted, "implement must have ActivityCompleted with real A2A delegate");
    assert.equal(implementCompleted.payload?.externalTaskId, "a2a-task-1");
    assert.equal(
      implementCompleted.payload?.delegateCorrelationId,
      mintDelegateCorrelationId(executionId, "implement")
    );
    assert.equal(mock.tasks.size, 1, "mock A2A server must receive exactly one delegated task");

    const interruptRaised = rows.find(
      (r) => r.name === "InterruptRaised" && r.payload?.nodeId === "review"
    );
    assert.ok(interruptRaised, "review interrupt must be raised after verify subworkflow");

    console.log("R3 multi-agent delegation E2E: PASS");
    console.log(`- execution_id: ${executionId}`);
    console.log(`- status: ${runResult.status} at node ${runResult.nodeId}`);
    console.log(`- external_task_id: ${implementCompleted.payload?.externalTaskId}`);
    console.log(`- patch: ${String(runResult.state?.patch).slice(0, 60)}...`);
  });
}

run().catch((error) => {
  console.error("R3 multi-agent delegation E2E: FAIL");
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
