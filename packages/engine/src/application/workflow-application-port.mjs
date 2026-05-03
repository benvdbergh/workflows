import { randomUUID } from "node:crypto";
import { resumePocWorkflow, runPocWorkflow, submitActivityOutcome } from "../orchestrator/poc-runner.mjs";
import { assertHistoryReadableByEngine } from "../persistence/history-record-schema-version.mjs";

const PRIMARY_EVENT_NAMES = new Set(["ExecutionCompleted", "ExecutionFailed", "InterruptRaised"]);

/**
 * @typedef {object} WorkflowStartRequest
 * @property {string | undefined} executionId
 * @property {object} definition
 * @property {Record<string, unknown>} input
 * @property {"in_process" | "host_mediated"} [activityExecutionMode]
 */

/**
 * @typedef {object} WorkflowStatusRequest
 * @property {string} executionId
 */

/**
 * @typedef {object} WorkflowResumeRequest
 * @property {string} executionId
 * @property {object} definition
 * @property {Record<string, unknown>} resumePayload
 * @property {"in_process" | "host_mediated"} [activityExecutionMode]
 */

/**
 * @typedef {object} WorkflowParallelSpan
 * @property {string} parallelNodeId
 * @property {string} joinTargetId
 * @property {string} branchName
 * @property {string} branchEntryNodeId
 */

/**
 * @typedef {object} WorkflowSubmitActivityRequest
 * @property {string} executionId
 * @property {object} definition
 * @property {Record<string, unknown>} input
 * @property {string} nodeId
 * @property {{ ok: true; result?: Record<string, unknown> } | { ok: false; error: string; code?: string }} outcome
 * @property {WorkflowParallelSpan} [expectedParallelSpan]
 * @property {"in_process" | "host_mediated"} [activityExecutionMode]
 * @property {Record<string, Record<string, unknown>>} [stubActivityOutputs]
 * @property {import("../orchestrator/activity-executor.mjs").ActivityExecutor} [activityExecutor]
 */

/**
 * @typedef {object} WorkflowStartResponse
 * @property {string} executionId
 * @property {"completed" | "failed" | "interrupted" | "awaiting_activity"} status
 * @property {Record<string, unknown> | undefined} finalState
 * @property {unknown} [result]
 * @property {string | undefined} error
 * @property {string | undefined} nodeId
 * @property {Record<string, unknown>} [state] Latest workflow state when status is `awaiting_activity`
 * @property {WorkflowParallelSpan} [parallelSpan] When the pending activity runs under a `parallel` branch
 */

/**
 * @typedef {object} WorkflowStatusResponse
 * @property {string} executionId
 * @property {"running" | "completed" | "failed" | "interrupted" | "awaiting_activity"} phase
 * @property {string | undefined} currentNodeId
 * @property {string | undefined} lastError
 */

/**
 * @typedef {object} WorkflowResumeResponse
 * @property {string} executionId
 * @property {"completed" | "failed" | "interrupted" | "awaiting_activity"} status
 * @property {Record<string, unknown> | undefined} finalState
 * @property {unknown} [result]
 * @property {string | undefined} error
 * @property {string | undefined} nodeId
 * @property {Record<string, unknown>} [state]
 * @property {WorkflowParallelSpan} [parallelSpan]
 */

/**
 * @typedef {object} WorkflowSubmitActivityResponse
 * @property {string} executionId
 * @property {"completed" | "failed" | "interrupted" | "awaiting_activity"} status
 * @property {Record<string, unknown> | undefined} [finalState]
 * @property {unknown} [result]
 * @property {string | undefined} [error]
 * @property {string | undefined} [nodeId]
 * @property {Record<string, unknown>} [state]
 * @property {WorkflowParallelSpan} [parallelSpan]
 * @property {string | undefined} [code] Stable machine code when `status` is `failed` from submit validation
 */

/**
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 */
function latestPrimaryEvent(rows) {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.kind === "event" && PRIMARY_EVENT_NAMES.has(row.name)) {
      return row;
    }
  }
  return undefined;
}

/**
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 */
function latestNodeId(rows) {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (typeof row.payload?.nodeId === "string") {
      return row.payload.nodeId;
    }
  }
  return undefined;
}

/**
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 */
function latestError(rows) {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.name === "ExecutionFailed" && typeof row.payload?.error === "string") {
      return row.payload.error;
    }
  }
  return undefined;
}

/**
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 */
function findLatestNonCheckpointEvent(rows) {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.kind === "event" && row.name === "CheckpointWritten") continue;
    return row;
  }
  return undefined;
}

/**
 * Stable application-facing port for workflow control operations used by interface adapters.
 *
 * @param {{ store: import("../persistence/types.mjs").ExecutionHistoryStore }} deps
 */
