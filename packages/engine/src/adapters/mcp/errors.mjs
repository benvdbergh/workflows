export const MCP_ADAPTER_ERROR = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  EXECUTION_NOT_FOUND: "EXECUTION_NOT_FOUND",
  INVALID_RESUME_PAYLOAD: "INVALID_RESUME_PAYLOAD",
  /** Host activity submit rejected: execution missing, not awaiting activity, or parallel/node mismatch (see engine submitActivityOutcome). */
  ACTIVITY_SUBMIT_NOT_AWAITING: "ACTIVITY_SUBMIT_NOT_AWAITING",
  ACTIVITY_SUBMIT_NODE_MISMATCH: "ACTIVITY_SUBMIT_NODE_MISMATCH",
  ACTIVITY_SUBMIT_PARALLEL_MISMATCH: "ACTIVITY_SUBMIT_PARALLEL_MISMATCH",
  SUBMIT_VALIDATION_ERROR: "SUBMIT_VALIDATION_ERROR",
  ENGINE_FAILURE: "ENGINE_FAILURE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
};

export class McpAdapterError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {unknown} [details]
   */
  constructor(code, message, details) {
    super(message);
    this.name = "McpAdapterError";
    this.code = code;
    this.details = details;
  }
}

/**
 * @param {unknown} error
 * @returns {McpAdapterError}
 */
export function normalizeMcpAdapterError(error) {
  if (error instanceof McpAdapterError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (typeof error?.code === "string" && error.code === "EXECUTION_NOT_FOUND") {
    return new McpAdapterError(MCP_ADAPTER_ERROR.EXECUTION_NOT_FOUND, message);
  }
  return new McpAdapterError(MCP_ADAPTER_ERROR.INTERNAL_ERROR, "Unexpected internal error in MCP adapter.", {
    cause: message,
  });
}

/**
 * @param {McpAdapterError} error
 */
export function toToolErrorResult(error) {
  return {
    isError: true,
    content: [{ type: "text", text: `${error.code}: ${error.message}` }],
    structuredContent: {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    },
  };
}
