/**
 * Engine-direct step activity executor: dispatches `step` nodes via an operator-side handler registry.
 *
 * v1 sandboxing: handlers run in the same Node.js process as the engine (no worker isolation).
 */

/**
 * @typedef {"STEP_CONFIG_INVALID" | "HANDLER_NOT_FOUND" | "HANDLER_ERROR" | "ACTIVITY_EXECUTOR_UNSUPPORTED_NODE"} StepActivityErrorCode
 */

/**
 * Context passed to registered step handlers.
 *
 * @typedef {object} StepHandlerContext
 * @property {string} executionId
 * @property {{ id: string; type: string; config?: object }} node
 * @property {Record<string, unknown>} state
 */

/**
 * @typedef {import("./activity-executor.mjs").ActivityExecutorResult} ActivityExecutorResult
 */

/**
 * @typedef {(ctx: StepHandlerContext) => Promise<Record<string, unknown> | ActivityExecutorResult>} StepHandlerFn
 */

/**
 * Operator-side registry mapping handler URNs to async step implementations.
 */
export class StepHandlerRegistry {
  constructor() {
    /** @type {Map<string, StepHandlerFn>} */
    this._handlers = new Map();
    this._frozen = false;
  }

  /**
   * @param {string} urn Handler URN (non-empty string).
   * @param {StepHandlerFn} fn
   */
  register(urn, fn) {
    if (this._frozen) {
      throw new Error("StepHandlerRegistry is frozen; cannot register handlers");
    }
    const key = typeof urn === "string" ? urn.trim() : "";
    if (!key) {
      throw new Error("StepHandlerRegistry.register requires a non-empty URN string");
    }
    if (typeof fn !== "function") {
      throw new Error("StepHandlerRegistry.register requires an async function");
    }
    this._handlers.set(key, fn);
  }

  /**
   * @param {string} urn
   * @returns {StepHandlerFn | undefined}
   */
  get(urn) {
    const key = typeof urn === "string" ? urn.trim() : "";
    return key ? this._handlers.get(key) : undefined;
  }

  /**
   * Returns a new registry with the same handlers that rejects further `register` calls.
   *
   * @returns {StepHandlerRegistry}
   */
  createFrozenCopy() {
    const copy = new StepHandlerRegistry();
    for (const [urn, fn] of this._handlers) {
      copy._handlers.set(urn, fn);
    }
    copy._frozen = true;
    return copy;
  }
}

/**
 * @param {unknown} cfg
 * @returns {{ ok: true, config: { handler: string } } | { ok: false, error: string, code: "STEP_CONFIG_INVALID" }}
 */
export function parseStepNodeConfig(cfg) {
  const raw = cfg && typeof cfg === "object" && !Array.isArray(cfg) ? /** @type {Record<string, unknown>} */ (cfg) : {};
  const handler = typeof raw.handler === "string" ? raw.handler.trim() : "";
  if (!handler) {
    return {
      ok: false,
      error: "step node requires config.handler (non-empty string URN)",
      code: "STEP_CONFIG_INVALID",
    };
  }
  return { ok: true, config: { handler } };
}

/**
 * @param {unknown} value
 * @returns {value is ActivityExecutorResult}
 */
function isActivityExecutorResult(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "ok" in value &&
    typeof /** @type {{ ok: unknown }} */ (value).ok === "boolean"
  );
}

/**
 * ActivityExecutor for `step` nodes via a {@link StepHandlerRegistry}.
 *
 * @implements {import("./activity-executor.mjs").ActivityExecutor}
 */
export class StepActivityExecutor {
  /**
   * @param {{ registry: StepHandlerRegistry }} opts
   */
  constructor(opts) {
    if (!opts?.registry || !(opts.registry instanceof StepHandlerRegistry)) {
      throw new Error("StepActivityExecutor requires a StepHandlerRegistry");
    }
    this.registry = opts.registry;
  }

  /**
   * @param {import("./activity-executor.mjs").ActivityExecutorContext} ctx
   * @returns {Promise<ActivityExecutorResult>}
   */
  async executeActivity(ctx) {
    const { node, state, executionId } = ctx;
    if (node.type !== "step") {
      return {
        ok: false,
        error: `StepActivityExecutor only supports step nodes (got ${node.type})`,
        code: "ACTIVITY_EXECUTOR_UNSUPPORTED_NODE",
      };
    }
    const parsedCfg = parseStepNodeConfig(node.config);
    if (!parsedCfg.ok) {
      return { ok: false, error: parsedCfg.error, code: parsedCfg.code };
    }
    const handlerFn = this.registry.get(parsedCfg.config.handler);
    if (!handlerFn) {
      return {
        ok: false,
        error: `No step handler registered for URN "${parsedCfg.config.handler}"`,
        code: "HANDLER_NOT_FOUND",
      };
    }
    /** @type {StepHandlerContext} */
    const handlerCtx = { executionId, node, state };
    let rawResult;
    try {
      rawResult = await handlerFn(handlerCtx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message, code: "HANDLER_ERROR" };
    }
    if (isActivityExecutorResult(rawResult)) {
      return rawResult;
    }
    if (rawResult && typeof rawResult === "object" && !Array.isArray(rawResult)) {
      return {
        ok: true,
        output: /** @type {Record<string, unknown>} */ ({ .../** @type {object} */ (rawResult) }),
      };
    }
    return { ok: true, output: { value: rawResult } };
  }
}
