import { randomUUID } from "node:crypto";
import { cancelExecutionOutcome, deliverSignalOutcome, resumeGraphWorkflow, runGraphWorkflow, submitActivityOutcome } from "../orchestrator/workflow-graph-walker.mjs";
import { assertHistoryReadableByEngine } from "../persistence/history-record-schema-version.mjs";
import { parseExecutionListCursor, projectExecutionStatusDetails, findLatestNonCheckpointEvent } from "../persistence/execution-list-support.mjs";
import { RedactingExecutionHistoryStore } from "../persistence/redacting-history-store.mjs";

/**
 * @typedef {object} WorkflowStartRequest
 * @property {string | undefined} executionId
 * @property {object} definition
 * @property {Record<string, unknown>} input
 * @property {"in_process" | "host_mediated"} [activityExecutionMode]
 * @property {boolean} [allowExistingExecutionId] When true, `workflow_start` may target an execution id that already has history (replay/idempotency). Default false rejects duplicates.
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
 * @property {import("../orchestrator/delegate-executor.mjs").DelegateExecutor} [delegateExecutor]
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
 * @property {{ ok: true; result?: Record<string, unknown>; delegateCorrelationId?: string; externalTaskId?: string } | { ok: false; error: string; code?: string }} outcome
 * @property {WorkflowParallelSpan} [expectedParallelSpan]
 * @property {"in_process" | "host_mediated"} [activityExecutionMode]
 * @property {Record<string, Record<string, unknown>>} [stubActivityOutputs]
 * @property {import("../orchestrator/activity-executor.mjs").ActivityExecutor} [activityExecutor]
 */

/**
 * @typedef {object} WorkflowStartResponse
 * @property {string} executionId
 * @property {"completed" | "failed" | "interrupted" | "awaiting_activity" | "awaiting_signal" | "cancelled"} status
 * @property {Record<string, unknown> | undefined} finalState
 * @property {unknown} [result]
 * @property {string | undefined} error
 * @property {string | undefined} nodeId
 * @property {Record<string, unknown>} [state] Latest workflow state when status is `awaiting_activity`
 * @property {WorkflowParallelSpan} [parallelSpan] When the pending activity runs under a `parallel` branch
 * @property {string} [agentId] Pending `agent_delegate` target agent id
 * @property {string} [protocol] Pending `agent_delegate` protocol (`a2a`, `mcp`, `sdk`)
 * @property {Record<string, unknown>} [delegateInput] Resolved delegate input from `input_mapping`
 * @property {string} [delegateCorrelationId] Pending delegate correlation id
 */

/**
 * @typedef {object} WorkflowStatusResponse
 * @property {string} executionId
 * @property {"running" | "completed" | "failed" | "interrupted" | "awaiting_activity" | "awaiting_signal" | "cancelled"} phase
 * @property {string | undefined} currentNodeId
 * @property {string | undefined} lastError
 * @property {string | undefined} [delegateCorrelationId] Latest agent_delegate activity correlation
 * @property {string | undefined} [childExecutionId] Active or latest nested child execution id
 * @property {string | undefined} [parentExecutionId] Parent execution when nested or subworkflow context exists
 * @property {string | undefined} [agentId] Pending `agent_delegate` target agent id when phase is `awaiting_activity`
 * @property {string | undefined} [protocol] Pending delegate protocol when phase is `awaiting_activity`
 * @property {Record<string, unknown>} [delegateInput] Resolved delegate input when phase is `awaiting_activity`
 * @property {string} [signalName] Pending signal name when phase is `awaiting_signal`
 */

/**
 * @typedef {object} WorkflowCancelRequest
 * @property {string} executionId
 * @property {string} [reason]
 */

/**
 * @typedef {object} WorkflowCancelResponse
 * @property {string} executionId
 * @property {"cancelled" | "failed"} status
 * @property {Record<string, unknown> | undefined} [finalState]
 * @property {string | undefined} [error]
 * @property {string | undefined} [code]
 * @property {string} [reason]
 */

/**
 * @typedef {object} WorkflowListRequest
 * @property {"running" | "completed" | "failed" | "interrupted" | "awaiting_activity" | "awaiting_signal" | "cancelled"} [phase]
 * @property {string} [definitionName]
 * @property {string} [updatedAfter]
 * @property {string} [updatedBefore]
 * @property {number} [limit]
 * @property {string} [cursor]
 */

