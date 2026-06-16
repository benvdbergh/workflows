/**
 * In-process SDK delegate executor for `agent_delegate` nodes with `protocol: "sdk"`.
 *
 * Operators register agent handlers in a `Map` (or plain object) keyed by `agent_id`.
 * Each handler receives the resolved `delegateInput` and returns workflow output.
 * Use this as the extension point for embedding trusted in-process agent bridges
 * without MCP or A2A wire protocols.
 */

import { mintDelegateCorrelationId } from "./delegate-executor.mjs";

/** @typedef {"DELEGATE_AGENT_NOT_FOUND" | "DELEGATE_PROTOCOL_ERROR" | "DELEGATE_PROTOCOL_UNSUPPORTED"} SdkDelegateErrorCode */

/**
 * @typedef {(delegateInput: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>} SdkDelegateHandler
 */

/**
 * @param {Map<string, SdkDelegateHandler> | Record<string, SdkDelegateHandler> | undefined} handlers
 * @returns {Map<string, SdkDelegateHandler>}
 */
export function normalizeSdkDelegateHandlers(handlers) {
  if (handlers instanceof Map) {
    return new Map(handlers);
  }
  if (handlers && typeof handlers === "object") {
    return new Map(Object.entries(handlers));
  }
  return new Map();
}

/**
 * @implements {import("./delegate-executor.mjs").DelegateExecutor}
 */
export class SdkDelegateExecutor {
  /**
   * @param {{
   *   handlers?: Map<string, SdkDelegateHandler> | Record<string, SdkDelegateHandler>;
   * }} [opts]
   */
  constructor(opts = {}) {
    this.handlers = normalizeSdkDelegateHandlers(opts.handlers);
  }

  /**
   * Register or replace a handler for an agent_id (extension point for host wiring).
   *
   * @param {string} agentId
   * @param {SdkDelegateHandler} handler
   */
  registerHandler(agentId, handler) {
    this.handlers.set(agentId, handler);
  }

  /**
   * @param {import("./delegate-executor.mjs").DelegateExecutorContext} ctx
   * @returns {Promise<import("./delegate-executor.mjs").DelegateExecutorResult>}
   */
  async executeDelegate(ctx) {
    const { executionId, node, delegateInput, protocol } = ctx;
    const delegateCorrelationId = mintDelegateCorrelationId(executionId, node.id);

    if (protocol !== "sdk") {
      return {
        ok: false,
        error: `SdkDelegateExecutor only supports protocol "sdk" (got "${protocol}")`,
        code: "DELEGATE_PROTOCOL_UNSUPPORTED",
      };
    }

    const cfg =
      node.config && typeof node.config === "object"
        ? /** @type {{ agent_id?: string }} */ (node.config)
        : {};
    const agentId = typeof cfg.agent_id === "string" ? cfg.agent_id.trim() : "";
    if (!agentId) {
      return {
        ok: false,
        error: `agent_delegate "${node.id}": agent_id is required`,
        code: "DELEGATE_AGENT_NOT_FOUND",
      };
    }

    const handler = this.handlers.get(agentId);
    if (!handler) {
      return {
        ok: false,
        error: `No SDK delegate handler registered for agent_id "${agentId}"`,
        code: "DELEGATE_AGENT_NOT_FOUND",
      };
    }

    const externalTaskId = `sdk-task-${delegateCorrelationId.replace(/:/g, "-")}`;

    try {
      const raw = await handler(
        delegateInput && typeof delegateInput === "object" && !Array.isArray(delegateInput)
          ? /** @type {Record<string, unknown>} */ ({ ...delegateInput })
          : {}
      );
      const output =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? /** @type {Record<string, unknown>} */ ({ ...raw })
          : { delegate_status: "completed" };
      return {
        ok: true,
        output,
        delegateCorrelationId,
        externalTaskId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: message,
        code: "DELEGATE_PROTOCOL_ERROR",
      };
    }
  }
}
