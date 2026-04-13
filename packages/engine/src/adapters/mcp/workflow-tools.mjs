import {
  workflowResumeArgsSchema,
  workflowResumeResultSchema,
  workflowStartArgsSchema,
  workflowStartResultSchema,
  workflowStatusArgsSchema,
  workflowStatusResultSchema,
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
function startResponseFromPort(parsed) {
  const response = {
    execution_id: parsed.executionId,
    status: parsed.status,
    ...(parsed.finalState !== undefined ? { final_state: parsed.finalState } : {}),
    ...(parsed.result !== undefined ? { result: parsed.result } : {}),
    ...(parsed.error !== undefined ? { error: parsed.error } : {}),
    ...(parsed.nodeId !== undefined ? { node_id: parsed.nodeId } : {}),
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
  const response = {
    execution_id: parsed.executionId,
    status: parsed.status,
    ...(parsed.finalState !== undefined ? { final_state: parsed.finalState } : {}),
    ...(parsed.result !== undefined ? { result: parsed.result } : {}),
    ...(parsed.error !== undefined ? { error: parsed.error } : {}),
    ...(parsed.nodeId !== undefined ? { node_id: parsed.nodeId } : {}),
  };
  return workflowResumeResultSchema.parse(response);
}

/**
 * @param {{ startWorkflow: Function; getWorkflowStatus: Function; resumeWorkflow: Function }} workflowPort
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
        });

        if (response.status === "failed" && response.error) {
          throw mapEngineFailure(new Error(response.error));
        }

        return {
          content: [{ type: "text", text: `Execution ${response.executionId} ${response.status}.` }],
          structuredContent: startResponseFromPort(response),
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

        return {
          content: [{ type: "text", text: `Execution ${response.executionId} is ${response.phase}.` }],
          structuredContent: statusResponseFromPort(response),
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
        });

        if (response.status === "failed" && response.error) {
          const code = /resume/i.test(response.error)
            ? MCP_ADAPTER_ERROR.INVALID_RESUME_PAYLOAD
            : MCP_ADAPTER_ERROR.ENGINE_FAILURE;
          throw new McpAdapterError(code, response.error);
        }

        return {
          content: [{ type: "text", text: `Execution ${response.executionId} ${response.status} after resume.` }],
          structuredContent: resumeResponseFromPort(response),
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
  };
}