/**
 * @typedef {object} WorkflowListExecutionSummary
 * @property {string} executionId
 * @property {"running" | "completed" | "failed" | "interrupted" | "awaiting_activity" | "awaiting_signal" | "cancelled"} phase
 * @property {string} [definitionName]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {object} WorkflowListResponse
 * @property {WorkflowListExecutionSummary[]} executions
 * @property {string} [nextCursor]
 */

/**
 * @typedef {object} WorkflowResumeResponse
 * @property {string} executionId
 * @property {"completed" | "failed" | "interrupted" | "awaiting_activity" | "awaiting_signal" | "cancelled"} status
 * @property {Record<string, unknown> | undefined} finalState
 * @property {unknown} [result]
 * @property {string | undefined} error
 * @property {string | undefined} [code] Stable machine code when `status` is `failed`
 * @property {string | undefined} nodeId
 * @property {Record<string, unknown>} [state]
 * @property {WorkflowParallelSpan} [parallelSpan]
 * @property {string} [agentId]
 * @property {string} [protocol]
 * @property {Record<string, unknown>} [delegateInput]
 * @property {string} [delegateCorrelationId]
 */

/**
 * @typedef {object} WorkflowSignalRequest
 * @property {string} executionId
 * @property {object} definition
 * @property {Record<string, unknown>} input
 * @property {string} signalName
 * @property {Record<string, unknown>} [payload]
 * @property {"in_process" | "host_mediated"} [activityExecutionMode]
 * @property {Record<string, Record<string, unknown>>} [stubActivityOutputs]
 * @property {import("../orchestrator/activity-executor.mjs").ActivityExecutor} [activityExecutor]
 */

/**
 * @typedef {object} WorkflowSignalResponse
 * @property {string} executionId
 * @property {"completed" | "failed" | "interrupted" | "awaiting_activity" | "awaiting_signal" | "cancelled"} status
 * @property {Record<string, unknown> | undefined} [finalState]
 * @property {unknown} [result]
 * @property {string | undefined} [error]
 * @property {string | undefined} [nodeId]
 * @property {Record<string, unknown>} [state]
 * @property {WorkflowParallelSpan} [parallelSpan]
 * @property {string | undefined} [code]
 * @property {string} [agentId]
 * @property {string} [protocol]
 * @property {Record<string, unknown>} [delegateInput]
 * @property {string} [delegateCorrelationId]
 * @property {string} [signalName]
 */

/**
 * @typedef {object} WorkflowSubmitActivityResponse
 * @property {string} executionId
 * @property {"completed" | "failed" | "interrupted" | "awaiting_activity" | "awaiting_signal" | "cancelled"} status
 * @property {Record<string, unknown> | undefined} [finalState]
 * @property {unknown} [result]
 * @property {string | undefined} [error]
 * @property {string | undefined} [nodeId]
 * @property {Record<string, unknown>} [state]
 * @property {WorkflowParallelSpan} [parallelSpan]
 * @property {string | undefined} [code] Stable machine code when `status` is `failed` from submit validation
 * @property {string} [agentId]
 * @property {string} [protocol]
 * @property {Record<string, unknown>} [delegateInput]
 * @property {string} [delegateCorrelationId]
 */

/**
 * @param {{
 *   agentId?: string;
 *   protocol?: string;
 *   delegateInput?: Record<string, unknown>;
 *   delegateCorrelationId?: string;
 * }} runResult
 */
function awaitingDelegateFromRunResult(runResult) {
  return {
    ...(runResult.agentId !== undefined ? { agentId: runResult.agentId } : {}),
    ...(runResult.protocol !== undefined ? { protocol: runResult.protocol } : {}),
    ...(runResult.delegateInput !== undefined ? { delegateInput: runResult.delegateInput } : {}),
    ...(runResult.delegateCorrelationId !== undefined
      ? { delegateCorrelationId: runResult.delegateCorrelationId }
      : {}),
  };
}

/**
 * @param {{ nodeId?: string; state?: Record<string, unknown>; signalName?: string; reason?: string }} runResult
 */
function awaitingSignalFromRunResult(runResult) {
  return {
    ...(runResult.nodeId !== undefined ? { nodeId: runResult.nodeId } : {}),
    ...(runResult.state !== undefined ? { state: runResult.state } : {}),
    ...(runResult.signalName !== undefined ? { signalName: runResult.signalName } : {}),
  };
}

const CHILD_EXECUTION_MARKER = ":sub:";

