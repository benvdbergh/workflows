import { applyInputMapping } from "./workflow-node-execution.mjs";
import { mintDelegateCorrelationId } from "./delegate-executor.mjs";

/** @typedef {import("./replay-loader.mjs").ReplayHydrationResult} ReplayHydrationResult */
/** @typedef {import("./delegate-executor.mjs").DelegateExecutor} DelegateExecutor */

const REPLAY_CORRELATION_KEY = "__delegateCorrelationId";
const REPLAY_EXTERNAL_TASK_KEY = "__externalTaskId";

/**
 * @param {Record<string, unknown>} stored
 * @returns {{ output: Record<string, unknown>; delegateCorrelationId?: string; externalTaskId?: string }}
 */
function unpackReplayDelegateResult(stored) {
  const copy = JSON.parse(JSON.stringify(stored));
  const delegateCorrelationId =
    typeof copy[REPLAY_CORRELATION_KEY] === "string" ? copy[REPLAY_CORRELATION_KEY] : undefined;
  const externalTaskId =
    typeof copy[REPLAY_EXTERNAL_TASK_KEY] === "string" ? copy[REPLAY_EXTERNAL_TASK_KEY] : undefined;
  delete copy[REPLAY_CORRELATION_KEY];
  delete copy[REPLAY_EXTERNAL_TASK_KEY];
  return { output: copy, delegateCorrelationId, externalTaskId };
}

/**
 * @param {object} args
 * @param {{ id: string; config?: object }} args.node
 * @param {Record<string, unknown>} args.state
 * @param {string} args.executionId
 * @param {{ replayed: boolean }} args.scheduled
 * @param {ReplayHydrationResult} args.replay
 * @param {DelegateExecutor} args.delegateExecutor
 * @param {boolean} [args.assertNoDelegateExecutorInvocation]
 * @param {(name: string, payload: Record<string, unknown>) => number} args.appendEvt
 * @param {{ json: (data: unknown, query: string) => Promise<unknown> }} args.jq
 * @returns {Promise<
 *   | { kind: "completed"; output: Record<string, unknown> }
 *   | { kind: "failed"; error: string; code?: string }
 * >}
 */
export async function executeDelegateNode(args) {
  const {
    node,
    state,
    executionId,
    scheduled,
    replay,
    delegateExecutor,
    assertNoDelegateExecutorInvocation = false,
    appendEvt,
    jq,
  } = args;

  const cfg =
    node.config && typeof node.config === "object"
      ? /** @type {{ agent_id?: string; protocol?: string; input_mapping?: unknown }} */ (node.config)
      : {};
  const agentId = typeof cfg.agent_id === "string" ? cfg.agent_id.trim() : "";
  if (!agentId) {
    return { kind: "failed", error: `agent_delegate "${node.id}": agent_id is required` };
  }
  const protocol = typeof cfg.protocol === "string" ? cfg.protocol.trim() : "";
  if (protocol !== "a2a" && protocol !== "mcp" && protocol !== "sdk") {
    return {
      kind: "failed",
      error: `agent_delegate "${node.id}": protocol must be a2a, mcp, or sdk`,
    };
  }
  const inputMapping =
    cfg.input_mapping && typeof cfg.input_mapping === "object" && !Array.isArray(cfg.input_mapping)
      ? /** @type {Record<string, unknown>} */ (cfg.input_mapping)
      : null;
  if (!inputMapping) {
    return { kind: "failed", error: `agent_delegate "${node.id}": input_mapping is required` };
  }

  const replayStored = scheduled.replayed ? replay.replayResults.get(node.id) : undefined;
  if (replayStored) {
    const { output, delegateCorrelationId, externalTaskId } = unpackReplayDelegateResult(replayStored);
    const correlationId =
      delegateCorrelationId ?? mintDelegateCorrelationId(executionId, node.id);
    appendEvt("ActivityCompleted", {
      nodeId: node.id,
      result: output,
      delegateCorrelationId: correlationId,
      ...(externalTaskId ? { externalTaskId } : {}),
      replayed: true,
    });
    return { kind: "completed", output };
  }

  if (assertNoDelegateExecutorInvocation) {
    return { kind: "failed", error: "agent_delegate invocation not allowed in this run" };
  }

  let delegateInput;
  try {
    delegateInput = await applyInputMapping(state, inputMapping, jq);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: "failed", error: msg };
  }

  const preCorrelationId = mintDelegateCorrelationId(executionId, node.id);
  appendEvt("ActivityRequested", {
    nodeId: node.id,
    nodeType: "agent_delegate",
    agentId,
    protocol,
    delegateCorrelationId: preCorrelationId,
  });

  const delegateResult = await delegateExecutor.executeDelegate({
    executionId,
    node: /** @type {{ id: string; type: string; config?: object }} */ (node),
    state,
    delegateInput,
    protocol: /** @type {"a2a" | "mcp" | "sdk"} */ (protocol),
  });

  if (!delegateResult.ok) {
    appendEvt("ActivityFailed", {
      nodeId: node.id,
      error: delegateResult.error,
      ...(delegateResult.code !== undefined ? { code: delegateResult.code } : {}),
    });
    return {
      kind: "failed",
      error: delegateResult.error,
      ...(delegateResult.code !== undefined ? { code: delegateResult.code } : {}),
    };
  }

  appendEvt("ActivityCompleted", {
    nodeId: node.id,
    result: delegateResult.output,
    delegateCorrelationId: delegateResult.delegateCorrelationId,
    externalTaskId: delegateResult.externalTaskId,
  });
  return { kind: "completed", output: delegateResult.output };
}
