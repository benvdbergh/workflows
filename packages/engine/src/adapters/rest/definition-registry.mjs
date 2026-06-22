import { assertValidWorkflowDefinitionAtTransport } from "../mcp/transport-validation.mjs";
import { deriveWorkflowId } from "../workflow-id.mjs";

/**
 * In-memory workflow definition registry keyed by `wf_id`.
 */
export class DefinitionRegistry {
  /** @type {Map<string, object>} */
  #definitions = new Map();

  /**
   * @param {object} definition
   * @returns {{ wf_id: string; definition: object }}
   */
  register(definition) {
    assertValidWorkflowDefinitionAtTransport(definition);
    const wfId = deriveWorkflowId(definition);
    if (this.#definitions.has(wfId)) {
      const err = new Error(`Workflow definition "${wfId}" is already registered.`);
      err.code = "DUPLICATE_WORKFLOW_ID";
      throw err;
    }
    const stored = structuredClone(definition);
    this.#definitions.set(wfId, stored);
    return { wf_id: wfId, definition: stored };
  }

  /**
   * @param {string} wfId
   * @returns {object | undefined}
   */
  get(wfId) {
    const definition = this.#definitions.get(wfId);
    return definition ? structuredClone(definition) : undefined;
  }
}
