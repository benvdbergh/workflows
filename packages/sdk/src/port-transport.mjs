import {
  MCP_ADAPTER_ERROR,
  normalizeWorkflowIdSlug,
  resumeResponseFromPort,
  startResponseFromPort,
  statusResponseFromPort,
  submitActivityResponseFromPort,
} from "@agent-workflow/engine";
import { SdkError } from "./errors.mjs";

const SUBMIT_ACTIVITY_ADAPTER_CODES = new Set([
  MCP_ADAPTER_ERROR.ACTIVITY_SUBMIT_NOT_AWAITING,
  MCP_ADAPTER_ERROR.ACTIVITY_SUBMIT_NODE_MISMATCH,
  MCP_ADAPTER_ERROR.ACTIVITY_SUBMIT_PARALLEL_MISMATCH,
  MCP_ADAPTER_ERROR.SUBMIT_VALIDATION_ERROR,
]);

/**
 * @param {string | undefined} code
 * @param {string | undefined} message
 */
function sdkErrorForStartFailure(code, message) {
  const text = message && message.trim() !== "" ? message : "Workflow start failed.";
  if (code === MCP_ADAPTER_ERROR.VALIDATION_ERROR || code === "VALIDATION_ERROR") {
    return new SdkError(MCP_ADAPTER_ERROR.VALIDATION_ERROR, text);
  }
  return new SdkError(MCP_ADAPTER_ERROR.ENGINE_FAILURE, "Engine reported a workflow failure.", text);
}

/**
 * @param {string | undefined} code
 * @param {string | undefined} message
 */
function sdkErrorForResumeFailure(code, message) {
  const text = message && message.trim() !== "" ? message : "Resume request failed.";
  if (code === MCP_ADAPTER_ERROR.INVALID_RESUME_PAYLOAD) {
    return new SdkError(MCP_ADAPTER_ERROR.INVALID_RESUME_PAYLOAD, text);
  }
  return new SdkError(MCP_ADAPTER_ERROR.ENGINE_FAILURE, "Engine reported a workflow failure.", text);
}

/**
 * @param {string | undefined} code
 * @param {string | undefined} message
 */
function sdkErrorForSubmitFailure(code, message) {
  const text = message && message.trim() !== "" ? message : "Activity submit rejected.";
  if (code && SUBMIT_ACTIVITY_ADAPTER_CODES.has(code)) {
    return new SdkError(code, text);
  }
  return new SdkError(MCP_ADAPTER_ERROR.ENGINE_FAILURE, "Engine reported a workflow failure.", text);
}

/**
 * @param {unknown} error
 * @returns {SdkError}
 */
