/**
 * Activity boundary port: orchestration calls adapters; adapters own MCP/HTTP/SDK (not imported here).
 */

/**
 * Context for a single activity invocation at a workflow node.
 *
 * @typedef {object} ActivityExecutorContext
 * @property {string} executionId
 * @property {{ id: string; type: string; config?: object }} node Full node from the workflow definition (`id`, `type`, optional `config`).
 * @property {Record<string, unknown>} state Workflow state at the boundary (treat as read-only; do not rely on orchestrator seeing mutations).
 */

/**
 * @typedef {{ ok: true, output: Record<string, unknown> } | { ok: false, error: string, code?: string }} ActivityExecutorResult
 */

/**
 * Executes activity work for `step`, `llm_call`, and `tool_call` nodes.
 *
 * @typedef {object} ActivityExecutor
 * @property {(ctx: ActivityExecutorContext) => Promise<ActivityExecutorResult>} executeActivity
 */

/**
 * Deterministic stub: returns `{}` or a preconfigured output per node id. No network or SDKs.
 *
 * @implements {ActivityExecutor}
 */
export class StubActivityExecutor {
  /**
   * @param {Record<string, Record<string, unknown>>} [outputsByNodeId]
   */
  constructor(outputsByNodeId = {}) {
    /** @type {Record<string, Record<string, unknown>>} */
    this.outputsByNodeId = outputsByNodeId;
  }

  /**
   * @param {ActivityExecutorContext} ctx
   * @returns {Promise<ActivityExecutorResult>}
   */
  async executeActivity(ctx) {
    const output = { ...(this.outputsByNodeId[ctx.node.id] ?? {}) };
    return { ok: true, output };
  }
}
