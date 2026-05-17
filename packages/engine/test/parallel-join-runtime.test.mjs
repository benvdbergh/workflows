import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { runGraphWorkflow } from "../src/orchestrator/workflow-graph-walker.mjs";
import { findWorkflowRepoRoot, validateWorkflowDefinition } from "../src/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadParallelJoinFixture() {
  const root = findWorkflowRepoRoot(__dirname);
  const p = path.join(root, "examples", "r2-research-parallel.workflow.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

describe("runGraphWorkflow (parallel, wait, set_state)", () => {
  it("runs research-style parallel join all with set_state and zero-duration wait", async () => {
    const definition = loadParallelJoinFixture();
    assert.equal(validateWorkflowDefinition(definition).ok, true);

    const store = new MemoryExecutionHistoryStore();
    const executionId = "exec-r2-parallel-demo";

    const out = await runGraphWorkflow({
      definition,
      input: { topic: "widgets" },
      executionId,
      store,
      stubActivityOutputs: {
        plan: {},
        web_collect: { findings: ["web:a"] },
        internal_collect: { findings: ["internal:b"] },
      },
    });

    assert.equal(out.status, "completed");
    assert.deepEqual(out.result, ["web:a", "internal:b"]);
    assert.equal(/** @type {{ phase?: string }} */ (out.finalState).phase, "merged");

    const rows = store.listByExecution(executionId);
    assert.ok(rows.some((r) => r.kind === "command" && r.name === "StartParallel"));
    assert.ok(rows.some((r) => r.kind === "command" && r.name === "JoinParallel"));
    assert.ok(rows.some((r) => r.kind === "event" && r.name === "TimerFired"));
    assert.ok(rows.some((r) => r.kind === "event" && r.name === "ParallelJoined"));

    const branchCp = rows.find(
      (r) =>
        r.kind === "event" &&
        r.name === "CheckpointWritten" &&
        r.payload?.nodeId === "web_collect" &&
        r.payload?.parallelSpan
    );
    assert.ok(branchCp);
    assert.equal(branchCp.payload.parallelSpan.parallelNodeId, "research");
    assert.equal(branchCp.payload.parallelSpan.joinTargetId, "tag");
    assert.equal(branchCp.payload.parallelSpan.branchName, "web");
    assert.equal(branchCp.payload.parallelSpan.branchEntryNodeId, "web_collect");
  });
});
