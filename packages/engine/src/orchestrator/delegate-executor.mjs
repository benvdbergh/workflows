/**
 * Delegate boundary port: orchestration calls agent runtimes (A2A, MCP, SDK); adapters own wire protocols.
 */

/**
 * @typedef {object} DelegateExecutorContext
 * @property {string} executionId
 * @property {{ id: string; type: string; config?: object }} node
 * @property {Record<string, unknown>} state Parent workflow state at the boundary.
 * @property {Record<string, unknown>} delegateInput Resolved `input_mapping` payload.
 * @property {"a2a" | "mcp" | "sdk"} protocol
 */

/**
 * @typedef {object} DelegateExecutorSuccess
 * @property {true} ok
 * @property {Record<string, unknown>} output
 * @property {string} delegateCorrelationId
 * @property {string} externalTaskId
 */

/**
 * @typedef {{ ok: false; error: string; code?: string }} DelegateExecutorFailure
 */

/**
 * @typedef {DelegateExecutorSuccess | DelegateExecutorFailure} DelegateExecutorResult
 */

/**
 * @typedef {object} DelegateExecutor
 * @property {(ctx: DelegateExecutorContext) => Promise<DelegateExecutorResult>} executeDelegate
 */

/**
 * @param {string} executionId
 * @param {string} nodeId
 * @returns {string}
 */
export function mintDelegateCorrelationId(executionId, nodeId) {
  return `${executionId}:delegate:${nodeId}`;
}

/**
 * In-process mock A2A delegate: submitted → working → completed without network I/O.
 *
 * @implements {DelegateExecutor}
 */
export class MockA2ADelegateExecutor {
  /**
   * @param {DelegateExecutorContext} ctx
   * @returns {Promise<DelegateExecutorResult>}
   */
  async executeDelegate(ctx) {
    const { executionId, node, delegateInput, protocol } = ctx;
    const delegateCorrelationId = mintDelegateCorrelationId(executionId, node.id);
    const externalTaskId = `a2a-task-${delegateCorrelationId.replace(/:/g, "-")}`;

    if (protocol === "a2a") {
      const task = typeof delegateInput.task === "string" ? delegateInput.task : "";
      const patch =
        task.length > 0
          ? `// mock A2A patch for: ${task.slice(0, 120)}`
          : "// mock A2A patch (no task in delegate input)";
      return {
        ok: true,
        output: { patch, delegate_status: "completed" },
        delegateCorrelationId,
        externalTaskId,
      };
    }

    if (protocol === "mcp" || protocol === "sdk") {
      return {
        ok: true,
        output: { delegate_status: "completed", protocol },
        delegateCorrelationId,
        externalTaskId,
      };
    }

    return {
      ok: false,
      error: `Unsupported delegate protocol "${protocol}"`,
      code: "DELEGATE_PROTOCOL_UNSUPPORTED",
    };
  }
}

/**
 * Fails any `executeDelegate` call. Use in conformance to prove replay does not re-invoke the delegate port.
 *
 * @implements {DelegateExecutor}
 */
export class RejectingDelegateExecutor {
  /**
   * @param {DelegateExecutorContext} ctx
   * @returns {Promise<DelegateExecutorResult>}
   */
  async executeDelegate(ctx) {
    return {
      ok: false,
      error: `CONFORMANCE_DELEGATE_PORT_INVOKED: executeDelegate was called for node ${ctx.node.id} (expected replay to use recorded ActivityCompleted only).`,
      code: "CONFORMANCE_DELEGATE_PORT_INVOKED",
    };
  }
}
