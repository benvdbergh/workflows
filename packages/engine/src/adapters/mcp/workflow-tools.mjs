import {
  workflowResumeArgsSchema,
  workflowSignalArgsSchema,
  workflowStartArgsSchema,
  workflowStatusArgsSchema,
  workflowSubmitActivityArgsSchema,
} from "./contracts.mjs";
import { MCP_ADAPTER_ERROR, McpAdapterError, normalizeMcpAdapterError, toToolErrorResult } from "./errors.mjs";
import {
  validateWorkflowResumeTransportPayload,
  validateWorkflowStartTransportPayload,
} from "./transport-validation.mjs";
import {
  resumeResponseFromPort,
  signalResponseFromPort,
  startResponseFromPort,
  statusResponseFromPort,
  submitActivityResponseFromPort,
} from "../transport-response.mjs";
import { ZodError } from "zod";

/**
 * @param {unknown} error
 * @returns {McpAdapterError}
 */
function mapEngineFailure(error) {
  return new McpAdapterError(MCP_ADAPTER_ERROR.ENGINE_FAILURE, "Engine reported a workflow failure.", {
    cause: error instanceof Error ? error.message : String(error),
  });
}

/**
 * @param {string | undefined} code
 * @param {string | undefined} message
 */
function mcpErrorForStartFailure(code, message) {
  const text = message && message.trim() !== "" ? message : "Workflow start failed.";
  if (code === MCP_ADAPTER_ERROR.VALIDATION_ERROR || code === "VALIDATION_ERROR") {
    return new McpAdapterError(MCP_ADAPTER_ERROR.VALIDATION_ERROR, text, { engineCode: code });
  }
  return mapEngineFailure(new Error(text));
}

/**
 * @param {string | undefined} code
 * @param {string | undefined} message
 */
function mcpErrorForResumeFailure(code, message) {
  const text = message && message.trim() !== "" ? message : "Resume request failed.";
  if (code === MCP_ADAPTER_ERROR.INVALID_RESUME_PAYLOAD) {
    return new McpAdapterError(MCP_ADAPTER_ERROR.INVALID_RESUME_PAYLOAD, text);
  }
  return mapEngineFailure(new Error(text));
}

/**
 * Many MCP hosts surface only `content` text to the operator or agent; duplicate the
 * transport contract object into that text so `result` / `final_state` remain visible
 * without structured-result UI.
 *
 * @param {string} headline
 * @param {unknown} structured
 */
function withStructuredJsonInText(headline, structured) {
  return `${headline}\n\nStructured result (JSON):\n${JSON.stringify(structured, null, 2)}`;
}

const SUBMIT_ACTIVITY_ADAPTER_CODES = new Set([
  MCP_ADAPTER_ERROR.ACTIVITY_SUBMIT_NOT_AWAITING,
  MCP_ADAPTER_ERROR.ACTIVITY_SUBMIT_NODE_MISMATCH,
  MCP_ADAPTER_ERROR.ACTIVITY_SUBMIT_PARALLEL_MISMATCH,
  MCP_ADAPTER_ERROR.SUBMIT_VALIDATION_ERROR,
]);

const SIGNAL_ADAPTER_CODES = new Set([
  MCP_ADAPTER_ERROR.SIGNAL_NOT_AWAITING,
  MCP_ADAPTER_ERROR.SIGNAL_NAME_MISMATCH,
  MCP_ADAPTER_ERROR.SIGNAL_VALIDATION_ERROR,
]);

/**
 * @param {string | undefined} code
 * @param {string | undefined} message
 */
function mcpErrorForSubmitFailure(code, message) {
  const text = message && message.trim() !== "" ? message : "Activity submit rejected.";
  if (code && SUBMIT_ACTIVITY_ADAPTER_CODES.has(code)) {
    return new McpAdapterError(code, text);
  }
  return mapEngineFailure(new Error(text));
}

/**
 * @param {string | undefined} code
 * @param {string | undefined} message
 */
function mcpErrorForSignalFailure(code, message) {
  const text = message && message.trim() !== "" ? message : "Signal delivery rejected.";
  if (code && SIGNAL_ADAPTER_CODES.has(code)) {
    return new McpAdapterError(code, text);
  }
  return mapEngineFailure(new Error(text));
}

/**
 * @param {{ startWorkflow: Function; getWorkflowStatus: Function; resumeWorkflow: Function; submitWorkflowActivity: Function; signalWorkflow: Function }} workflowPort
 */
