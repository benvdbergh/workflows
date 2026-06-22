/**
 * Stable SDK error aligned with MCP adapter and REST `{ error: { code, message } }` bodies.
 */
export class SdkError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {unknown} [details]
   */
  constructor(code, message, details) {
    super(message);
    this.name = "SdkError";
    this.code = code;
    this.details = details;
  }
}

/**
 * @param {unknown} body
 * @returns {SdkError}
 */
export function sdkErrorFromRestBody(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const error = /** @type {{ error?: { code?: string; message?: string; details?: unknown } }} */ (body).error;
    if (error && typeof error.code === "string" && typeof error.message === "string") {
      return new SdkError(error.code, error.message, error.details);
    }
  }
  return new SdkError("INTERNAL_ERROR", "Unexpected error response from workflow backend.");
}
