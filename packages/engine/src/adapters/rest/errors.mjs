import { MCP_ADAPTER_ERROR, McpAdapterError } from "../mcp/errors.mjs";

/**
 * @param {string} code
 * @returns {number}
 */
export function httpStatusForAdapterError(code) {
  switch (code) {
    case MCP_ADAPTER_ERROR.VALIDATION_ERROR:
    case MCP_ADAPTER_ERROR.INVALID_RESUME_PAYLOAD:
    case MCP_ADAPTER_ERROR.SUBMIT_VALIDATION_ERROR:
      return 400;
    case MCP_ADAPTER_ERROR.EXECUTION_NOT_FOUND:
      return 404;
    case "WORKFLOW_NOT_FOUND":
      return 404;
    case MCP_ADAPTER_ERROR.DUPLICATE_EXECUTION_ID:
    case "DUPLICATE_WORKFLOW_ID":
    case MCP_ADAPTER_ERROR.ACTIVITY_SUBMIT_NOT_AWAITING:
    case MCP_ADAPTER_ERROR.ACTIVITY_SUBMIT_NODE_MISMATCH:
    case MCP_ADAPTER_ERROR.ACTIVITY_SUBMIT_PARALLEL_MISMATCH:
      return 409;
    case MCP_ADAPTER_ERROR.ENGINE_FAILURE:
    case MCP_ADAPTER_ERROR.INTERNAL_ERROR:
    default:
      return 500;
  }
}

/**
 * @param {McpAdapterError} error
 */
export function adapterErrorToHttpBody(error) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
  };
}