export function createMcpWorkflowToolHandlers(workflowPort) {
  return {
    async workflow_start(args) {
      try {
        const parsed = workflowStartArgsSchema.parse(args);
        validateWorkflowStartTransportPayload(parsed.definition, parsed.input);
        const response = await workflowPort.startWorkflow({
          executionId: parsed.execution_id,
          definition: parsed.definition,
          input: parsed.input,
          ...(parsed.activity_execution_mode ? { activityExecutionMode: parsed.activity_execution_mode } : {}),
          ...(parsed.allow_existing_execution_id === true
            ? { allowExistingExecutionId: true }
            : {}),
        });

        if (response.status === "failed" && response.error) {
          throw mcpErrorForStartFailure(response.code, response.error);
        }

        const structured = startResponseFromPort(response);
        return {
          content: [
            {
              type: "text",
              text: withStructuredJsonInText(`Execution ${response.executionId} ${response.status}.`, structured),
            },
          ],
          structuredContent: structured,
        };
      } catch (error) {
        const adapted =
          error instanceof ZodError
            ? new McpAdapterError(MCP_ADAPTER_ERROR.VALIDATION_ERROR, "Invalid workflow_start arguments.", {
                issues: error.issues,
              })
            : normalizeMcpAdapterError(error);
        return toToolErrorResult(adapted);
      }
    },

    async workflow_status(args) {
      try {
        const parsed = workflowStatusArgsSchema.parse(args);
        const response = await workflowPort.getWorkflowStatus({
          executionId: parsed.execution_id,
        });

        const structured = statusResponseFromPort(response);
        return {
          content: [
            {
              type: "text",
              text: withStructuredJsonInText(`Execution ${response.executionId} is ${response.phase}.`, structured),
            },
          ],
          structuredContent: structured,
        };
      } catch (error) {
        const adapted =
          error instanceof ZodError
            ? new McpAdapterError(MCP_ADAPTER_ERROR.VALIDATION_ERROR, "Invalid workflow_status arguments.", {
                issues: error.issues,
              })
            : normalizeMcpAdapterError(error);
        return toToolErrorResult(adapted);
      }
    },

    async workflow_resume(args) {
      try {
        const parsed = workflowResumeArgsSchema.parse(args);
        validateWorkflowResumeTransportPayload(parsed.definition, parsed.resume_payload);
        const response = await workflowPort.resumeWorkflow({
          executionId: parsed.execution_id,
          definition: parsed.definition,
          resumePayload: parsed.resume_payload,
          ...(parsed.activity_execution_mode ? { activityExecutionMode: parsed.activity_execution_mode } : {}),
        });

        if (response.status === "failed") {
          throw mcpErrorForResumeFailure(response.code, response.error);
        }

        const structured = resumeResponseFromPort(response);
        return {
          content: [
            {
              type: "text",
              text: withStructuredJsonInText(
                `Execution ${response.executionId} ${response.status} after resume.`,
                structured
              ),
            },
          ],
          structuredContent: structured,
        };
      } catch (error) {
        const adapted =
          error instanceof ZodError
            ? new McpAdapterError(MCP_ADAPTER_ERROR.VALIDATION_ERROR, "Invalid workflow_resume arguments.", {
                issues: error.issues,
              })
            : normalizeMcpAdapterError(error);
        return toToolErrorResult(adapted);
      }
    },

    async workflow_submit_activity(args) {
      try {
        const parsed = workflowSubmitActivityArgsSchema.parse(args);
        const expectedParallelSpan = parsed.parallel_span
          ? {
              parallelNodeId: parsed.parallel_span.parallel_node_id,
              joinTargetId: parsed.parallel_span.join_target_id,
              branchName: parsed.parallel_span.branch_name,
              branchEntryNodeId: parsed.parallel_span.branch_entry_node_id,
            }
          : undefined;

        const response = await workflowPort.submitWorkflowActivity({
          executionId: parsed.execution_id,
          definition: parsed.definition,
          input: parsed.input,
          nodeId: parsed.node_id,
          outcome:
            parsed.outcome.ok === true
              ? {
                  ok: true,
                  ...(parsed.outcome.result !== undefined ? { result: parsed.outcome.result } : {}),
                  ...(parsed.outcome.delegate_correlation_id !== undefined
                    ? { delegateCorrelationId: parsed.outcome.delegate_correlation_id }
                    : {}),
                  ...(parsed.outcome.external_task_id !== undefined
                    ? { externalTaskId: parsed.outcome.external_task_id }
                    : {}),
                }
              : parsed.outcome,
          ...(expectedParallelSpan ? { expectedParallelSpan } : {}),
          ...(parsed.activity_execution_mode ? { activityExecutionMode: parsed.activity_execution_mode } : {}),
        });

        if (response.status === "failed") {
          throw mcpErrorForSubmitFailure(response.code, response.error);
        }

        const structured = submitActivityResponseFromPort(response);
        return {
          content: [
            {
              type: "text",
              text: withStructuredJsonInText(
                `Execution ${response.executionId} ${response.status} after activity submit.`,
                structured
              ),
            },
          ],
          structuredContent: structured,
        };
      } catch (error) {
        const adapted =
          error instanceof ZodError
            ? new McpAdapterError(MCP_ADAPTER_ERROR.VALIDATION_ERROR, "Invalid workflow_submit_activity arguments.", {
                issues: error.issues,
              })
            : normalizeMcpAdapterError(error);
        return toToolErrorResult(adapted);
      }
    },

    async workflow_signal(args) {
      try {
        const parsed = workflowSignalArgsSchema.parse(args);
        const response = await workflowPort.signalWorkflow({
          executionId: parsed.execution_id,
          definition: parsed.definition,
          input: parsed.input,
          signalName: parsed.signal_name,
          ...(parsed.payload !== undefined ? { payload: parsed.payload } : {}),
          ...(parsed.activity_execution_mode ? { activityExecutionMode: parsed.activity_execution_mode } : {}),
        });

        if (response.status === "failed") {
          throw mcpErrorForSignalFailure(response.code, response.error);
        }

        const structured = signalResponseFromPort(response);
        return {
          content: [
            {
              type: "text",
              text: withStructuredJsonInText(
                `Execution ${response.executionId} ${response.status} after signal delivery.`,
                structured
              ),
            },
          ],
          structuredContent: structured,
        };
      } catch (error) {
        const adapted =
          error instanceof ZodError
            ? new McpAdapterError(MCP_ADAPTER_ERROR.VALIDATION_ERROR, "Invalid workflow_signal arguments.", {
                issues: error.issues,
              })
            : normalizeMcpAdapterError(error);
        return toToolErrorResult(adapted);
      }
    },
  };
}