/**
 * @param {string} executionId
 * @returns {{ parentExecutionId: string; nodeId: string } | undefined}
 */
function parseChildExecutionId(executionId) {
  const idx = executionId.lastIndexOf(CHILD_EXECUTION_MARKER);
  if (idx <= 0) {
    return undefined;
  }
  return {
    parentExecutionId: executionId.slice(0, idx),
    nodeId: executionId.slice(idx + CHILD_EXECUTION_MARKER.length),
  };
}

/**
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 */
function latestDelegateCorrelationId(rows) {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.kind !== "event") continue;
    if (row.name !== "ActivityRequested" && row.name !== "ActivityCompleted") continue;
    if (row.payload?.nodeType !== "agent_delegate") continue;
    const correlationId = row.payload?.delegateCorrelationId;
    if (typeof correlationId === "string") {
      return correlationId;
    }
  }
  return undefined;
}

/**
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @param {string} executionId
 */
function latestSubworkflowCorrelation(rows, executionId) {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.kind === "event" && (row.name === "SubworkflowStarted" || row.name === "SubworkflowCompleted")) {
      const childExecutionId = row.payload?.childExecutionId;
      const parentExecutionId = row.payload?.parentExecutionId;
      if (typeof childExecutionId === "string" && typeof parentExecutionId === "string") {
        return { childExecutionId, parentExecutionId };
      }
    }
    if (row.kind === "command" && row.name === "StartSubworkflow") {
      const childExecutionId = row.payload?.childExecutionId;
      if (typeof childExecutionId === "string") {
        return { childExecutionId, parentExecutionId: executionId };
      }
    }
  }
  const parsed = parseChildExecutionId(executionId);
  if (parsed) {
    return { childExecutionId: executionId, parentExecutionId: parsed.parentExecutionId };
  }
  return undefined;
}

/**
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @returns {Pick<WorkflowStatusResponse, "agentId" | "protocol" | "delegateInput" | "delegateCorrelationId">}
 */
function latestAwaitingDelegateContext(rows) {
  const last = findLatestNonCheckpointEvent(rows);
  if (!last || last.kind !== "event" || last.name !== "ActivityRequested") {
    return {};
  }
  if (last.payload?.nodeType !== "agent_delegate") {
    return {};
  }
  /** @type {Pick<WorkflowStatusResponse, "agentId" | "protocol" | "delegateInput" | "delegateCorrelationId">} */
  const ctx = {};
  if (typeof last.payload?.agentId === "string") {
    ctx.agentId = last.payload.agentId;
  }
  if (typeof last.payload?.protocol === "string") {
    ctx.protocol = last.payload.protocol;
  }
  if (
    last.payload?.delegateInput &&
    typeof last.payload.delegateInput === "object" &&
    !Array.isArray(last.payload.delegateInput)
  ) {
    ctx.delegateInput = /** @type {Record<string, unknown>} */ (
      JSON.parse(JSON.stringify(last.payload.delegateInput))
    );
  }
  if (typeof last.payload?.delegateCorrelationId === "string") {
    ctx.delegateCorrelationId = last.payload.delegateCorrelationId;
  }
  return ctx;
}

/**
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @param {string} executionId
 */
function projectStatusCorrelation(rows, executionId) {
  /** @type {Pick<WorkflowStatusResponse, "delegateCorrelationId" | "childExecutionId" | "parentExecutionId" | "agentId" | "protocol" | "delegateInput">} */
  const correlation = {};
  const delegateCorrelationId = latestDelegateCorrelationId(rows);
  if (delegateCorrelationId) {
    correlation.delegateCorrelationId = delegateCorrelationId;
  }
  const awaitingDelegate = latestAwaitingDelegateContext(rows);
  if (awaitingDelegate.agentId) {
    correlation.agentId = awaitingDelegate.agentId;
  }
  if (awaitingDelegate.protocol) {
    correlation.protocol = awaitingDelegate.protocol;
  }
  if (awaitingDelegate.delegateInput) {
    correlation.delegateInput = awaitingDelegate.delegateInput;
  }
  if (awaitingDelegate.delegateCorrelationId && !correlation.delegateCorrelationId) {
    correlation.delegateCorrelationId = awaitingDelegate.delegateCorrelationId;
  }
  const subworkflow = latestSubworkflowCorrelation(rows, executionId);
  if (subworkflow?.childExecutionId) {
    correlation.childExecutionId = subworkflow.childExecutionId;
  }
  if (subworkflow?.parentExecutionId) {
    correlation.parentExecutionId = subworkflow.parentExecutionId;
  }
  return correlation;
}