export function createWorkflowApplicationPort(deps) {
  const { store } = deps;

  return {
    /**
     * @param {WorkflowStartRequest} request
     * @returns {Promise<WorkflowStartResponse>}
     */
    async startWorkflow(request) {
      const executionId =
        typeof request.executionId === "string" && request.executionId.trim() !== ""
          ? request.executionId
          : randomUUID();

      const runResult = await runPocWorkflow({
        definition: request.definition,
        input: request.input,
        executionId,
        store,
        ...(request.activityExecutionMode ? { activityExecutionMode: request.activityExecutionMode } : {}),
      });

      return {
        executionId,
        status: runResult.status,
        ...(runResult.finalState !== undefined ? { finalState: runResult.finalState } : {}),
        ...(runResult.status === "completed" ? { result: runResult.result } : {}),
        ...(runResult.status === "failed" ? { error: runResult.error } : {}),
        ...(runResult.status === "interrupted"
          ? { nodeId: runResult.nodeId, state: runResult.state }
          : {}),
        ...(runResult.status === "awaiting_activity"
          ? {
              nodeId: runResult.nodeId,
              state: runResult.state,
              ...(runResult.parallelSpan ? { parallelSpan: runResult.parallelSpan } : {}),
            }
          : {}),
      };
    },

    /**
     * @param {WorkflowStatusRequest} request
     * @returns {Promise<WorkflowStatusResponse>}
     */
    async getWorkflowStatus(request) {
      const rows = store.listByExecution(request.executionId);
      assertHistoryReadableByEngine(rows);
      if (rows.length === 0) {
        const err = new Error(`Execution "${request.executionId}" was not found.`);
        err.code = "EXECUTION_NOT_FOUND";
        throw err;
      }

      const lastPrimary = latestPrimaryEvent(rows);
      if (lastPrimary?.name === "ExecutionCompleted") {
        return { executionId: request.executionId, phase: "completed", currentNodeId: undefined, lastError: undefined };
      }
      if (lastPrimary?.name === "ExecutionFailed") {
        return {
          executionId: request.executionId,
          phase: "failed",
          currentNodeId: latestNodeId(rows),
          lastError: latestError(rows),
        };
      }
      if (lastPrimary?.name === "InterruptRaised") {
        return {
          executionId: request.executionId,
          phase: "interrupted",
          currentNodeId: latestNodeId(rows),
          lastError: undefined,
        };
      }
      const lastNc = findLatestNonCheckpointEvent(rows);
      if (lastNc?.kind === "event" && lastNc.name === "ActivityRequested") {
        const nid =
          typeof lastNc.payload?.nodeId === "string" ? lastNc.payload.nodeId : latestNodeId(rows);
        return {
          executionId: request.executionId,
          phase: "awaiting_activity",
          currentNodeId: nid,
          lastError: undefined,
        };
      }
      return {
        executionId: request.executionId,
        phase: "running",
        currentNodeId: latestNodeId(rows),
        lastError: undefined,
      };
    },

    /**
     * @param {WorkflowResumeRequest} request
     * @returns {Promise<WorkflowResumeResponse>}
     */
    async resumeWorkflow(request) {
      const runResult = await resumePocWorkflow({
        definition: request.definition,
        executionId: request.executionId,
        resumePayload: request.resumePayload,
        store,
        ...(request.activityExecutionMode ? { activityExecutionMode: request.activityExecutionMode } : {}),
      });

      return {
        executionId: request.executionId,
        status: runResult.status,
        ...(runResult.finalState !== undefined ? { finalState: runResult.finalState } : {}),
        ...(runResult.status === "completed" ? { result: runResult.result } : {}),
        ...(runResult.status === "failed" ? { error: runResult.error } : {}),
        ...(runResult.status === "interrupted"
          ? { nodeId: runResult.nodeId, state: runResult.state }
          : {}),
        ...(runResult.status === "awaiting_activity"
          ? {
              nodeId: runResult.nodeId,
              state: runResult.state,
              ...(runResult.parallelSpan ? { parallelSpan: runResult.parallelSpan } : {}),
            }
          : {}),
      };
    },

    /**
     * @param {WorkflowSubmitActivityRequest} request
     * @returns {Promise<WorkflowSubmitActivityResponse>}
     */
    async submitWorkflowActivity(request) {
      const result = await submitActivityOutcome({
        definition: request.definition,
        executionId: request.executionId,
        store,
        input: request.input,
        nodeId: request.nodeId,
        outcome: request.outcome,
        expectedParallelSpan: request.expectedParallelSpan,
        ...(request.activityExecutionMode ? { activityExecutionMode: request.activityExecutionMode } : {}),
        ...(request.stubActivityOutputs ? { stubActivityOutputs: request.stubActivityOutputs } : {}),
        ...(request.activityExecutor ? { activityExecutor: request.activityExecutor } : {}),
      });

      return {
        executionId: request.executionId,
        status: result.status,
        ...(result.finalState !== undefined ? { finalState: result.finalState } : {}),
        ...(result.status === "completed" ? { result: result.result } : {}),
        ...(result.status === "failed" ? { error: result.error, ...(result.code ? { code: result.code } : {}) } : {}),
        ...(result.status === "interrupted" || result.status === "awaiting_activity"
          ? {
              nodeId: result.nodeId,
              ...(result.state ? { state: result.state } : {}),
              ...(result.parallelSpan ? { parallelSpan: result.parallelSpan } : {}),
            }
          : {}),
      };
    },
  };
}
