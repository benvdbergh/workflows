/**
 * Routes delegate execution by protocol to configured sub-executors (`a2a`, `mcp`, `sdk`).
 */

/** @typedef {"a2a" | "mcp" | "sdk"} RoutedDelegateProtocol */

/** @type {ReadonlySet<string>} */
const ROUTED_DELEGATE_PROTOCOLS = new Set(["a2a", "mcp", "sdk"]);

/**
 * @typedef {import("./delegate-executor.mjs").DelegateExecutor} DelegateExecutor
 * @typedef {import("./delegate-executor.mjs").DelegateExecutorContext} DelegateExecutorContext
 * @typedef {import("./delegate-executor.mjs").DelegateExecutorResult} DelegateExecutorResult
 */

/**
 * @param {{
 *   a2a?: DelegateExecutor;
 *   mcp?: DelegateExecutor;
 *   sdk?: DelegateExecutor;
 *   fallback?: DelegateExecutor;
 * }} subExecutors
 */
export function buildCompositeDelegateExecutor(subExecutors = {}) {
  return new CompositeDelegateExecutor(subExecutors);
}

/**
 * Composite {@link DelegateExecutor} that dispatches by `ctx.protocol`.
 *
 * @implements {DelegateExecutor}
 */
export class CompositeDelegateExecutor {
  /**
   * @param {{
   *   a2a?: DelegateExecutor;
   *   mcp?: DelegateExecutor;
   *   sdk?: DelegateExecutor;
   *   fallback?: DelegateExecutor;
   * }} subExecutors
   */
  constructor(subExecutors = {}) {
    /** @type {Partial<Record<RoutedDelegateProtocol, DelegateExecutor>>} */
    this._executors = {
      ...(subExecutors.a2a ? { a2a: subExecutors.a2a } : {}),
      ...(subExecutors.mcp ? { mcp: subExecutors.mcp } : {}),
      ...(subExecutors.sdk ? { sdk: subExecutors.sdk } : {}),
    };
    this._fallback = subExecutors.fallback;
  }

  /**
   * @param {DelegateExecutorContext} ctx
   * @returns {Promise<DelegateExecutorResult>}
   */
  async executeDelegate(ctx) {
    const protocol = ctx.protocol;
    if (!ROUTED_DELEGATE_PROTOCOLS.has(protocol)) {
      return {
        ok: false,
        error: `CompositeDelegateExecutor does not route protocol "${protocol}"`,
        code: "DELEGATE_PROTOCOL_UNSUPPORTED",
      };
    }
    const executor = /** @type {RoutedDelegateProtocol} */ (protocol) in this._executors
      ? this._executors[/** @type {RoutedDelegateProtocol} */ (protocol)]
      : undefined;
    if (executor) {
      return executor.executeDelegate(ctx);
    }
    if (this._fallback) {
      return this._fallback.executeDelegate(ctx);
    }
    return {
      ok: false,
      error: `No delegate executor configured for protocol "${protocol}"`,
      code: "DELEGATE_PROTOCOL_UNSUPPORTED",
    };
  }
}
