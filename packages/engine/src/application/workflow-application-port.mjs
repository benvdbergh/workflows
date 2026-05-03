import { randomUUID } from "node:crypto";
import { resumePocWorkflow, runPocWorkflow } from "../orchestrator/poc-runner.mjs";
import { assertHistoryReadableByEngine } from "../persistence/history-record-schema-version.mjs";

const PRIMARY_EVENT_NAMES = new Set(["ExecutionCompleted", "ExecutionFailed", "InterruptRaised"]);

/**
 * @typedef {object} WorkflowStartRequest
 * @property {string | undefined} executionId
 * @property {object} definition
 * @property {Record<string, unknown>} input
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
 */

/**
 * @typedef {object} WorkflowStartResponse
 * @property {string} executionId
 * @property {"completed" | "failed" | "interrupted"} status
 * @property {Record<string, unknown> | undefined} finalState
 * @property {unknown} [result]
 * @property {string | undefined} error
 * @property {string | undefined} nodeId
 */

/**
 * @typedef {object} WorkflowStatusResponse
 * @property {string} executionId
 * @property {"running" | "completed" | "failed" | "interrupted"} phase
 * @property {string | undefined} currentNodeId
 * @property {string | undefined} lastError
 */

/**
 * @typedef {object} WorkflowResumeResponse
 * @property {string} executionId
 * @property {"completed" | "failed" | "interrupted"} status
 * @property {Record<string, unknown> | undefined} finalState
 * @property {unknown} [result]
 * @property {string | undefined} error
 * @property {string | undefined} nodeId
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
      });

      return {
        executionId,
        status: runResult.status,
        finalState: runResult.finalState,
        ...(runResult.status === "completed" ? { result: runResult.result } : {}),
        ...(runResult.status === "failed" ? { error: runResult.error } : {}),
        ...(runResult.status === "interrupted" ? { nodeId: runResult.nodeId } : {}),
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
      });

      return {
        executionId: request.executionId,
        status: runResult.status,
        finalState: runResult.finalState,
        ...(runResult.status === "completed" ? { result: runResult.result } : {}),
        ...(runResult.status === "failed" ? { error: runResult.error } : {}),
        ...(runResult.status === "interrupted" ? { nodeId: runResult.nodeId } : {}),
      };
    },
  };
}
