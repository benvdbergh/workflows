import { applyOutputWithReducers } from "./linear-runner.mjs";
import { applyInputMapping } from "./workflow-node-execution.mjs";
import { resolveWorkflowRef } from "./workflow-ref-resolver.mjs";

/** @typedef {import("./replay-loader.mjs").ReplayHydrationResult} ReplayHydrationResult */

const DEFAULT_MAX_SUBWORKFLOW_DEPTH = 4;

/**
 * @param {string} parentExecutionId
 * @param {string} nodeId
 * @returns {string}
 */
export function mintChildExecutionId(parentExecutionId, nodeId) {
  return `${parentExecutionId}:sub:${nodeId}`;
}

/**
 * @param {object} args
 * @param {{ id: string; config?: object }} args.node
 * @param {Record<string, unknown>} args.state
 * @param {string} args.executionId
 * @param {object} args.parentDefinition
 * @param {import("../persistence/types.mjs").ExecutionHistoryStore} args.store
 * @param {(name: string, payload: Record<string, unknown>) => { replayed: boolean }} args.appendCmd
 * @param {(name: string, payload: Record<string, unknown>) => number} args.appendEvt
 * @param {{ replayed: boolean }} args.scheduled
 * @param {ReplayHydrationResult} args.replay
 * @param {number} args.subworkflowDepth
 * @param {number} [args.maxSubworkflowDepth]
 * @param {Record<string, Record<string, unknown>>} [args.stubActivityOutputs]
 * @param {import("./activity-executor.mjs").ActivityExecutor} [args.activityExecutor]
 * @param {"in_process" | "host_mediated"} [args.activityExecutionMode]
 * @param {boolean} [args.assertNoSubworkflowInvocation]
 * @param {(options: import("./workflow-graph-walker.mjs").RunGraphWorkflowOptions) => Promise<import("./workflow-graph-walker.mjs").RunGraphWorkflowResult>} args.runGraphWorkflow
 * @param {{ json: (data: unknown, query: string) => Promise<unknown> }} args.jq
 * @returns {Promise<{ kind: "ok" } | { kind: "failed"; error: string }>}
 */
export async function executeSubworkflowNode(args) {
  const {
    node,
    state,
    executionId,
    parentDefinition,
    store,
    appendCmd,
    appendEvt,
    scheduled,
    replay,
    subworkflowDepth,
    maxSubworkflowDepth = DEFAULT_MAX_SUBWORKFLOW_DEPTH,
    stubActivityOutputs,
    activityExecutor,
    activityExecutionMode,
    assertNoSubworkflowInvocation = false,
    runGraphWorkflow,
    jq,
  } = args;

  const cfg =
    node.config && typeof node.config === "object"
      ? /** @type {{ workflow_ref?: string; input_mapping?: unknown; version_pin?: string }} */ (node.config)
      : {};
  const workflowRef = typeof cfg.workflow_ref === "string" ? cfg.workflow_ref.trim() : "";
  if (!workflowRef) {
    return { kind: "failed", error: `subworkflow "${node.id}": workflow_ref is required` };
  }
  const inputMapping =
    cfg.input_mapping && typeof cfg.input_mapping === "object" && !Array.isArray(cfg.input_mapping)
      ? /** @type {Record<string, unknown>} */ (cfg.input_mapping)
      : null;
  if (!inputMapping) {
    return { kind: "failed", error: `subworkflow "${node.id}": input_mapping is required` };
  }

  const replayPayload = scheduled.replayed ? replay.replayResults.get(node.id) : undefined;
  if (replayPayload) {
    const childExecutionId =
      typeof replayPayload.childExecutionId === "string"
        ? replayPayload.childExecutionId
        : mintChildExecutionId(executionId, node.id);
    appendCmd("StartSubworkflow", { nodeId: node.id, workflowRef, childExecutionId });
    const merged =
      replayPayload.mergedOutput && typeof replayPayload.mergedOutput === "object"
        ? /** @type {Record<string, unknown>} */ (replayPayload.mergedOutput)
        : replayPayload.childFinalState && typeof replayPayload.childFinalState === "object"
          ? /** @type {Record<string, unknown>} */ (replayPayload.childFinalState)
          : {};
    Object.assign(
      state,
      /** @type {Record<string, unknown>} */ (
        applyOutputWithReducers(state, merged, parentDefinition.state_schema)
      )
    );
    appendEvt("SubworkflowCompleted", {
      nodeId: node.id,
      workflowRef,
      parentExecutionId: executionId,
      childExecutionId,
      childFinalState: replayPayload.childFinalState,
      childResult: replayPayload.childResult,
      mergedOutput: merged,
      replayed: true,
    });
    appendCmd("CompleteSubworkflow", { nodeId: node.id, workflowRef, childExecutionId });
    return { kind: "ok" };
  }

  if (subworkflowDepth >= maxSubworkflowDepth) {
    return {
      kind: "failed",
      error: `subworkflow max depth ${maxSubworkflowDepth} exceeded at "${node.id}"`,
    };
  }

  if (assertNoSubworkflowInvocation) {
    return { kind: "failed", error: "subworkflow child invocation not allowed in this run" };
  }

  let childDefinition;
  try {
    childDefinition = resolveWorkflowRef(workflowRef);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: "failed", error: msg };
  }

  let childInput;
  try {
    childInput = await applyInputMapping(state, inputMapping, jq);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: "failed", error: msg };
  }

  const childExecutionId = mintChildExecutionId(executionId, node.id);
  appendCmd("StartSubworkflow", { nodeId: node.id, workflowRef, childExecutionId });
  appendEvt("SubworkflowStarted", {
    nodeId: node.id,
    workflowRef,
    parentExecutionId: executionId,
    childExecutionId,
  });

  const childRun = await runGraphWorkflow({
    definition: childDefinition,
    input: childInput,
    executionId: childExecutionId,
    store,
    stubActivityOutputs,
    activityExecutor,
    activityExecutionMode,
    subworkflowDepth: subworkflowDepth + 1,
    maxSubworkflowDepth,
    assertNoSubworkflowInvocation,
  });

  if (childRun.status === "interrupted" || childRun.status === "awaiting_activity") {
    return {
      kind: "failed",
      error: `subworkflow child "${childExecutionId}" ended with status "${childRun.status}" (not supported on parent path)`,
    };
  }

  if (childRun.status === "failed") {
    appendEvt("SubworkflowCompleted", {
      nodeId: node.id,
      workflowRef,
      parentExecutionId: executionId,
      childExecutionId,
      failed: true,
      error: childRun.error,
    });
    return { kind: "failed", error: childRun.error ?? "child workflow failed" };
  }

  const childFinalState = childRun.finalState ?? {};
  const mergedOutput = { ...childFinalState };
  Object.assign(
    state,
    /** @type {Record<string, unknown>} */ (
      applyOutputWithReducers(state, mergedOutput, parentDefinition.state_schema)
    )
  );

  appendEvt("SubworkflowCompleted", {
    nodeId: node.id,
    workflowRef,
    parentExecutionId: executionId,
    childExecutionId,
    childFinalState: JSON.parse(JSON.stringify(childFinalState)),
    childResult: childRun.result,
    mergedOutput,
  });
  appendCmd("CompleteSubworkflow", { nodeId: node.id, workflowRef, childExecutionId });

  return { kind: "ok" };
}
