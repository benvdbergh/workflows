import {
  workflowResumeArgsSchema,
  workflowResumeResultSchema,
  workflowStartArgsSchema,
  workflowStartResultSchema,
  workflowStatusArgsSchema,
  workflowStatusResultSchema,
  workflowSubmitActivityArgsSchema,
  workflowSubmitActivityResultSchema,
} from "./contracts.mjs";
import { MCP_ADAPTER_ERROR, McpAdapterError, normalizeMcpAdapterError, toToolErrorResult } from "./errors.mjs";
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
 * @param {unknown} parsed
 */
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

function startResponseFromPort(parsed) {
  const parallelSpan = parsed.parallelSpan;
  const response = {
    execution_id: parsed.executionId,
    status: parsed.status,
    ...(parsed.finalState !== undefined ? { final_state: parsed.finalState } : {}),
    ...(parsed.result !== undefined ? { result: parsed.result } : {}),
    ...(parsed.error !== undefined ? { error: parsed.error } : {}),
    ...(parsed.nodeId !== undefined ? { node_id: parsed.nodeId } : {}),
    ...(parsed.state !== undefined ? { state: parsed.state } : {}),
    ...(parallelSpan
      ? {
          parallel_span: {
            parallel_node_id: parallelSpan.parallelNodeId,
            join_target_id: parallelSpan.joinTargetId,
            branch_name: parallelSpan.branchName,
            branch_entry_node_id: parallelSpan.branchEntryNodeId,
          },
        }
      : {}),
  };
  return workflowStartResultSchema.parse(response);
}

/**
 * @param {unknown} parsed
 */
function statusResponseFromPort(parsed) {
  const response = {
    execution_id: parsed.executionId,
    phase: parsed.phase,
    ...(parsed.currentNodeId !== undefined ? { current_node_id: parsed.currentNodeId } : {}),
    ...(parsed.lastError !== undefined ? { last_error: parsed.lastError } : {}),
  };
  return workflowStatusResultSchema.parse(response);
}

/**
 * @param {unknown} parsed
 */
function resumeResponseFromPort(parsed) {
  const parallelSpan = parsed.parallelSpan;
  const response = {
    execution_id: parsed.executionId,
    status: parsed.status,
    ...(parsed.finalState !== undefined ? { final_state: parsed.finalState } : {}),
    ...(parsed.result !== undefined ? { result: parsed.result } : {}),
    ...(parsed.error !== undefined ? { error: parsed.error } : {}),
    ...(parsed.nodeId !== undefined ? { node_id: parsed.nodeId } : {}),
    ...(parsed.state !== undefined ? { state: parsed.state } : {}),
    ...(parallelSpan
      ? {
          parallel_span: {
            parallel_node_id: parallelSpan.parallelNodeId,
            join_target_id: parallelSpan.joinTargetId,
            branch_name: parallelSpan.branchName,
            branch_entry_node_id: parallelSpan.branchEntryNodeId,
          },
        }
      : {}),
  };
  return workflowResumeResultSchema.parse(response);
}

/**
 * @param {unknown} parsed
 */
function submitActivityResponseFromPort(parsed) {
  const parallelSpan = parsed.parallelSpan;
  const response = {
    execution_id: parsed.executionId,
    status: parsed.status,
    ...(parsed.finalState !== undefined ? { final_state: parsed.finalState } : {}),
    ...(parsed.result !== undefined ? { result: parsed.result } : {}),
    ...(parsed.error !== undefined ? { error: parsed.error } : {}),
    ...(parsed.nodeId !== undefined ? { node_id: parsed.nodeId } : {}),
    ...(parsed.state !== undefined ? { state: parsed.state } : {}),
    ...(parsed.code !== undefined ? { code: parsed.code } : {}),
    ...(parallelSpan
      ? {
          parallel_span: {
            parallel_node_id: parallelSpan.parallelNodeId,
            join_target_id: parallelSpan.joinTargetId,
            branch_name: parallelSpan.branchName,
            branch_entry_node_id: parallelSpan.branchEntryNodeId,
          },
        }
      : {}),
  };
  return workflowSubmitActivityResultSchema.parse(response);
}

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
function mcpErrorForSubmitFailure(code, message) {
  const text = message && message.trim() !== "" ? message : "Activity submit rejected.";
  if (code && SUBMIT_ACTIVITY_ADAPTER_CODES.has(code)) {
    return new McpAdapterError(code, text);
  }
  return mapEngineFailure(new Error(text));
}

/**
 * @param {{ startWorkflow: Function; getWorkflowStatus: Function; resumeWorkflow: Function; submitWorkflowActivity: Function }} workflowPort
 */
export function createMcpWorkflowToolHandlers(workflowPort) {
  return {
    async workflow_start(args) {
      try {
        const parsed = workflowStartArgsSchema.parse(args);
        const response = await workflowPort.startWorkflow({
          executionId: parsed.execution_id,
          definition: parsed.definition,
          input: parsed.input,
          ...(parsed.activity_execution_mode ? { activityExecutionMode: parsed.activity_execution_mode } : {}),
        });

        if (response.status === "failed" && response.error) {
          throw mapEngineFailure(new Error(response.error));
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
        const response = await workflowPort.resumeWorkflow({
          executionId: parsed.execution_id,
          definition: parsed.definition,
          resumePayload: parsed.resume_payload,
          ...(parsed.activity_execution_mode ? { activityExecutionMode: parsed.activity_execution_mode } : {}),
        });

        if (response.status === "failed" && response.error) {
          const code = /resume/i.test(response.error)
            ? MCP_ADAPTER_ERROR.INVALID_RESUME_PAYLOAD
            : MCP_ADAPTER_ERROR.ENGINE_FAILURE;
          throw new McpAdapterError(code, response.error);
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
          outcome: parsed.outcome,
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
  };
}
