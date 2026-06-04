import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { runGraphWorkflow } from "../src/orchestrator/workflow-graph-walker.mjs";
import {
  assertNoInterruptInParallelBranch,
  INTERRUPT_IN_PARALLEL_BRANCH_CODE,
  InterruptInParallelBranchError,
} from "../src/orchestrator/workflow-graph-invariants.mjs";
import { findWorkflowRepoRoot, validateWorkflowDefinition } from "../src/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadInvalidFixture() {
  const root = findWorkflowRepoRoot(__dirname);
  const p = path.join(root, "examples", "fixtures.invalid", "interrupt-in-parallel-branch.workflow.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

describe("interrupt inside parallel branch (profile refusal)", () => {
  it("rejects at validateWorkflowDefinition with stable code in message", () => {
    const definition = loadInvalidFixture();
    const result = validateWorkflowDefinition(definition);
    assert.equal(result.ok, false);
    const messages = (result.errors ?? []).map((e) => e.message ?? "").join(" ");
    assert.match(messages, new RegExp(INTERRUPT_IN_PARALLEL_BRANCH_CODE));
  });

  it("assertNoInterruptInParallelBranch throws InterruptInParallelBranchError", () => {
    const definition = loadInvalidFixture();
    assert.throws(
      () => assertNoInterruptInParallelBranch(definition),
      (err) => err instanceof InterruptInParallelBranchError && err.code === INTERRUPT_IN_PARALLEL_BRANCH_CODE
    );
  });

  it("runGraphWorkflow fails before execution when definition includes branch interrupt", async () => {
    const definition = loadInvalidFixture();
    const store = new MemoryExecutionHistoryStore();
    const out = await runGraphWorkflow({
      definition,
      input: {},
      executionId: "exec-interrupt-parallel-refuse",
      store,
    });
    assert.equal(out.status, "failed");
    assert.match(out.error ?? "", new RegExp(INTERRUPT_IN_PARALLEL_BRANCH_CODE));
    assert.equal(out.code, INTERRUPT_IN_PARALLEL_BRANCH_CODE);
    const rows = store.listByExecution("exec-interrupt-parallel-refuse");
    assert.equal(rows.length, 0);
  });
});
