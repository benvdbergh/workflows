import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createMcpWorkflowToolHandlers } from "../src/adapters/mcp/workflow-tools.mjs";
import { createWorkflowApplicationPort } from "../src/application/workflow-application-port.mjs";
import {
  checkpointDefinitionMeta,
  latestCheckpointDefinitionHash,
} from "../src/orchestrator/workflow-graph-walker-support.mjs";
import {
  resumeGraphWorkflow,
  runGraphWorkflow,
  submitActivityOutcome,
} from "../src/orchestrator/workflow-graph-walker.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { findWorkflowRepoRoot } from "../src/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadHostLinear() {
  const root = findWorkflowRepoRoot(__dirname);
  return JSON.parse(readFileSync(path.join(root, "examples", "conformance-host-activity-linear.workflow.json"), "utf8"));
}

describe("definitionHash binding and start idempotency", () => {
  it("rejects duplicate workflow_start execution_id without allow_existing_execution_id", async () => {
    const definition = loadHostLinear();
    const store = new MemoryExecutionHistoryStore();
    const port = createWorkflowApplicationPort({ store });
    const handlers = createMcpWorkflowToolHandlers(port);

    const first = await handlers.workflow_start({
      execution_id: "dup-exec-1",
      definition,
      input: {},
      activity_execution_mode: "host_mediated",
    });
    assert.equal(first.isError, undefined);

    const second = await handlers.workflow_start({
      execution_id: "dup-exec-1",
      definition,
      input: {},
      activity_execution_mode: "host_mediated",
    });
    assert.equal(second.isError, true);
    assert.equal(second.structuredContent.error.code, "DUPLICATE_EXECUTION_ID");
  });

  it("allows duplicate start when allow_existing_execution_id is true", async () => {
    const definition = loadHostLinear();
    const store = new MemoryExecutionHistoryStore();
    const port = createWorkflowApplicationPort({ store });

    await port.startWorkflow({
      executionId: "dup-exec-2",
      definition,
      input: {},
      activityExecutionMode: "host_mediated",
    });

    const second = await port.startWorkflow({
      executionId: "dup-exec-2",
      definition,
      input: {},
      activityExecutionMode: "host_mediated",
      allowExistingExecutionId: true,
    });
    assert.equal(second.status, "awaiting_activity");
  });

  it("submitActivityOutcome rejects tampered definition when checkpoint is bound", async () => {
    const definition = loadHostLinear();
    const meta = checkpointDefinitionMeta(definition);
    const store = new MemoryExecutionHistoryStore();
    const executionId = "submit-tamper-1";

    store.append(executionId, {
      kind: "event",
      name: "CheckpointWritten",
      payload: {
        executionId,
        definitionHash: meta.definitionHash,
        lastAppliedEventSeq: 1,
        nodeId: "start",
        stateRef: { kind: "inline_state", state: {} },
      },
    });
    store.append(executionId, {
      kind: "event",
      name: "ActivityRequested",
      payload: { executionId, nodeId: "work", nodeType: "tool_call" },
    });

    const tampered = {
      ...definition,
      document: { ...definition.document, version: "9.9.9" },
    };
    const result = await submitActivityOutcome({
      definition: tampered,
      executionId,
      store,
      input: {},
      nodeId: "work",
      outcome: { ok: true, result: { out: "x" } },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.code, "SUBMIT_VALIDATION_ERROR");
    assert.match(result.error, /definitionHash/i);
  });

  it("resumeGraphWorkflow rejects tampered definition when checkpoint is bound", async () => {
    const root = findWorkflowRepoRoot(__dirname);
    const definition = JSON.parse(
      readFileSync(path.join(root, "examples", "lighthouse-customer-routing.workflow.json"), "utf8")
    );
    const meta = checkpointDefinitionMeta(definition);
    const store = new MemoryExecutionHistoryStore();
    const executionId = "resume-tamper-1";

    store.append(executionId, {
      kind: "event",
      name: "CheckpointWritten",
      payload: {
        executionId,
        definitionHash: meta.definitionHash,
        lastAppliedEventSeq: 1,
        nodeId: "human_review",
        stateRef: { kind: "inline_state", state: { ticket_text: "x" } },
      },
    });
    store.append(executionId, {
      kind: "event",
      name: "InterruptRaised",
      payload: { executionId, nodeId: "human_review" },
    });

    const tampered = {
      ...definition,
      document: { ...definition.document, version: "9.9.9" },
    };
    const result = await resumeGraphWorkflow({
      definition: tampered,
      executionId,
      store,
      resumePayload: { intent: "billing" },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.code, "INVALID_RESUME_PAYLOAD");
  });

  it("runGraphWorkflow continuation rejects tampered definition when checkpoint is bound", async () => {
    const definition = loadHostLinear();
    const meta = checkpointDefinitionMeta(definition);
    const store = new MemoryExecutionHistoryStore();
    const executionId = "continue-tamper-1";

    store.append(executionId, {
      kind: "command",
      name: "ScheduleNode",
      payload: { executionId, nodeId: "start" },
    });
    store.append(executionId, {
      kind: "event",
      name: "CheckpointWritten",
      payload: {
        executionId,
        definitionHash: meta.definitionHash,
        lastAppliedEventSeq: 2,
        nodeId: "start",
        stateRef: { kind: "inline_state", state: {} },
      },
    });

    const tampered = {
      ...definition,
      document: { ...definition.document, version: "9.9.9" },
    };
    const result = await runGraphWorkflow({
      definition: tampered,
      executionId,
      store,
      input: {},
      activityExecutionMode: "host_mediated",
    });

    assert.equal(result.status, "failed");
    assert.equal(result.code, "SUBMIT_VALIDATION_ERROR");
  });

  it("latestCheckpointDefinitionHash returns the newest checkpoint hash", () => {
    const rows = [
      {
        seq: 1,
        kind: "event",
        name: "CheckpointWritten",
        payload: { definitionHash: "aaa" },
      },
      {
        seq: 2,
        kind: "event",
        name: "CheckpointWritten",
        payload: { definitionHash: "bbb" },
      },
    ];
    assert.equal(latestCheckpointDefinitionHash(rows), "bbb");
  });
});