/**
 * @param {string} executionId
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @param {Omit<WorkflowStatusResponse, "executionId" | "delegateCorrelationId" | "childExecutionId" | "parentExecutionId">} body
 * @returns {WorkflowStatusResponse}
 */
function buildStatusResponse(executionId, rows, body) {
  return {
    executionId,
    ...body,
    ...projectStatusCorrelation(rows, executionId),
  };
}

/**
 * Stable application-facing port for workflow control operations used by interface adapters.
 *
 * @param {{
 *   store: import("../persistence/types.mjs").ExecutionHistoryStore;
 *   activityExecutor?: import("../orchestrator/activity-executor.mjs").ActivityExecutor;
 *   delegateExecutor?: import("../orchestrator/delegate-executor.mjs").DelegateExecutor;
 * }} deps
 * Optional `activityExecutor` runs `tool_call` nodes in-process (e.g. MCP manifest executor); omit to use the stub executor.
 * Optional `delegateExecutor` runs `agent_delegate` nodes; omit to use the mock A2A delegate executor.
 */
export function createWorkflowApplicationPort(deps) {
  const store =
    deps.store instanceof RedactingExecutionHistoryStore
      ? deps.store
      : new RedactingExecutionHistoryStore(deps.store);
  const { activityExecutor, delegateExecutor } = deps;

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

      const existingRows = store.listByExecution(executionId);
      assertHistoryReadableByEngine(existingRows);
      if (existingRows.length > 0 && request.allowExistingExecutionId !== true) {
        const err = new Error(
          `Execution "${executionId}" already exists. Pass allowExistingExecutionId to continue or replay against existing history.`
        );
        err.code = "DUPLICATE_EXECUTION_ID";
        throw err;
      }

      const runResult = await runGraphWorkflow({
        definition: request.definition,
        input: request.input,
        executionId,
        store,
        ...(activityExecutor ? { activityExecutor } : {}),
        ...(delegateExecutor ? { delegateExecutor } : {}),
        ...(request.activityExecutionMode ? { activityExecutionMode: request.activityExecutionMode } : {}),
      });

      return {
        executionId,
        status: runResult.status,
        ...(runResult.finalState !== undefined ? { finalState: runResult.finalState } : {}),
        ...(runResult.status === "completed" ? { result: runResult.result } : {}),
        ...(runResult.status === "failed"
          ? { error: runResult.error, ...(runResult.code ? { code: runResult.code } : {}) }
          : {}),
        ...(runResult.status === "interrupted"
          ? { nodeId: runResult.nodeId, state: runResult.state }
          : {}),
        ...(runResult.status === "awaiting_activity"
          ? {
              nodeId: runResult.nodeId,
              state: runResult.state,
              ...(runResult.parallelSpan ? { parallelSpan: runResult.parallelSpan } : {}),
              ...awaitingDelegateFromRunResult(runResult),
            }
          : {}),
        ...(runResult.status === "awaiting_signal" ? awaitingSignalFromRunResult(runResult) : {}),
        ...(runResult.status === "cancelled" && runResult.reason ? { reason: runResult.reason } : {}),
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

      const details = projectExecutionStatusDetails(rows);
      return buildStatusResponse(request.executionId, rows, {
        phase: details.phase,
        currentNodeId: details.currentNodeId,
        lastError: details.lastError,
        ...(details.signalName ? { signalName: details.signalName } : {}),
      });
    },

    /**
     * @param {WorkflowResumeRequest} request
     * @returns {Promise<WorkflowResumeResponse>}
     */
    async resumeWorkflow(request) {
      const resumeDelegate = request.delegateExecutor ?? delegateExecutor;
      const runResult = await resumeGraphWorkflow({
        definition: request.definition,
        executionId: request.executionId,
        resumePayload: request.resumePayload,
        store,
        ...(activityExecutor ? { activityExecutor } : {}),
        ...(request.activityExecutionMode ? { activityExecutionMode: request.activityExecutionMode } : {}),
        ...(resumeDelegate ? { delegateExecutor: resumeDelegate } : {}),
      });

      return {
        executionId: request.executionId,
        status: runResult.status,
        ...(runResult.finalState !== undefined ? { finalState: runResult.finalState } : {}),
        ...(runResult.status === "completed" ? { result: runResult.result } : {}),
        ...(runResult.status === "failed"
          ? { error: runResult.error, ...(runResult.code ? { code: runResult.code } : {}) }
          : {}),
        ...(runResult.status === "interrupted"
          ? { nodeId: runResult.nodeId, state: runResult.state }
          : {}),
        ...(runResult.status === "awaiting_activity"
          ? {
              nodeId: runResult.nodeId,
              state: runResult.state,
              ...(runResult.parallelSpan ? { parallelSpan: runResult.parallelSpan } : {}),
              ...awaitingDelegateFromRunResult(runResult),
            }
          : {}),
        ...(runResult.status === "awaiting_signal" ? awaitingSignalFromRunResult(runResult) : {}),
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
        ...(!request.activityExecutor && activityExecutor ? { activityExecutor } : {}),
        ...(delegateExecutor ? { delegateExecutor } : {}),
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
              ...awaitingDelegateFromRunResult(result),
            }
          : {}),
        ...(result.status === "awaiting_signal" ? awaitingSignalFromRunResult(result) : {}),
      };
    },

    /**
     * @param {WorkflowSignalRequest} request
     * @returns {Promise<WorkflowSignalResponse>}
     */
    async signalWorkflow(request) {
      const result = await deliverSignalOutcome({
        definition: request.definition,
        executionId: request.executionId,
        store,
        input: request.input,
        signalName: request.signalName,
        ...(request.payload !== undefined ? { payload: request.payload } : {}),
        ...(request.activityExecutionMode ? { activityExecutionMode: request.activityExecutionMode } : {}),
        ...(request.stubActivityOutputs ? { stubActivityOutputs: request.stubActivityOutputs } : {}),
        ...(request.activityExecutor ? { activityExecutor: request.activityExecutor } : {}),
        ...(!request.activityExecutor && activityExecutor ? { activityExecutor } : {}),
        ...(delegateExecutor ? { delegateExecutor } : {}),
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
              ...awaitingDelegateFromRunResult(result),
            }
          : {}),
        ...(result.status === "awaiting_signal" ? awaitingSignalFromRunResult(result) : {}),
      };
    },

    /**
     * @param {WorkflowCancelRequest} request
     * @returns {Promise<WorkflowCancelResponse>}
     */
    async cancelWorkflow(request) {
      const result = await cancelExecutionOutcome({
        executionId: request.executionId,
        store,
        ...(request.reason !== undefined ? { reason: request.reason } : {}),
      });

      return {
        executionId: request.executionId,
        status: result.status,
        ...(result.finalState !== undefined ? { finalState: result.finalState } : {}),
        ...(result.status === "failed"
          ? { error: result.error, ...(result.code ? { code: result.code } : {}) }
          : {}),
        ...(result.status === "cancelled" && result.reason ? { reason: result.reason } : {}),
      };
    },

    /**
     * @param {WorkflowListRequest} request
     * @returns {Promise<WorkflowListResponse>}
     */
    async listWorkflowExecutions(request) {
      if (typeof store.listExecutions !== "function") {
        const err = new Error("Execution history store does not implement listExecutions.");
        err.code = "LIST_NOT_SUPPORTED";
        throw err;
      }
      if (request.cursor !== undefined) {
        try {
          parseExecutionListCursor(request.cursor);
        } catch (cause) {
          const err = new Error("Invalid execution list cursor.");
          err.code = "INVALID_LIST_CURSOR";
          throw err;
        }
      }
      const result = store.listExecutions({
        ...(request.phase !== undefined ? { phase: request.phase } : {}),
        ...(request.definitionName !== undefined ? { definitionName: request.definitionName } : {}),
        ...(request.updatedAfter !== undefined ? { updatedAfter: request.updatedAfter } : {}),
        ...(request.updatedBefore !== undefined ? { updatedBefore: request.updatedBefore } : {}),
        ...(request.limit !== undefined ? { limit: request.limit } : {}),
        ...(request.cursor !== undefined ? { cursor: request.cursor } : {}),
      });
      return {
        executions: result.items.map((item) => ({
          executionId: item.executionId,
          phase: item.phase,
          ...(item.definitionName !== undefined ? { definitionName: item.definitionName } : {}),
          ...(item.updatedAt !== undefined ? { updatedAt: item.updatedAt } : {}),
        })),
        ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {}),
      };
    },
  };
}
