/**
 * Routes activity execution by node type to configured sub-executors (`step`, `llm_call`, `tool_call`).
 */

/** @typedef {"step" | "llm_call" | "tool_call"} RoutedActivityNodeType */

/** @type {ReadonlySet<string>} */
const ROUTED_ACTIVITY_TYPES = new Set(["step", "llm_call", "tool_call"]);

/**
 * @typedef {import("./activity-executor.mjs").ActivityExecutor} ActivityExecutor
 * @typedef {import("./activity-executor.mjs").ActivityExecutorContext} ActivityExecutorContext
 * @typedef {import("./activity-executor.mjs").ActivityExecutorResult} ActivityExecutorResult
 */

/**
 * @param {{
 *   step?: ActivityExecutor;
 *   llm_call?: ActivityExecutor;
 *   tool_call?: ActivityExecutor;
 *   fallback?: ActivityExecutor;
 * }} subExecutors
 */
export function buildCompositeActivityExecutor(subExecutors = {}) {
  return new CompositeActivityExecutor(subExecutors);
}

/**
 * Composite {@link ActivityExecutor} that dispatches by `ctx.node.type`.
 *
 * @implements {ActivityExecutor}
 */
export class CompositeActivityExecutor {
  /**
   * @param {{
   *   step?: ActivityExecutor;
   *   llm_call?: ActivityExecutor;
   *   tool_call?: ActivityExecutor;
   *   fallback?: ActivityExecutor;
   * }} subExecutors
   */
  constructor(subExecutors = {}) {
    /** @type {Partial<Record<RoutedActivityNodeType, ActivityExecutor>>} */
    this._executors = {
      ...(subExecutors.step ? { step: subExecutors.step } : {}),
      ...(subExecutors.llm_call ? { llm_call: subExecutors.llm_call } : {}),
      ...(subExecutors.tool_call ? { tool_call: subExecutors.tool_call } : {}),
    };
    this._fallback = subExecutors.fallback;
  }

  /**
   * @param {ActivityExecutorContext} ctx
   * @returns {Promise<ActivityExecutorResult>}
   */
  async executeActivity(ctx) {
    const nodeType = ctx.node.type;
    if (!ROUTED_ACTIVITY_TYPES.has(nodeType)) {
      return {
        ok: false,
        error: `CompositeActivityExecutor does not route node type "${nodeType}"`,
        code: "COMPOSITE_EXECUTOR_NOT_CONFIGURED",
      };
    }
    const executor = /** @type {RoutedActivityNodeType} */ (nodeType) in this._executors
      ? this._executors[/** @type {RoutedActivityNodeType} */ (nodeType)]
      : undefined;
    if (executor) {
      return executor.executeActivity(ctx);
    }
    if (this._fallback) {
      return this._fallback.executeActivity(ctx);
    }
    return {
      ok: false,
      error: `No activity executor configured for node type "${nodeType}"`,
      code: "COMPOSITE_EXECUTOR_NOT_CONFIGURED",
    };
  }
}
