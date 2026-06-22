import { sdkErrorFromRestBody } from "./errors.mjs";

/**
 * @typedef {import("./types.mjs").RegisterDefinitionResultTransport} RegisterDefinitionResultTransport
 * @typedef {import("./types.mjs").WorkflowStartResultTransport} WorkflowStartResultTransport
 * @typedef {import("./types.mjs").WorkflowStatusResultTransport} WorkflowStatusResultTransport
 * @typedef {import("./types.mjs").WorkflowResumeResultTransport} WorkflowResumeResultTransport
 * @typedef {import("./types.mjs").WorkflowSubmitActivityResultTransport} WorkflowSubmitActivityResultTransport
 */

/**
 * @param {{ baseUrl: string; fetch?: typeof fetch }} options
 */
export function createRestTransport(options) {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const base = options.baseUrl.replace(/\/$/, "");

  /**
   * @param {string} method
   * @param {string} pathname
   * @param {unknown} [body]
   */
  async function request(method, pathname, body) {
    // codeql[js/file-access-to-http]: SDK intentionally posts workflow definitions to the configured REST API
    const response = await fetchFn(`${base}${pathname}`, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      throw sdkErrorFromRestBody(parsed);
    }
    return parsed;
  }

  return {
    mode: "rest",
    /**
     * @param {object} definition
     * @returns {Promise<RegisterDefinitionResultTransport>}
     */
    async registerDefinition(definition) {
      return /** @type {Promise<RegisterDefinitionResultTransport>} */ (
        request("POST", "/v1/workflows", { definition })
      );
    },
    /**
     * @param {string} wfId
     * @param {Record<string, unknown>} body
     * @returns {Promise<WorkflowStartResultTransport>}
     */
    async start(wfId, body) {
      return /** @type {Promise<WorkflowStartResultTransport>} */ (
        request("POST", `/v1/workflows/${encodeURIComponent(wfId)}/executions`, body)
      );
    },
    /**
     * @param {string} executionId
     * @returns {Promise<WorkflowStatusResultTransport>}
     */
    async getStatus(executionId) {
      return /** @type {Promise<WorkflowStatusResultTransport>} */ (
        request("GET", `/v1/executions/${encodeURIComponent(executionId)}`)
      );
    },
    /**
     * @param {string} executionId
     * @param {Record<string, unknown>} body
     * @returns {Promise<WorkflowResumeResultTransport>}
     */
    async resume(executionId, body) {
      return /** @type {Promise<WorkflowResumeResultTransport>} */ (
        request("POST", `/v1/executions/${encodeURIComponent(executionId)}:resume`, body)
      );
    },
    /**
     * @param {string} executionId
     * @param {Record<string, unknown>} body
     * @returns {Promise<WorkflowSubmitActivityResultTransport>}
     */
    async submitActivity(executionId, body) {
      return /** @type {Promise<WorkflowSubmitActivityResultTransport>} */ (
        request("POST", `/v1/executions/${encodeURIComponent(executionId)}:submit_activity`, body)
      );
    },
  };
}