function normalizePortError(error) {
  if (error instanceof SdkError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (typeof error?.code === "string") {
    if (error.code === MCP_ADAPTER_ERROR.INVALID_RESUME_PAYLOAD) {
      return new SdkError(MCP_ADAPTER_ERROR.INVALID_RESUME_PAYLOAD, message);
    }
    if (error.code === MCP_ADAPTER_ERROR.EXECUTION_NOT_FOUND || error.code === "EXECUTION_NOT_FOUND") {
      return new SdkError(MCP_ADAPTER_ERROR.EXECUTION_NOT_FOUND, message);
    }
    if (error.code === MCP_ADAPTER_ERROR.DUPLICATE_EXECUTION_ID) {
      return new SdkError(MCP_ADAPTER_ERROR.DUPLICATE_EXECUTION_ID, message);
    }
    if (error.code === MCP_ADAPTER_ERROR.VALIDATION_ERROR) {
      return new SdkError(MCP_ADAPTER_ERROR.VALIDATION_ERROR, message);
    }
  }
  return new SdkError(MCP_ADAPTER_ERROR.INTERNAL_ERROR, "Unexpected internal error in SDK port transport.", message);
}

/**
 * @param {{
 *   startWorkflow: Function;
 *   getWorkflowStatus: Function;
 *   resumeWorkflow: Function;
 *   submitWorkflowActivity: Function;
 * }} port
 */
export function createPortTransport(port) {
  return {
    mode: "port",
  /**
   * @param {object} definition
   */
    async registerDefinition(definition) {
      return { wf_id: deriveWorkflowId(definition), definition };
    },
    /**
     * @param {string} _wfId
     * @param {Record<string, unknown>} body
     */
    async start(_wfId, body) {
      try {
        const response = await port.startWorkflow({
          executionId: typeof body.execution_id === "string" ? body.execution_id : undefined,
          definition: /** @type {object} */ (body.definition),
          input: /** @type {Record<string, unknown>} */ (body.input ?? {}),
          ...(body.activity_execution_mode
            ? { activityExecutionMode: /** @type {"in_process" | "host_mediated"} */ (body.activity_execution_mode) }
            : {}),
          ...(body.allow_existing_execution_id === true ? { allowExistingExecutionId: true } : {}),
        });
        if (response.status === "failed" && response.error) {
          throw sdkErrorForStartFailure(response.code, response.error);
        }
        return startResponseFromPort(response);
      } catch (error) {
        throw normalizePortError(error);
      }
    },
    /**
     * @param {string} executionId
     */
    async getStatus(executionId) {
      try {
        const response = await port.getWorkflowStatus({ executionId });
        return statusResponseFromPort(response);
      } catch (error) {
        throw normalizePortError(error);
      }
    },
    /**
     * @param {string} executionId
     * @param {Record<string, unknown>} body
     */
    async resume(executionId, body) {
      try {
        const response = await port.resumeWorkflow({
          executionId,
          definition: /** @type {object} */ (body.definition),
          resumePayload: /** @type {Record<string, unknown>} */ (body.resume_payload ?? {}),
          ...(body.activity_execution_mode
            ? { activityExecutionMode: /** @type {"in_process" | "host_mediated"} */ (body.activity_execution_mode) }
            : {}),
        });
        if (response.status === "failed") {
          throw sdkErrorForResumeFailure(response.code, response.error);
        }
        return resumeResponseFromPort(response);
      } catch (error) {
        throw normalizePortError(error);
      }
    },
    /**
     * @param {string} executionId
     * @param {Record<string, unknown>} body
     */
    async submitActivity(executionId, body) {
      try {
        const parallelSpan = body.parallel_span;
        const expectedParallelSpan =
          parallelSpan && typeof parallelSpan === "object" && !Array.isArray(parallelSpan)
            ? {
                parallelNodeId: /** @type {string} */ (parallelSpan.parallel_node_id),
                joinTargetId: /** @type {string} */ (parallelSpan.join_target_id),
                branchName: /** @type {string} */ (parallelSpan.branch_name),
                branchEntryNodeId: /** @type {string} */ (parallelSpan.branch_entry_node_id),
              }
            : undefined;
        const outcome = /** @type {{ ok: boolean; result?: Record<string, unknown>; delegate_correlation_id?: string; external_task_id?: string; error?: string; code?: string }} */ (
          body.outcome
        );
        const response = await port.submitWorkflowActivity({
          executionId,
          definition: /** @type {object} */ (body.definition),
          input: /** @type {Record<string, unknown>} */ (body.input ?? {}),
          nodeId: /** @type {string} */ (body.node_id),
          outcome:
            outcome.ok === true
              ? {
                  ok: true,
                  ...(outcome.result !== undefined ? { result: outcome.result } : {}),
                  ...(outcome.delegate_correlation_id !== undefined
                    ? { delegateCorrelationId: outcome.delegate_correlation_id }
                    : {}),
                  ...(outcome.external_task_id !== undefined ? { externalTaskId: outcome.external_task_id } : {}),
                }
              : { ok: false, error: outcome.error ?? "Activity failed.", ...(outcome.code ? { code: outcome.code } : {}) },
          ...(expectedParallelSpan ? { expectedParallelSpan } : {}),
          ...(body.activity_execution_mode
            ? { activityExecutionMode: /** @type {"in_process" | "host_mediated"} */ (body.activity_execution_mode) }
            : {}),
        });
        if (response.status === "failed") {
          throw sdkErrorForSubmitFailure(response.code, response.error);
        }
        return submitActivityResponseFromPort(response);
      } catch (error) {
        throw normalizePortError(error);
      }
    },
  };
}

/**
 * @param {object} definition
 */
function deriveWorkflowId(definition) {
  const name = definition?.document?.name;
  if (typeof name === "string" && name.trim() !== "") {
    const normalized = normalizeWorkflowIdSlug(name);
    if (normalized !== "") {
      return normalized;
    }
  }
  return "workflow";
}
