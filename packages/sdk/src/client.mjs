import { createPortTransport } from "./port-transport.mjs";
import { createRestTransport } from "./rest-transport.mjs";

/**
 * @typedef {import("./types.mjs").ActivityExecutionMode} ActivityExecutionMode
 * @typedef {import("./types.mjs").ActivityOutcomeTransport} ActivityOutcomeTransport
 * @typedef {import("./types.mjs").RegisterDefinitionResultTransport} RegisterDefinitionResultTransport
 * @typedef {import("./types.mjs").WorkflowParallelSpanTransport} WorkflowParallelSpanTransport
 * @typedef {import("./types.mjs").WorkflowResumeResultTransport} WorkflowResumeResultTransport
 * @typedef {import("./types.mjs").WorkflowStartResultTransport} WorkflowStartResultTransport
 * @typedef {import("./types.mjs").WorkflowStatusResultTransport} WorkflowStatusResultTransport
 * @typedef {import("./types.mjs").WorkflowSubmitActivityResultTransport} WorkflowSubmitActivityResultTransport
 */

/**
 * @param {Record<string, unknown>} options
 * @param {string} camel
 * @param {string} snake
 */
function pickOption(options, camel, snake) {
  if (options[camel] !== undefined) {
    return options[camel];
  }
  return options[snake];
}

export class WorkflowClient {
  /** @type {ReturnType<typeof createRestTransport> | ReturnType<typeof createPortTransport>} */
  #transport;

  /** @type {Map<string, object>} */
  #definitions = new Map();

  /**
   * @param {{ baseUrl?: string; fetch?: typeof fetch; port?: {
   *   startWorkflow: Function;
   *   getWorkflowStatus: Function;
   *   resumeWorkflow: Function;
   *   submitWorkflowActivity: Function;
   * } }} options
   */
  constructor(options = {}) {
    if (options.port) {
      this.#transport = createPortTransport(options.port);
    } else if (options.baseUrl) {
      this.#transport = createRestTransport({ baseUrl: options.baseUrl, fetch: options.fetch });
    } else {
      throw new TypeError(
        "WorkflowClient requires baseUrl for REST mode or port for in-process mode. Use WorkflowClient.fromPort(port) as a shortcut."
      );
    }
    this.#definitions = new Map();
  }

  /**
   * @param {{
   *   startWorkflow: Function;
   *   getWorkflowStatus: Function;
   *   resumeWorkflow: Function;
   *   submitWorkflowActivity: Function;
   * }} port
   */
  static fromPort(port) {
    return new WorkflowClient({ port });
  }

  /**
   * Register a workflow definition. Required for REST `start` unless `definition` is passed to `start`.
   *
   * @param {object} definition
   * @returns {Promise<RegisterDefinitionResultTransport>}
   */
  async registerDefinition(definition) {
    const registered = await this.#transport.registerDefinition(definition);
    this.#definitions.set(registered.wf_id, registered.definition);
    return registered;
  }

  /**
   * @param {Record<string, unknown>} options
   * @returns {Promise<WorkflowStartResultTransport>}
   */
  async start(options) {
    let wfId = pickOption(options, "wfId", "wf_id");
    const definition = /** @type {object | undefined} */ (options.definition);
    if (!wfId && definition) {
      const registered = await this.registerDefinition(definition);
      wfId = registered.wf_id;
    }
    if (!wfId) {
      throw new TypeError("start requires wfId/wf_id or definition (REST registers automatically).");
    }

    const body = {
      ...(pickOption(options, "executionId", "execution_id") !== undefined
        ? { execution_id: pickOption(options, "executionId", "execution_id") }
        : {}),
      input: /** @type {Record<string, unknown>} */ (options.input ?? {}),
      ...(pickOption(options, "activityExecutionMode", "activity_execution_mode") !== undefined
        ? {
            activity_execution_mode: pickOption(options, "activityExecutionMode", "activity_execution_mode"),
          }
        : {}),
      ...(pickOption(options, "allowExistingExecutionId", "allow_existing_execution_id") === true
        ? { allow_existing_execution_id: true }
        : {}),
    };

    if (this.#transport.mode === "port") {
      const resolvedDefinition = definition ?? this.#definitions.get(wfId);
      if (!resolvedDefinition) {
        throw new TypeError("start requires definition when using WorkflowClient.fromPort.");
      }
      return this.#transport.start(wfId, { ...body, definition: resolvedDefinition });
    }

    return this.#transport.start(wfId, body);
  }

  /**
   * @param {Record<string, unknown>} options
   * @returns {Promise<WorkflowStatusResultTransport>}
   */
  async getStatus(options) {
    const executionId = pickOption(options, "executionId", "execution_id");
    if (typeof executionId !== "string" || executionId.trim() === "") {
      throw new TypeError("getStatus requires executionId/execution_id.");
    }
    return this.#transport.getStatus(executionId);
  }

  /**
   * @param {Record<string, unknown>} options
   * @returns {Promise<WorkflowResumeResultTransport>}
   */
  async resume(options) {
    const executionId = pickOption(options, "executionId", "execution_id");
    if (typeof executionId !== "string" || executionId.trim() === "") {
      throw new TypeError("resume requires executionId/execution_id.");
    }
    const definition = /** @type {object | undefined} */ (options.definition);
    if (!definition) {
      throw new TypeError("resume requires definition.");
    }
    const body = {
      definition,
      resume_payload: /** @type {Record<string, unknown>} */ (
        pickOption(options, "resumePayload", "resume_payload") ?? {}
      ),
      ...(pickOption(options, "activityExecutionMode", "activity_execution_mode") !== undefined
        ? {
            activity_execution_mode: pickOption(options, "activityExecutionMode", "activity_execution_mode"),
          }
        : {}),
    };
    return this.#transport.resume(executionId, body);
  }

  /**
   * @param {Record<string, unknown>} options
   * @returns {Promise<WorkflowSubmitActivityResultTransport>}
   */
  async submitActivity(options) {
    const executionId = pickOption(options, "executionId", "execution_id");
    const nodeId = pickOption(options, "nodeId", "node_id");
    if (typeof executionId !== "string" || executionId.trim() === "") {
      throw new TypeError("submitActivity requires executionId/execution_id.");
    }
    if (typeof nodeId !== "string" || nodeId.trim() === "") {
      throw new TypeError("submitActivity requires nodeId/node_id.");
    }
    const definition = /** @type {object | undefined} */ (options.definition);
    if (!definition) {
      throw new TypeError("submitActivity requires definition.");
    }
    const parallelSpan = /** @type {WorkflowParallelSpanTransport | undefined} */ (
      pickOption(options, "parallelSpan", "parallel_span")
    );
    const body = {
      definition,
      input: /** @type {Record<string, unknown>} */ (options.input ?? {}),
      node_id: nodeId,
      outcome: /** @type {ActivityOutcomeTransport} */ (options.outcome),
      ...(parallelSpan ? { parallel_span: parallelSpan } : {}),
      ...(pickOption(options, "activityExecutionMode", "activity_execution_mode") !== undefined
        ? {
            activity_execution_mode: pickOption(options, "activityExecutionMode", "activity_execution_mode"),
          }
        : {}),
    };
    return this.#transport.submitActivity(executionId, body);
  }
}
