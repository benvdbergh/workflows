/**
 * General workflow graph walker: `start`, `end`, `step`, `llm_call`, `tool_call`, `switch`, `interrupt`,
 * `parallel`, `wait`, `set_state`, `subworkflow`, and `agent_delegate`.
 * Switch routing uses only `config.cases` / `config.default` (static edges from the switch id are ignored).
 */
import Ajv2020 from "ajv/dist/2020.js";
import { createRequire } from "node:module";
import { validateWorkflowDefinition } from "../validate.mjs";
import { StubActivityExecutor } from "./activity-executor.mjs";
import {
  computeRetryBackoffMs,
  delay as policyDelay,
  getRetryPolicy,
  resolveMaxAttempts,
  resolveNodeTimeoutMs,
  shouldRetryAfterFailure,
} from "./orchestration-policy.mjs";
import {
  assertNoCustomReducers,
  applyOutputWithReducers,
  stateSchemaForValidation,
} from "./linear-runner.mjs";
import { assertHistoryReadableByEngine } from "../persistence/history-record-schema-version.mjs";
import { hydrateReplayContext } from "./replay-loader.mjs";
import { createParallelJoinRuntime } from "./parallel-join-runtime.mjs";
import { MockA2ADelegateExecutor } from "./delegate-executor.mjs";
import { executeDelegateNode } from "./delegate-runtime.mjs";
import { executeSubworkflowNode } from "./subworkflow-runtime.mjs";
import {
  assertNoInterruptInParallelBranch,
  assertWorkflowGraphInvariants,
  buildOutgoing,
} from "./workflow-graph-invariants.mjs";
import {
  buildSetStateOutput,
  resolveSwitchTarget,
  runPlaceholderActivityStep,
  runWaitNodeExecution,
  summarizePrompt,
} from "./workflow-node-execution.mjs";
import {
  NondeterminismError,
  RESUME_FAILURE_CODE,
  checkpointDefinitionMeta,
  commandIdentity,
  expectedCommandIdentity,
  findLatestNonCheckpointEvent,
  findPendingActivityRequest,
  findLatestTerminalEvent,
  buildCancelledRunResult,
  findPendingSignalWait,
  isParallelSpanPayload,
  isPendingActivityCompletionContinuation,
  isPendingSignalWaitContinuation,
  latestPrimaryEvent,
  latestStateFromHistory,
  parallelSpansEqual,
  verifyHostContinuationInput,
  resolveCheckpointConfig,
  throwIfStateInvalid,
  verifyCallerDefinitionMatchesCheckpoint,
} from "./workflow-graph-walker-support.mjs";

const require = createRequire(import.meta.url);

/** @returns {{ json: (data: unknown, query: string, flags?: string[]) => Promise<unknown> }} */
function loadJq() {
  return require("jq-wasm");
}

const PLACEHOLDER_TYPES = new Set(["step", "llm_call", "tool_call"]);
const HOST_SUBMIT_NODE_TYPES = new Set([...PLACEHOLDER_TYPES, "agent_delegate"]);

/**
 * @typedef {import("./workflow-node-execution.mjs").ParallelSpanPayload} ParallelSpanPayload
 * @typedef {object} RunGraphWorkflowOptions
 * @property {object} definition
 * @property {Record<string, unknown>} input
 * @property {string} executionId
 * @property {import("../persistence/types.mjs").ExecutionHistoryStore} store
 * @property {Record<string, Record<string, unknown>>} [stubActivityOutputs]
 * @property {import("./activity-executor.mjs").ActivityExecutor} [activityExecutor]
 * @property {"in_process" | "host_mediated"} [activityExecutionMode] default in-process stub/executor; `host_mediated` yields after `ActivityRequested` until `submitActivityOutcome`.
 * @property {number} [subworkflowDepth] nested subworkflow depth (default 0).
 * @property {number} [maxSubworkflowDepth] max nested depth (default 4).
 * @property {boolean} [assertNoSubworkflowInvocation] when true, nested child runs throw (conformance replay).
 * @property {import("./delegate-executor.mjs").DelegateExecutor} [delegateExecutor]
 * @property {boolean} [assertNoDelegateExecutorInvocation] when true, delegate port must not run (conformance replay).
 */

/**
 * @param {RunGraphWorkflowOptions} options
 * @returns {Promise<
 *   | { status: "completed"; finalState: Record<string, unknown>; result?: unknown }
 *   | { status: "failed"; error: string; finalState?: Record<string, unknown> }
 *   | { status: "interrupted"; executionId: string; nodeId: string; state: Record<string, unknown> }
 *   | { status: "awaiting_activity"; executionId: string; nodeId: string; state: Record<string, unknown>; parallelSpan?: ParallelSpanPayload; agentId?: string; protocol?: string; delegateInput?: Record<string, unknown>; delegateCorrelationId?: string }
 *   | { status: "awaiting_signal"; executionId: string; nodeId: string; state: Record<string, unknown>; signalName: string }
 *   | { status: "cancelled"; executionId: string; finalState?: Record<string, unknown>; reason?: string }
 * >}
 */
export async function runGraphWorkflow(options) {
  const {
    definition,
    input,
    executionId,
    store,
    stubActivityOutputs = {},
    activityExecutor,
    activityExecutionMode = "in_process",
    subworkflowDepth = 0,
    maxSubworkflowDepth = 4,
    assertNoSubworkflowInvocation = false,
    delegateExecutor,
    assertNoDelegateExecutorInvocation = false,
  } = options;
  const executor = activityExecutor ?? new StubActivityExecutor(stubActivityOutputs);
  const delegatePort = delegateExecutor ?? new MockA2ADelegateExecutor();

  if (!definition || typeof definition !== "object") {
    return { status: "failed", error: "definition must be a non-null object" };
  }
  if (!Number.isInteger(subworkflowDepth) || subworkflowDepth < 0) {
    return { status: "failed", error: "subworkflowDepth must be a non-negative integer" };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { status: "failed", error: "input must be a plain object" };
  }
  if (typeof executionId !== "string" || !executionId) {
    return { status: "failed", error: "executionId must be a non-empty string" };
  }
  if (!store || typeof store.append !== "function") {
    return { status: "failed", error: "store must implement ExecutionHistoryStore.append" };
  }

  const v = validateWorkflowDefinition(definition);
  if (!v.ok) {
    const msg = v.errors?.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ") ?? "schema validation failed";
    const profileCode = v.errors?.find(
      (e) => e.params && typeof e.params === "object" && typeof e.params.code === "string"
    )?.params?.code;
    return {
      status: "failed",
      error: msg,
      code: profileCode ?? "VALIDATION_ERROR",
    };
  }

  try {
    assertNoCustomReducers(definition);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error: msg };
  }

  /** @type {{ enabled: boolean; mode: "each" | "interval"; intervalN?: number }} */
  let checkpointConfig;
  try {
    checkpointConfig = resolveCheckpointConfig(definition);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error: msg };
  }
  let checkpointIntervalCounter = 0;

  const nodes = /** @type {{ nodes: Array<{ id: string; type: string; config?: object }>; edges: Array<{ source: string; target: string }>; state_schema: object; document: { name?: string; version?: string } }} */ (
    definition
  ).nodes;
  const edges = definition.edges;
  const outgoing = buildOutgoing(edges);

  try {
    assertWorkflowGraphInvariants(nodes, outgoing);
    assertNoInterruptInParallelBranch(definition);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = e instanceof Error && "code" in e && typeof e.code === "string" ? e.code : undefined;
    return { status: "failed", error: msg, ...(code ? { code } : {}) };
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const existingRows = store.listByExecution(executionId);
  assertHistoryReadableByEngine(existingRows);
  if (existingRows.length > 0) {
    const cancelled = buildCancelledRunResult(existingRows, executionId);
    if (cancelled) {
      return cancelled;
    }
    const definitionBind = verifyCallerDefinitionMatchesCheckpoint(definition, existingRows);
    if (!definitionBind.ok) {
      return {
        status: "failed",
        error: definitionBind.error,
        code: "SUBMIT_VALIDATION_ERROR",
      };
    }
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const definitionMeta = checkpointDefinitionMeta(definition);
  const validateState = ajv.compile(stateSchemaForValidation(definition.state_schema));
  const jq = loadJq();
  const replay = hydrateReplayContext({ executionId, store, startMode: "genesis" });
  let commandCursor = 0;

  /** @type {Record<string, unknown>} */
  let state = { ...input };

  function appendCmd(name, payload) {
    const expected = replay.commands[commandCursor];
    const fullPayload = { executionId, ...payload };
    if (expected) {
      const expectedIdentity = commandIdentity(expected);
      const actualIdentity = expectedCommandIdentity(name, fullPayload);
      const namesMatch = expectedIdentity.name === actualIdentity.name;
      const expectedNode = expectedIdentity.nodeId;
      const actualNode = actualIdentity.nodeId;
      const nodesMatch =
        expectedNode === undefined || actualNode === undefined ? expectedNode === actualNode : expectedNode === actualNode;
      if (!namesMatch || !nodesMatch) {
        throw new NondeterminismError(
          `Deterministic replay mismatch at command index ${commandCursor + 1} (history seq ${expected.seq}).`,
          {
            expected: expectedIdentity,
            actual: actualIdentity,
          }
        );
      }
      commandCursor += 1;
      return { replayed: true };
    }
    store.append(executionId, { kind: "command", name, payload: fullPayload });
    return { replayed: false };
  }
  function appendEvt(name, payload) {
    return store.append(executionId, { kind: "event", name, payload: { executionId, ...payload } });
  }
  /**
   * @param {string} nodeId
   * @param {Record<string, unknown>} stateSnapshot
   * @param {number} lastAppliedEventSeq
   * @param {{ parallelNodeId: string; joinTargetId: string; branchName: string; branchEntryNodeId: string }} [parallelSpan]
   */
  function appendCheckpoint(nodeId, stateSnapshot, lastAppliedEventSeq, parallelSpan) {
    if (!checkpointConfig.enabled) return;
    if (checkpointConfig.mode === "interval") {
      checkpointIntervalCounter += 1;
      if (checkpointIntervalCounter % /** @type {number} */ (checkpointConfig.intervalN) !== 0) return;
    }
    const policyPayload =
      checkpointConfig.mode === "interval"
        ? { policy: "every_n_nodes", intervalNodes: checkpointConfig.intervalN }
        : { policy: "after_each_node" };
    /** @type {Record<string, unknown>} */
    const cpPayload = {
      ...policyPayload,
      workflowVersion: definitionMeta.workflowVersion,
      definitionHash: definitionMeta.definitionHash,
      lastAppliedEventSeq,
      nodeId,
      stateRef: {
        kind: "inline_state",
        state: JSON.parse(JSON.stringify(stateSnapshot)),
      },
    };
    if (
      parallelSpan &&
      typeof parallelSpan.parallelNodeId === "string" &&
      typeof parallelSpan.joinTargetId === "string" &&
      typeof parallelSpan.branchName === "string" &&
      typeof parallelSpan.branchEntryNodeId === "string"
    ) {
      cpPayload.parallelSpan = {
        parallelNodeId: parallelSpan.parallelNodeId,
        joinTargetId: parallelSpan.joinTargetId,
        branchName: parallelSpan.branchName,
        branchEntryNodeId: parallelSpan.branchEntryNodeId,
      };
    }
    appendEvt("CheckpointWritten", cpPayload);
  }

  const { executeParallelBlock } = createParallelJoinRuntime({
    byId,
    outgoing,
    hooks: {
      getState: () => state,
      setState: (s) => {
        state = s;
      },
      appendCmd,
      appendEvt,
      appendCheckpoint,
      throwIfStateInvalid: (st, ctx) => throwIfStateInvalid(validateState, st, ctx),
      stateSchema: definition.state_schema,
      jq,
      resolveSwitchTarget,
      buildSetStateOutput,
      runWaitNode: async (node, scheduled) => {
        const signalAlreadyReceived =
          scheduled.replayed &&
          existingRows.some(
            (r) =>
              r.kind === "event" &&
              r.name === "SignalReceived" &&
              r.payload?.nodeId === node.id
          );
        const waitResult = await runWaitNodeExecution(
          node.id,
          scheduled,
          appendCmd,
          appendEvt,
          node.config,
          { signalAlreadyReceived }
        );
        if (waitResult && waitResult.kind === "awaiting_signal") {
          return waitResult;
        }
      },
      runPlaceholderActivity: async (node, scheduled, st, parallelSpan) => {
        const step = await runPlaceholderActivityStep({
          node,
          scheduled,
          state: st,
          executionId,
          executor,
          replay,
          activityExecutionMode,
          appendEvt,
          parallelSpan,
        });
        if (step.kind === "awaiting_activity") {
          return {
            kind: /** @type {"awaiting_activity"} */ ("awaiting_activity"),
            nodeId: step.nodeId,
            ...(step.parallelSpan ? { parallelSpan: step.parallelSpan } : {}),
          };
        }
        if (step.kind === "failed") {
          return {
            ok: /** @type {false} */ (false),
            error: step.error,
            ...(step.code !== undefined ? { code: step.code } : {}),
          };
        }
        return { ok: /** @type {true} */ (true), output: step.output };
      },
    },
  });

  try {
    /** @type {string} */
    let current;
    const pendingActivityContinuation = isPendingActivityCompletionContinuation(existingRows, (nodeId) =>
      byId.get(nodeId)?.type
    );
    const pendingSignalContinuation = isPendingSignalWaitContinuation(existingRows);
    const pendingSignalWait = findPendingSignalWait(existingRows);

    if (pendingSignalWait && !pendingSignalContinuation && !pendingActivityContinuation) {
      const nodeId = typeof pendingSignalWait.payload?.nodeId === "string" ? pendingSignalWait.payload.nodeId : "";
      const signalName =
        typeof pendingSignalWait.payload?.signalName === "string" ? pendingSignalWait.payload.signalName : "";
      const histState = latestStateFromHistory(existingRows);
      return {
        status: "awaiting_signal",
        executionId,
        nodeId,
        state: histState ? { ...histState } : { ...input },
        signalName,
      };
    }

    if (pendingActivityContinuation) {
      const inputCheck = verifyHostContinuationInput(existingRows, input);
      if (!inputCheck.ok) {
        return { status: "failed", error: inputCheck.error, code: "SUBMIT_VALIDATION_ERROR" };
      }

      commandCursor = replay.commands.length;
      const histState = latestStateFromHistory(existingRows);
      state = histState ? { ...histState } : { ...input };

      const lastCompleted = findLatestNonCheckpointEvent(existingRows);
      const activityNodeId =
        lastCompleted && typeof lastCompleted.payload?.nodeId === "string" ? lastCompleted.payload.nodeId : "";
      const activityNode = activityNodeId ? byId.get(activityNodeId) : undefined;
      if (!activityNode || !HOST_SUBMIT_NODE_TYPES.has(activityNode.type)) {
        throw new Error(`Cannot continue: pending activity node "${activityNodeId}" is missing or invalid.`);
      }

      const rawResult = lastCompleted?.payload?.result;
      /** @type {Record<string, unknown>} */
      const output =
        rawResult && typeof rawResult === "object" && !Array.isArray(rawResult)
          ? /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(rawResult)))
          : {};

      state = /** @type {Record<string, unknown>} */ (
        applyOutputWithReducers(state, output, definition.state_schema)
      );
      throwIfStateInvalid(validateState, state, `State invalid after activity "${activityNodeId}"`);

      appendCmd("CompleteNode", { nodeId: activityNodeId, output });
      const activityStateSeq = appendEvt("StateUpdated", {
        nodeId: activityNodeId,
        state: JSON.parse(JSON.stringify(state)),
      });
      appendCheckpoint(activityNodeId, state, activityStateSeq);

      const activityOuts = outgoing.get(activityNodeId) ?? [];
      if (activityOuts.length !== 1) {
        throw new Error(
          `Node "${activityNodeId}" must have exactly one outgoing edge after activity completion; found ${activityOuts.length}.`
        );
      }
      current = activityOuts[0];
    } else if (pendingSignalContinuation) {
      commandCursor = replay.commands.length;
      const histState = latestStateFromHistory(existingRows);
      state = histState ? { ...histState } : { ...input };

      const lastReceived = findLatestNonCheckpointEvent(existingRows);
      const waitNodeId =
        lastReceived && typeof lastReceived.payload?.nodeId === "string" ? lastReceived.payload.nodeId : "";
      const waitNode = waitNodeId ? byId.get(waitNodeId) : undefined;
      if (!waitNode || waitNode.type !== "wait") {
        throw new Error(`Cannot continue: pending signal wait node "${waitNodeId}" is missing or invalid.`);
      }

      const rawSignalPayload = lastReceived?.payload?.payload;
      /** @type {Record<string, unknown>} */
      const signalOutput =
        rawSignalPayload && typeof rawSignalPayload === "object" && !Array.isArray(rawSignalPayload)
          ? /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(rawSignalPayload)))
          : {};
      state = /** @type {Record<string, unknown>} */ (
        applyOutputWithReducers(state, signalOutput, definition.state_schema)
      );
      throwIfStateInvalid(validateState, state, `State invalid after signal delivery at "${waitNodeId}"`);

      appendCmd("CompleteNode", { nodeId: waitNodeId, output: signalOutput });
      const signalStateSeq = appendEvt("StateUpdated", {
        nodeId: waitNodeId,
        state: JSON.parse(JSON.stringify(state)),
      });
      appendCheckpoint(waitNodeId, state, signalStateSeq);
      throwIfStateInvalid(validateState, state, `State invalid after signal wait "${waitNodeId}"`);

      const waitOuts = outgoing.get(waitNodeId) ?? [];
      if (waitOuts.length !== 1) {
        throw new Error(
          `Node "${waitNodeId}" (wait) must have exactly one outgoing edge after signal; found ${waitOuts.length}.`
        );
      }
      current = waitOuts[0];
    } else {
      const hasExecutionStarted = existingRows.some(
        (r) => r.kind === "event" && r.name === "ExecutionStarted"
      );
      if (!hasExecutionStarted) {
        appendEvt("ExecutionStarted", {
          workflowName: definition.document?.name,
          workflowVersion: definition.document?.version,
          inputKeys: Object.keys(input),
        });
      }

      throwIfStateInvalid(validateState, state, "Initial state invalid vs state_schema");

      const startOut = outgoing.get("__start__") ?? [];
      current = startOut[0];
    }

    while (true) {
      const node = byId.get(current);
      if (!node) {
        throw new Error(`Edge references unknown node id "${current}".`);
      }

      const scheduled = appendCmd("ScheduleNode", { nodeId: current });
      appendEvt("NodeScheduled", { nodeId: current });

      if (node.type === "switch") {
        let targetId;
        try {
          targetId = await resolveSwitchTarget(node, state, jq);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          appendCmd("FailNode", { nodeId: current, reason: "switch_routing_failed", message: msg });
          appendEvt("ExecutionFailed", { error: msg });
          return { status: "failed", error: msg, finalState: state };
        }
        if (!byId.has(targetId)) {
          const msg = `switch "${node.id}" resolved to unknown target "${targetId}"`;
          appendCmd("FailNode", { nodeId: current, reason: "switch_routing_failed", message: msg });
          appendEvt("ExecutionFailed", { error: msg });
          return { status: "failed", error: msg, finalState: state };
        }

        appendCmd("CompleteNode", { nodeId: current, output: {} });
        const stateUpdatedSeq = appendEvt("StateUpdated", { nodeId: current, state: JSON.parse(JSON.stringify(state)) });
        appendCheckpoint(current, state, stateUpdatedSeq);
        throwIfStateInvalid(validateState, state, `State invalid after switch "${current}"`);

        current = targetId;
        continue;
      }

      if (node.type === "interrupt") {
        const promptSummary = summarizePrompt(node);
        appendCmd("RaiseInterrupt", { nodeId: current, prompt: promptSummary });
        const interruptSeq = appendEvt("InterruptRaised", { nodeId: current, prompt: promptSummary });
        appendCheckpoint(current, state, interruptSeq);
        return {
          status: "interrupted",
          executionId,
          nodeId: current,
          state: JSON.parse(JSON.stringify(state)),
        };
      }

      if (node.type === "parallel") {
        const pOuts = outgoing.get(current) ?? [];
        if (pOuts.length !== 1) {
          throw new Error(
            `parallel "${current}" must have exactly one outgoing edge (join target); found ${pOuts.length}.`
          );
        }
        const joinTarget = pOuts[0];
        const pr = await executeParallelBlock(
          /** @type {{ id: string; type: string; config?: object }} */ (node),
          joinTarget
        );
        if (pr.kind === "awaiting_activity") {
          return {
            status: "awaiting_activity",
            executionId,
            nodeId: pr.nodeId,
            state: pr.state,
            ...(pr.parallelSpan ? { parallelSpan: pr.parallelSpan } : {}),
          };
        }
        if (pr.kind === "awaiting_signal") {
          return {
            status: "awaiting_signal",
            executionId,
            nodeId: pr.nodeId,
            state: pr.state,
            signalName: pr.signalName,
          };
        }
        if (pr.kind === "interrupt") {
          return {
            status: "interrupted",
            executionId,
            nodeId: pr.nodeId,
            state: pr.state,
          };
        }
        if (pr.kind === "failed") {
          return {
            status: "failed",
            error: pr.error,
            finalState: state,
            ...(pr.code !== undefined ? { code: pr.code } : {}),
          };
        }
        appendCmd("CompleteNode", { nodeId: current, output: {} });
        const pStateSeq = appendEvt("StateUpdated", { nodeId: current, state: JSON.parse(JSON.stringify(state)) });
        appendCheckpoint(current, state, pStateSeq);
        throwIfStateInvalid(validateState, state, `State invalid after parallel "${current}"`);
        current = joinTarget;
        continue;
      }

      if (node.type === "wait") {
        const signalAlreadyReceived =
          scheduled.replayed &&
          existingRows.some(
            (r) =>
              r.kind === "event" &&
              r.name === "SignalReceived" &&
              r.payload?.nodeId === current
          );
        let waitResult;
        try {
          waitResult = await runWaitNodeExecution(
            current,
            scheduled,
            appendCmd,
            appendEvt,
            node.config,
            { signalAlreadyReceived }
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          appendCmd("FailNode", { nodeId: current, reason: "wait_failed", message: msg });
          appendEvt("ExecutionFailed", { error: msg });
          return { status: "failed", error: msg, finalState: state };
        }
        if (waitResult && waitResult.kind === "awaiting_signal") {
          return {
            status: "awaiting_signal",
            executionId,
            nodeId: waitResult.nodeId,
            state: JSON.parse(JSON.stringify(state)),
            signalName: waitResult.signalName,
          };
        }
        appendCmd("CompleteNode", { nodeId: current, output: {} });
        const wStateSeq = appendEvt("StateUpdated", { nodeId: current, state: JSON.parse(JSON.stringify(state)) });
        appendCheckpoint(current, state, wStateSeq);
        throwIfStateInvalid(validateState, state, `State invalid after wait "${current}"`);
        const wNext = outgoing.get(current) ?? [];
        if (wNext.length !== 1) {
          throw new Error(`Node "${current}" (wait) must have exactly one outgoing edge; found ${wNext.length}.`);
        }
        current = wNext[0];
        continue;
      }

      if (node.type === "set_state") {
        let stOutput;
        try {
          stOutput = await buildSetStateOutput(node, state, jq);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          appendCmd("FailNode", { nodeId: current, reason: "set_state_failed", message: msg });
          appendEvt("ExecutionFailed", { error: msg });
          return { status: "failed", error: msg, finalState: state };
        }
        appendCmd("CompleteNode", { nodeId: current, output: stOutput });
        state = /** @type {Record<string, unknown>} */ (
          applyOutputWithReducers(state, stOutput, definition.state_schema)
        );
        const ssSeq = appendEvt("StateUpdated", { nodeId: current, state: JSON.parse(JSON.stringify(state)) });
        appendCheckpoint(current, state, ssSeq);
        throwIfStateInvalid(validateState, state, `State invalid after set_state "${current}"`);
        const ssNext = outgoing.get(current) ?? [];
        if (ssNext.length !== 1) {
          throw new Error(`Node "${current}" (set_state) must have exactly one outgoing edge; found ${ssNext.length}.`);
        }
        current = ssNext[0];
        continue;
      }

      if (node.type === "subworkflow") {
        const sw = await executeSubworkflowNode({
          node: /** @type {{ id: string; config?: object }} */ (node),
          state,
          executionId,
          parentDefinition: definition,
          store,
          appendCmd,
          appendEvt,
          scheduled,
          replay,
          subworkflowDepth,
          maxSubworkflowDepth,
          stubActivityOutputs,
          activityExecutor: executor,
          activityExecutionMode,
          assertNoSubworkflowInvocation,
          delegateExecutor: delegatePort,
          assertNoDelegateExecutorInvocation,
          runGraphWorkflow,
          jq,
        });
        if (sw.kind === "failed") {
          appendCmd("FailNode", { nodeId: current, reason: "subworkflow_failed", message: sw.error });
          appendEvt("ExecutionFailed", { error: sw.error });
          return { status: "failed", error: sw.error, finalState: state };
        }
        appendCmd("CompleteNode", { nodeId: current, output: sw.mergedOutput });
        state = /** @type {Record<string, unknown>} */ (
          applyOutputWithReducers(state, sw.mergedOutput, definition.state_schema)
        );
        const swStateSeq = appendEvt("StateUpdated", {
          nodeId: current,
          state: JSON.parse(JSON.stringify(state)),
        });
        appendCheckpoint(current, state, swStateSeq);
        throwIfStateInvalid(validateState, state, `State invalid after subworkflow "${current}"`);
        const swNext = outgoing.get(current) ?? [];
        if (swNext.length !== 1) {
          throw new Error(
            `Node "${current}" (subworkflow) must have exactly one outgoing edge; found ${swNext.length}.`
          );
        }
        current = swNext[0];
        continue;
      }

      if (node.type === "agent_delegate") {
        const del = await executeDelegateNode({
          node: /** @type {{ id: string; config?: object }} */ (node),
          state,
          executionId,
          scheduled,
          replay,
          delegateExecutor: delegatePort,
          assertNoDelegateExecutorInvocation,
          activityExecutionMode,
          appendEvt,
          jq,
        });
        if (del.kind === "awaiting_activity") {
          return {
            status: "awaiting_activity",
            executionId,
            nodeId: del.nodeId,
            state: JSON.parse(JSON.stringify(state)),
            agentId: del.agentId,
            protocol: del.protocol,
            delegateInput: del.delegateInput,
            delegateCorrelationId: del.delegateCorrelationId,
          };
        }
        if (del.kind === "failed") {
          appendCmd("FailNode", {
            nodeId: current,
            reason: "delegate_failed",
            message: del.error,
            ...(del.code !== undefined ? { code: del.code } : {}),
          });
          appendEvt("ExecutionFailed", { error: del.error });
          return { status: "failed", error: del.error, finalState: state };
        }
        appendCmd("CompleteNode", { nodeId: current, output: del.output });
        state = /** @type {Record<string, unknown>} */ (
          applyOutputWithReducers(state, del.output, definition.state_schema)
        );
        const delStateSeq = appendEvt("StateUpdated", {
          nodeId: current,
          state: JSON.parse(JSON.stringify(state)),
        });
        appendCheckpoint(current, state, delStateSeq);
        throwIfStateInvalid(validateState, state, `State invalid after agent_delegate "${current}"`);
        const delNext = outgoing.get(current) ?? [];
        if (delNext.length !== 1) {
          throw new Error(
            `Node "${current}" (agent_delegate) must have exactly one outgoing edge; found ${delNext.length}.`
          );
        }
        current = delNext[0];
        continue;
      }

      /** @type {Record<string, unknown>} */
      let output = {};

      if (node.type === "start" || node.type === "end") {
        output = {};
      } else if (PLACEHOLDER_TYPES.has(node.type)) {
        const step = await runPlaceholderActivityStep({
          node: /** @type {{ id: string; type: string; config?: object }} */ (node),
          scheduled,
          state,
          executionId,
          executor,
          replay,
          activityExecutionMode,
          appendEvt,
          parallelSpan: undefined,
        });
        if (step.kind === "awaiting_activity") {
          return {
            status: "awaiting_activity",
            executionId,
            nodeId: step.nodeId,
            state: JSON.parse(JSON.stringify(state)),
            ...(step.parallelSpan ? { parallelSpan: step.parallelSpan } : {}),
          };
        }
        if (step.kind === "failed") {
          const { error, code } = step;
          appendCmd("FailNode", {
            nodeId: current,
            reason: "activity_failed",
            message: error,
            ...(code !== undefined ? { code } : {}),
          });
          appendEvt("ExecutionFailed", { error });
          return { status: "failed", error, finalState: state };
        }
        output = step.output;
      } else {
        throw new Error(`Unsupported node type "${node.type}"`);
      }

      appendCmd("CompleteNode", { nodeId: current, output });

      if (node.type === "end") {
        const mapping =
          node.config && typeof node.config === "object" && "output_mapping" in node.config
            ? String(/** @type {{ output_mapping?: string }} */ (node.config).output_mapping ?? "")
            : "";

        let result;
        try {
          const query = mapping.trim() ? mapping : ".";
          result = await jq.json(state, query);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          appendCmd("FailNode", { nodeId: current, reason: "output_mapping_jq_failed", message: msg });
          appendEvt("ExecutionFailed", { error: msg });
          return { status: "failed", error: `end output_mapping (jq) failed: ${msg}`, finalState: state };
        }

        appendEvt("ExecutionCompleted", { result });
        return { status: "completed", finalState: state, result };
      }

      state = /** @type {Record<string, unknown>} */ (
        applyOutputWithReducers(state, output, definition.state_schema)
      );
      appendEvt("StateUpdated", { nodeId: current, state: JSON.parse(JSON.stringify(state)) });
      throwIfStateInvalid(validateState, state, `State invalid after node "${current}"`);

      const outs = outgoing.get(current) ?? [];
      if (outs.length !== 1) {
        throw new Error(
          `Node "${current}" (type "${node.type}") must have exactly one outgoing edge; found ${outs.length}.`
        );
      }
      current = outs[0];
    }
  } catch (e) {
    if (e instanceof NondeterminismError) {
      appendEvt("ExecutionFailed", {
        error: e.message,
        code: e.code,
        context: e.context,
      });
      return {
        status: "failed",
        error: `${e.code}: ${e.message}`,
        finalState: state,
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    appendCmd("FailNode", { reason: "orchestration_error", message: msg });
    appendEvt("ExecutionFailed", { error: msg });
    return { status: "failed", error: msg, finalState: state };
  }
}

/**
 * @typedef {object} ResumeGraphWorkflowOptions
 * @property {object} definition
 * @property {string} executionId
 * @property {import("../persistence/types.mjs").ExecutionHistoryStore} store
 * @property {Record<string, unknown>} resumePayload
 * @property {Record<string, Record<string, unknown>>} [stubActivityOutputs]
 * @property {import("./activity-executor.mjs").ActivityExecutor} [activityExecutor]
 * @property {"in_process" | "host_mediated"} [activityExecutionMode]
 * @property {number} [subworkflowDepth] nested subworkflow depth (default 0).
 * @property {number} [maxSubworkflowDepth] max nested depth (default 4).
 * @property {boolean} [assertNoSubworkflowInvocation] when true, nested child runs throw (conformance replay).
 * @property {import("./delegate-executor.mjs").DelegateExecutor} [delegateExecutor]
 * @property {boolean} [assertNoDelegateExecutorInvocation] when true, delegate port must not run (conformance replay).
 */

/**
 * @param {ResumeGraphWorkflowOptions} options
 * @returns {Promise<
 *   | { status: "completed"; finalState: Record<string, unknown>; result?: unknown }
 *   | { status: "failed"; error: string; finalState?: Record<string, unknown> }
 *   | { status: "interrupted"; executionId: string; nodeId: string; state: Record<string, unknown> }
 *   | { status: "awaiting_activity"; executionId: string; nodeId: string; state: Record<string, unknown>; parallelSpan?: ParallelSpanPayload; agentId?: string; protocol?: string; delegateInput?: Record<string, unknown>; delegateCorrelationId?: string }
 *   | { status: "awaiting_signal"; executionId: string; nodeId: string; state: Record<string, unknown>; signalName: string }
 * >}
 */
export async function resumeGraphWorkflow(options) {
  const {
    definition,
    executionId,
    store,
    resumePayload,
    stubActivityOutputs = {},
    activityExecutor,
    activityExecutionMode = "in_process",
    subworkflowDepth = 0,
    maxSubworkflowDepth = 4,
    assertNoSubworkflowInvocation = false,
    delegateExecutor,
    assertNoDelegateExecutorInvocation = false,
  } = options;
  const executor = activityExecutor ?? new StubActivityExecutor(stubActivityOutputs);
  const delegatePort = delegateExecutor ?? new MockA2ADelegateExecutor();

  if (!definition || typeof definition !== "object") {
    return { status: "failed", error: "definition must be a non-null object" };
  }
  if (typeof executionId !== "string" || !executionId) {
    return { status: "failed", error: "executionId must be a non-empty string" };
  }
  if (!store || typeof store.listByExecution !== "function") {
    return { status: "failed", error: "store must implement ExecutionHistoryStore.listByExecution" };
  }
  if (!resumePayload || typeof resumePayload !== "object" || Array.isArray(resumePayload)) {
    return { status: "failed", error: "resumePayload must be a plain object" };
  }

  const v = validateWorkflowDefinition(definition);
  if (!v.ok) {
    const msg = v.errors?.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ") ?? "schema validation failed";
    const profileCode = v.errors?.find(
      (e) => e.params && typeof e.params === "object" && typeof e.params.code === "string"
    )?.params?.code;
    return {
      status: "failed",
      error: msg,
      code: profileCode ?? "VALIDATION_ERROR",
    };
  }

  try {
    assertNoCustomReducers(definition);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error: msg };
  }

  /** @type {{ enabled: boolean; mode: "each" | "interval"; intervalN?: number }} */
  let resumeCheckpointConfig;
  try {
    resumeCheckpointConfig = resolveCheckpointConfig(definition);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error: msg };
  }
  let resumeCheckpointIntervalCounter = 0;

  const rows = store.listByExecution(executionId);
  assertHistoryReadableByEngine(rows);
  /**
   * @param {string} reason
   * @param {"INVALID_RESUME_PAYLOAD"} code
   * @param {Record<string, unknown> | undefined} [finalState]
   */
  function failResume(reason, code, finalState) {
    return { status: "failed", error: reason, ...(finalState ? { finalState } : {}), code };
  }
  if (rows.length > 0 && buildCancelledRunResult(rows, executionId)) {
    const err = "Cannot resume: execution was cancelled.";
    return failResume(err, RESUME_FAILURE_CODE.NOT_ALLOWED, latestStateFromHistory(rows));
  }
  const definitionBind = verifyCallerDefinitionMatchesCheckpoint(definition, rows);
  if (!definitionBind.ok) {
    return failResume(definitionBind.error, RESUME_FAILURE_CODE.VALIDATION_FAILED, latestStateFromHistory(rows));
  }
  const lastRow = latestPrimaryEvent(rows);
  if (!lastRow || lastRow.name !== "InterruptRaised") {
    const err = 'Cannot resume: last history event is not "InterruptRaised".';
    store.append(executionId, {
      kind: "command",
      name: "FailNode",
      payload: { executionId, reason: "resume_not_allowed", message: err },
    });
    store.append(executionId, { kind: "event", name: "ExecutionFailed", payload: { executionId, error: err } });
    return failResume(err, RESUME_FAILURE_CODE.NOT_ALLOWED, latestStateFromHistory(rows));
  }

  const interruptNodeId = typeof lastRow.payload?.nodeId === "string" ? lastRow.payload.nodeId : "";
  if (!interruptNodeId) {
    const err = "Cannot resume: InterruptRaised payload missing nodeId.";
    store.append(executionId, {
      kind: "command",
      name: "FailNode",
      payload: { executionId, reason: "resume_not_allowed", message: err },
    });
    store.append(executionId, { kind: "event", name: "ExecutionFailed", payload: { executionId, error: err } });
    return failResume(err, RESUME_FAILURE_CODE.NOT_ALLOWED, latestStateFromHistory(rows));
  }

  const nodes = /** @type {{ nodes: Array<{ id: string; type: string; config?: object }>; edges: Array<{ source: string; target: string }>; state_schema: object; document: { name?: string; version?: string } }} */ (
    definition
  ).nodes;
  const edges = definition.edges;
  const outgoing = buildOutgoing(edges);

  try {
    assertWorkflowGraphInvariants(nodes, outgoing);
    assertNoInterruptInParallelBranch(definition);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return failResume(msg, RESUME_FAILURE_CODE.NOT_ALLOWED, latestStateFromHistory(rows));
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const interruptNode = byId.get(interruptNodeId);
  if (!interruptNode || interruptNode.type !== "interrupt") {
    const err = `Cannot resume: node "${interruptNodeId}" is missing or not an interrupt.`;
    store.append(executionId, {
      kind: "command",
      name: "FailNode",
      payload: { executionId, nodeId: interruptNodeId, reason: "resume_not_allowed", message: err },
    });
    store.append(executionId, { kind: "event", name: "ExecutionFailed", payload: { executionId, error: err } });
    return failResume(err, RESUME_FAILURE_CODE.NOT_ALLOWED, latestStateFromHistory(rows));
  }

  const resumeSchemaRaw =
    interruptNode.config &&
    typeof interruptNode.config === "object" &&
    "resume_schema" in interruptNode.config &&
    /** @type {{ resume_schema?: unknown }} */ (interruptNode.config).resume_schema &&
    typeof /** @type {{ resume_schema?: object }} */ (interruptNode.config).resume_schema === "object"
      ? /** @type {{ resume_schema: object }} */ (interruptNode.config).resume_schema
      : null;

  if (!resumeSchemaRaw) {
    const err = `Interrupt node "${interruptNodeId}" has no resume_schema object.`;
    store.append(executionId, {
      kind: "command",
      name: "FailNode",
      payload: { executionId, nodeId: interruptNodeId, reason: "resume_validation_failed", message: err },
    });
    store.append(executionId, { kind: "event", name: "ExecutionFailed", payload: { executionId, error: err } });
    return failResume(err, RESUME_FAILURE_CODE.VALIDATION_FAILED, latestStateFromHistory(rows));
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const definitionMeta = checkpointDefinitionMeta(definition);
  const validateResume = ajv.compile(stateSchemaForValidation(resumeSchemaRaw));
  const okResume = validateResume(resumePayload);
  if (!okResume) {
    const detail =
      validateResume.errors?.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ") ?? "resume payload invalid";
    const err = `Resume payload invalid vs resume_schema: ${detail}`;
    store.append(executionId, {
      kind: "command",
      name: "FailNode",
      payload: {
        executionId,
        nodeId: interruptNodeId,
        reason: "resume_validation_failed",
        message: err,
      },
    });
    store.append(executionId, { kind: "event", name: "ExecutionFailed", payload: { executionId, error: err } });
    return failResume(err, RESUME_FAILURE_CODE.VALIDATION_FAILED, latestStateFromHistory(rows));
  }

  const baseState = latestStateFromHistory(rows);
  if (!baseState) {
    const err = "Cannot resume: no StateUpdated event found in history to reconstruct workflow state.";
    store.append(executionId, {
      kind: "command",
      name: "FailNode",
      payload: { executionId, nodeId: interruptNodeId, reason: "resume_not_allowed", message: err },
    });
    store.append(executionId, { kind: "event", name: "ExecutionFailed", payload: { executionId, error: err } });
    return failResume(err, RESUME_FAILURE_CODE.NOT_ALLOWED);
  }

  /** @type {Record<string, unknown>} */
  let state = { ...baseState, ...resumePayload };

  const validateState = ajv.compile(stateSchemaForValidation(definition.state_schema));
  const jq = loadJq();

  function appendCmd(name, payload) {
    store.append(executionId, { kind: "command", name, payload: { executionId, ...payload } });
  }
  function appendEvt(name, payload) {
    return store.append(executionId, { kind: "event", name, payload: { executionId, ...payload } });
  }
  /**
   * @param {string} nodeId
   * @param {Record<string, unknown>} stateSnapshot
   * @param {number} lastAppliedEventSeq
   * @param {{ parallelNodeId: string; joinTargetId: string; branchName: string; branchEntryNodeId: string }} [parallelSpan]
   */
  function appendCheckpoint(nodeId, stateSnapshot, lastAppliedEventSeq, parallelSpan) {
    if (!resumeCheckpointConfig.enabled) return;
    if (resumeCheckpointConfig.mode === "interval") {
      resumeCheckpointIntervalCounter += 1;
      if (resumeCheckpointIntervalCounter % /** @type {number} */ (resumeCheckpointConfig.intervalN) !== 0) return;
    }
    const policyPayload =
      resumeCheckpointConfig.mode === "interval"
        ? { policy: "every_n_nodes", intervalNodes: resumeCheckpointConfig.intervalN }
        : { policy: "after_each_node" };
    /** @type {Record<string, unknown>} */
    const cpPayload = {
      ...policyPayload,
      workflowVersion: definitionMeta.workflowVersion,
      definitionHash: definitionMeta.definitionHash,
      lastAppliedEventSeq,
      nodeId,
      stateRef: {
        kind: "inline_state",
        state: JSON.parse(JSON.stringify(stateSnapshot)),
      },
    };
    if (
      parallelSpan &&
      typeof parallelSpan.parallelNodeId === "string" &&
      typeof parallelSpan.joinTargetId === "string" &&
      typeof parallelSpan.branchName === "string" &&
      typeof parallelSpan.branchEntryNodeId === "string"
    ) {
      cpPayload.parallelSpan = {
        parallelNodeId: parallelSpan.parallelNodeId,
        joinTargetId: parallelSpan.joinTargetId,
        branchName: parallelSpan.branchName,
        branchEntryNodeId: parallelSpan.branchEntryNodeId,
      };
    }
    appendEvt("CheckpointWritten", cpPayload);
  }

  function resumeAppendCmd(name, payload) {
    appendCmd(name, payload);
    return { replayed: false };
  }

  const emptyReplay = { replayResults: /** @type {Map<string, Record<string, unknown>>} */ (new Map()) };

  const { executeParallelBlock: resumeExecuteParallel } = createParallelJoinRuntime({
    byId,
    outgoing,
    hooks: {
      getState: () => state,
      setState: (s) => {
        state = s;
      },
      appendCmd: resumeAppendCmd,
      appendEvt,
      appendCheckpoint,
      throwIfStateInvalid: (st, ctx) => throwIfStateInvalid(validateState, st, ctx),
      stateSchema: definition.state_schema,
      jq,
      resolveSwitchTarget,
      buildSetStateOutput,
      runWaitNode: async (node, scheduled) => {
        const waitResult = await runWaitNodeExecution(
          node.id,
          scheduled,
          resumeAppendCmd,
          appendEvt,
          node.config
        );
        if (waitResult && waitResult.kind === "awaiting_signal") {
          return waitResult;
        }
      },
      runPlaceholderActivity: async (node, _scheduled, st, parallelSpan) => {
        const step = await runPlaceholderActivityStep({
          node,
          scheduled: { replayed: false },
          state: st,
          executionId,
          executor,
          replay: /** @type {import("./replay-loader.mjs").ReplayHydrationResult} */ (emptyReplay),
          activityExecutionMode,
          appendEvt,
          parallelSpan,
        });
        if (step.kind === "awaiting_activity") {
          return {
            kind: /** @type {"awaiting_activity"} */ ("awaiting_activity"),
            nodeId: step.nodeId,
            ...(step.parallelSpan ? { parallelSpan: step.parallelSpan } : {}),
          };
        }
        if (step.kind === "failed") {
          return {
            ok: /** @type {false} */ (false),
            error: step.error,
            ...(step.code !== undefined ? { code: step.code } : {}),
          };
        }
        return { ok: /** @type {true} */ (true), output: step.output };
      },
    },
  });

  try {
    throwIfStateInvalid(validateState, state, "State invalid after merging resume payload");

    appendCmd("ResumeInterrupt", { nodeId: interruptNodeId });
    appendEvt("InterruptResumed", { nodeId: interruptNodeId });

    appendCmd("CompleteNode", { nodeId: interruptNodeId, output: { ...resumePayload } });
    const resumedStateSeq = appendEvt("StateUpdated", { nodeId: interruptNodeId, state: JSON.parse(JSON.stringify(state)) });
    appendCheckpoint(interruptNodeId, state, resumedStateSeq);
    throwIfStateInvalid(validateState, state, `State invalid after interrupt "${interruptNodeId}" completion`);

    const outs = outgoing.get(interruptNodeId) ?? [];
    if (outs.length !== 1) {
      throw new Error(`Interrupt node "${interruptNodeId}" must have exactly one outgoing edge; found ${outs.length}.`);
    }
    let current = outs[0];

    while (true) {
      const node = byId.get(current);
      if (!node) {
        throw new Error(`Edge references unknown node id "${current}".`);
      }

      appendCmd("ScheduleNode", { nodeId: current });
      appendEvt("NodeScheduled", { nodeId: current });

      if (node.type === "switch") {
        let targetId;
        try {
          targetId = await resolveSwitchTarget(node, state, jq);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          appendCmd("FailNode", { nodeId: current, reason: "switch_routing_failed", message: msg });
          appendEvt("ExecutionFailed", { error: msg });
          return { status: "failed", error: msg, finalState: state };
        }
        if (!byId.has(targetId)) {
          const msg = `switch "${node.id}" resolved to unknown target "${targetId}"`;
          appendCmd("FailNode", { nodeId: current, reason: "switch_routing_failed", message: msg });
          appendEvt("ExecutionFailed", { error: msg });
          return { status: "failed", error: msg, finalState: state };
        }

        appendCmd("CompleteNode", { nodeId: current, output: {} });
        const stateUpdatedSeq = appendEvt("StateUpdated", { nodeId: current, state: JSON.parse(JSON.stringify(state)) });
        appendCheckpoint(current, state, stateUpdatedSeq);
        throwIfStateInvalid(validateState, state, `State invalid after switch "${current}"`);

        current = targetId;
        continue;
      }

      if (node.type === "interrupt") {
        const promptSummary = summarizePrompt(node);
        appendCmd("RaiseInterrupt", { nodeId: current, prompt: promptSummary });
        const interruptSeq = appendEvt("InterruptRaised", { nodeId: current, prompt: promptSummary });
        appendCheckpoint(current, state, interruptSeq);
        return {
          status: "interrupted",
          executionId,
          nodeId: current,
          state: JSON.parse(JSON.stringify(state)),
        };
      }

      if (node.type === "parallel") {
        const pOuts = outgoing.get(current) ?? [];
        if (pOuts.length !== 1) {
          throw new Error(
            `parallel "${current}" must have exactly one outgoing edge (join target); found ${pOuts.length}.`
          );
        }
        const joinTarget = pOuts[0];
        const pr = await resumeExecuteParallel(
          /** @type {{ id: string; type: string; config?: object }} */ (node),
          joinTarget
        );
        if (pr.kind === "awaiting_activity") {
          return {
            status: "awaiting_activity",
            executionId,
            nodeId: pr.nodeId,
            state: pr.state,
            ...(pr.parallelSpan ? { parallelSpan: pr.parallelSpan } : {}),
          };
        }
        if (pr.kind === "awaiting_signal") {
          return {
            status: "awaiting_signal",
            executionId,
            nodeId: pr.nodeId,
            state: pr.state,
            signalName: pr.signalName,
          };
        }
        if (pr.kind === "interrupt") {
          return {
            status: "interrupted",
            executionId,
            nodeId: pr.nodeId,
            state: pr.state,
          };
        }
        if (pr.kind === "failed") {
          return {
            status: "failed",
            error: pr.error,
            finalState: state,
            ...(pr.code !== undefined ? { code: pr.code } : {}),
          };
        }
        appendCmd("CompleteNode", { nodeId: current, output: {} });
        const pStateSeq = appendEvt("StateUpdated", { nodeId: current, state: JSON.parse(JSON.stringify(state)) });
        appendCheckpoint(current, state, pStateSeq);
        throwIfStateInvalid(validateState, state, `State invalid after parallel "${current}"`);
        current = joinTarget;
        continue;
      }

      if (node.type === "wait") {
        let waitResult;
        try {
          waitResult = await runWaitNodeExecution(
            current,
            { replayed: false },
            resumeAppendCmd,
            appendEvt,
            node.config
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          appendCmd("FailNode", { nodeId: current, reason: "wait_failed", message: msg });
          appendEvt("ExecutionFailed", { error: msg });
          return { status: "failed", error: msg, finalState: state };
        }
        if (waitResult && waitResult.kind === "awaiting_signal") {
          return {
            status: "awaiting_signal",
            executionId,
            nodeId: waitResult.nodeId,
            state: JSON.parse(JSON.stringify(state)),
            signalName: waitResult.signalName,
          };
        }
        appendCmd("CompleteNode", { nodeId: current, output: {} });
        const wStateSeq = appendEvt("StateUpdated", { nodeId: current, state: JSON.parse(JSON.stringify(state)) });
        appendCheckpoint(current, state, wStateSeq);
        throwIfStateInvalid(validateState, state, `State invalid after wait "${current}"`);
        const wNext = outgoing.get(current) ?? [];
        if (wNext.length !== 1) {
          throw new Error(`Node "${current}" (wait) must have exactly one outgoing edge; found ${wNext.length}.`);
        }
        current = wNext[0];
        continue;
      }

      if (node.type === "set_state") {
        let stOutput;
        try {
          stOutput = await buildSetStateOutput(node, state, jq);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          appendCmd("FailNode", { nodeId: current, reason: "set_state_failed", message: msg });
          appendEvt("ExecutionFailed", { error: msg });
          return { status: "failed", error: msg, finalState: state };
        }
        appendCmd("CompleteNode", { nodeId: current, output: stOutput });
        state = /** @type {Record<string, unknown>} */ (
          applyOutputWithReducers(state, stOutput, definition.state_schema)
        );
        const ssSeq = appendEvt("StateUpdated", { nodeId: current, state: JSON.parse(JSON.stringify(state)) });
        appendCheckpoint(current, state, ssSeq);
        throwIfStateInvalid(validateState, state, `State invalid after set_state "${current}"`);
        const ssNext = outgoing.get(current) ?? [];
        if (ssNext.length !== 1) {
          throw new Error(`Node "${current}" (set_state) must have exactly one outgoing edge; found ${ssNext.length}.`);
        }
        current = ssNext[0];
        continue;
      }

      if (node.type === "subworkflow") {
        const sw = await executeSubworkflowNode({
          node: /** @type {{ id: string; config?: object }} */ (node),
          state,
          executionId,
          parentDefinition: definition,
          store,
          appendCmd: resumeAppendCmd,
          appendEvt,
          scheduled: { replayed: false },
          replay: /** @type {import("./replay-loader.mjs").ReplayHydrationResult} */ (emptyReplay),
          subworkflowDepth,
          maxSubworkflowDepth,
          stubActivityOutputs,
          activityExecutor: executor,
          activityExecutionMode,
          assertNoSubworkflowInvocation,
          delegateExecutor: delegatePort,
          assertNoDelegateExecutorInvocation,
          runGraphWorkflow,
          jq,
        });
        if (sw.kind === "failed") {
          appendCmd("FailNode", { nodeId: current, reason: "subworkflow_failed", message: sw.error });
          appendEvt("ExecutionFailed", { error: sw.error });
          return { status: "failed", error: sw.error, finalState: state };
        }
        appendCmd("CompleteNode", { nodeId: current, output: sw.mergedOutput });
        state = /** @type {Record<string, unknown>} */ (
          applyOutputWithReducers(state, sw.mergedOutput, definition.state_schema)
        );
        const swStateSeq = appendEvt("StateUpdated", {
          nodeId: current,
          state: JSON.parse(JSON.stringify(state)),
        });
        appendCheckpoint(current, state, swStateSeq);
        throwIfStateInvalid(validateState, state, `State invalid after subworkflow "${current}"`);
        const swNext = outgoing.get(current) ?? [];
        if (swNext.length !== 1) {
          throw new Error(
            `Node "${current}" (subworkflow) must have exactly one outgoing edge; found ${swNext.length}.`
          );
        }
        current = swNext[0];
        continue;
      }

      if (node.type === "agent_delegate") {
        const del = await executeDelegateNode({
          node: /** @type {{ id: string; config?: object }} */ (node),
          state,
          executionId,
          scheduled: { replayed: false },
          replay: /** @type {import("./replay-loader.mjs").ReplayHydrationResult} */ (emptyReplay),
          delegateExecutor: delegatePort,
          assertNoDelegateExecutorInvocation,
          activityExecutionMode,
          appendEvt,
          jq,
        });
        if (del.kind === "awaiting_activity") {
          return {
            status: "awaiting_activity",
            executionId,
            nodeId: del.nodeId,
            state: JSON.parse(JSON.stringify(state)),
            agentId: del.agentId,
            protocol: del.protocol,
            delegateInput: del.delegateInput,
            delegateCorrelationId: del.delegateCorrelationId,
          };
        }
        if (del.kind === "failed") {
          appendCmd("FailNode", {
            nodeId: current,
            reason: "delegate_failed",
            message: del.error,
            ...(del.code !== undefined ? { code: del.code } : {}),
          });
          appendEvt("ExecutionFailed", { error: del.error });
          return { status: "failed", error: del.error, finalState: state };
        }
        appendCmd("CompleteNode", { nodeId: current, output: del.output });
        state = /** @type {Record<string, unknown>} */ (
          applyOutputWithReducers(state, del.output, definition.state_schema)
        );
        const delStateSeq = appendEvt("StateUpdated", {
          nodeId: current,
          state: JSON.parse(JSON.stringify(state)),
        });
        appendCheckpoint(current, state, delStateSeq);
        throwIfStateInvalid(validateState, state, `State invalid after agent_delegate "${current}"`);
        const delNext = outgoing.get(current) ?? [];
        if (delNext.length !== 1) {
          throw new Error(
            `Node "${current}" (agent_delegate) must have exactly one outgoing edge; found ${delNext.length}.`
          );
        }
        current = delNext[0];
        continue;
      }

      /** @type {Record<string, unknown>} */
      let output = {};

      if (node.type === "start" || node.type === "end") {
        output = {};
      } else if (PLACEHOLDER_TYPES.has(node.type)) {
        const step = await runPlaceholderActivityStep({
          node: /** @type {{ id: string; type: string; config?: object }} */ (node),
          scheduled: { replayed: false },
          state,
          executionId,
          executor,
          replay: /** @type {import("./replay-loader.mjs").ReplayHydrationResult} */ (emptyReplay),
          activityExecutionMode,
          appendEvt,
          parallelSpan: undefined,
        });
        if (step.kind === "awaiting_activity") {
          return {
            status: "awaiting_activity",
            executionId,
            nodeId: step.nodeId,
            state: JSON.parse(JSON.stringify(state)),
            ...(step.parallelSpan ? { parallelSpan: step.parallelSpan } : {}),
          };
        }
        if (step.kind === "failed") {
          const { error, code } = step;
          appendCmd("FailNode", {
            nodeId: current,
            reason: "activity_failed",
            message: error,
            ...(code !== undefined ? { code } : {}),
          });
          appendEvt("ExecutionFailed", { error });
          return { status: "failed", error, finalState: state };
        }
        output = step.output;
      } else {
        throw new Error(`Unsupported node type "${node.type}"`);
      }

      appendCmd("CompleteNode", { nodeId: current, output });

      if (node.type === "end") {
        const mapping =
          node.config && typeof node.config === "object" && "output_mapping" in node.config
            ? String(/** @type {{ output_mapping?: string }} */ (node.config).output_mapping ?? "")
            : "";

        let result;
        try {
          const query = mapping.trim() ? mapping : ".";
          result = await jq.json(state, query);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          appendCmd("FailNode", { nodeId: current, reason: "output_mapping_jq_failed", message: msg });
          appendEvt("ExecutionFailed", { error: msg });
          return { status: "failed", error: `end output_mapping (jq) failed: ${msg}`, finalState: state };
        }

        appendEvt("ExecutionCompleted", { result });
        return { status: "completed", finalState: state, result };
      }

      state = /** @type {Record<string, unknown>} */ (
        applyOutputWithReducers(state, output, definition.state_schema)
      );
      const stateUpdatedSeq = appendEvt("StateUpdated", { nodeId: current, state: JSON.parse(JSON.stringify(state)) });
      appendCheckpoint(current, state, stateUpdatedSeq);
      throwIfStateInvalid(validateState, state, `State invalid after node "${current}"`);

      const nextOuts = outgoing.get(current) ?? [];
      if (nextOuts.length !== 1) {
        throw new Error(
          `Node "${current}" (type "${node.type}") must have exactly one outgoing edge; found ${nextOuts.length}.`
        );
      }
      current = nextOuts[0];
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendCmd("FailNode", { reason: "orchestration_error", message: msg });
    appendEvt("ExecutionFailed", { error: msg });
    return { status: "failed", error: msg, finalState: state };
  }
}

/**
 * @typedef {object} SubmitActivityOutcomeOptions
 * @property {object} definition
 * @property {string} executionId
 * @property {import("../persistence/types.mjs").ExecutionHistoryStore} store
 * @property {Record<string, unknown>} input Same `input` as the initial `runGraphWorkflow` / `startWorkflow` call (replay reconstruction requires it).
 * @property {string} nodeId Activity node id matching the pending `ActivityRequested` event.
 * @property {{ ok: true; result?: Record<string, unknown>; delegateCorrelationId?: string; externalTaskId?: string } | { ok: false; error: string; code?: string }} outcome
 * @property {ParallelSpanPayload} [expectedParallelSpan] Required when the pending request carries `parallelSpan` (parallel branches); must match exactly.
 * @property {"in_process" | "host_mediated"} [activityExecutionMode] Continuation mode for any further activities (default `host_mediated`).
 * @property {Record<string, Record<string, unknown>>} [stubActivityOutputs]
 * @property {import("./activity-executor.mjs").ActivityExecutor} [activityExecutor]
 * @property {number} [subworkflowDepth] nested subworkflow depth (default 0); must match the initial `runGraphWorkflow` call for this execution.
 * @property {number} [maxSubworkflowDepth] max nested depth (default 4).
 * @property {boolean} [assertNoSubworkflowInvocation] when true, nested child runs throw (conformance replay).
 */

/**
 * Append `ActivityCompleted` / `ActivityFailed` after a host-mediated yield and continue the graph walker from persisted history.
 *
 * @param {SubmitActivityOutcomeOptions} options
 * @returns {Promise<
 *   | { status: "completed"; finalState: Record<string, unknown>; result?: unknown }
 *   | { status: "failed"; error: string; finalState?: Record<string, unknown>; code?: string }
 *   | { status: "interrupted"; executionId: string; nodeId: string; state: Record<string, unknown> }
 *   | { status: "awaiting_activity"; executionId: string; nodeId: string; state: Record<string, unknown>; parallelSpan?: ParallelSpanPayload; agentId?: string; protocol?: string; delegateInput?: Record<string, unknown>; delegateCorrelationId?: string }
 *   | { status: "awaiting_signal"; executionId: string; nodeId: string; state: Record<string, unknown>; signalName: string }
 * >}
 */
export async function submitActivityOutcome(options) {
  const {
    definition,
    executionId,
    store,
    input,
    nodeId,
    outcome,
    expectedParallelSpan,
    activityExecutionMode = "host_mediated",
    stubActivityOutputs = {},
    activityExecutor,
    subworkflowDepth = 0,
    maxSubworkflowDepth = 4,
    assertNoSubworkflowInvocation = false,
    delegateExecutor,
    assertNoDelegateExecutorInvocation = false,
  } = options;

  if (!definition || typeof definition !== "object") {
    return { status: "failed", error: "definition must be a non-null object", code: "SUBMIT_VALIDATION_ERROR" };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { status: "failed", error: "input must be a plain object", code: "SUBMIT_VALIDATION_ERROR" };
  }
  if (typeof executionId !== "string" || !executionId) {
    return { status: "failed", error: "executionId must be a non-empty string", code: "SUBMIT_VALIDATION_ERROR" };
  }
  if (typeof nodeId !== "string" || !nodeId) {
    return { status: "failed", error: "nodeId must be a non-empty string", code: "SUBMIT_VALIDATION_ERROR" };
  }
  if (!store || typeof store.append !== "function" || typeof store.listByExecution !== "function") {
    return { status: "failed", error: "store must implement ExecutionHistoryStore", code: "SUBMIT_VALIDATION_ERROR" };
  }

  const v = validateWorkflowDefinition(definition);
  if (!v.ok) {
    const msg = v.errors?.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ") ?? "schema validation failed";
    return { status: "failed", error: msg, code: "SUBMIT_VALIDATION_ERROR" };
  }

  try {
    assertNoCustomReducers(definition);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error: msg, code: "SUBMIT_VALIDATION_ERROR" };
  }

  const rows = store.listByExecution(executionId);
  try {
    assertHistoryReadableByEngine(rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error: msg, code: "SUBMIT_VALIDATION_ERROR" };
  }
  if (rows.length === 0) {
    return {
      status: "failed",
      error: `Execution "${executionId}" was not found.`,
      code: "ACTIVITY_SUBMIT_NOT_AWAITING",
    };
  }

  const cancelled = buildCancelledRunResult(rows, executionId);
  if (cancelled) {
    return {
      status: "failed",
      error: "Cannot submit activity: execution was cancelled.",
      code: "ACTIVITY_SUBMIT_NOT_AWAITING",
    };
  }

  const definitionBind = verifyCallerDefinitionMatchesCheckpoint(definition, rows);
  if (!definitionBind.ok) {
    return { status: "failed", error: definitionBind.error, code: "SUBMIT_VALIDATION_ERROR" };
  }

  const last = findPendingActivityRequest(rows);
  if (!last || last.kind !== "event" || last.name !== "ActivityRequested") {
    return {
      status: "failed",
      error: 'Cannot submit activity outcome: last event is not "ActivityRequested".',
      code: "ACTIVITY_SUBMIT_NOT_AWAITING",
    };
  }
  const pendingNodeId = typeof last.payload?.nodeId === "string" ? last.payload.nodeId : "";
  if (pendingNodeId !== nodeId) {
    return {
      status: "failed",
      error: `Activity submit nodeId "${nodeId}" does not match pending node "${pendingNodeId}".`,
      code: "ACTIVITY_SUBMIT_NODE_MISMATCH",
    };
  }

  const reqSpan = last.payload?.parallelSpan;
  if (isParallelSpanPayload(reqSpan)) {
    if (!expectedParallelSpan || !parallelSpansEqual(expectedParallelSpan, reqSpan)) {
      return {
        status: "failed",
        error: "Activity submit parallelSpan does not match pending ActivityRequested.parallelSpan.",
        code: "ACTIVITY_SUBMIT_PARALLEL_MISMATCH",
      };
    }
  } else if (expectedParallelSpan) {
    return {
      status: "failed",
      error: "expectedParallelSpan was provided but pending activity is not in a parallel branch.",
      code: "ACTIVITY_SUBMIT_PARALLEL_MISMATCH",
    };
  }

  if (!outcome.ok) {
    const { error, code } = outcome;
    const attempt = typeof last.payload?.attempt === "number" && last.payload.attempt >= 1 ? last.payload.attempt : 1;
    const activityNode = /** @type {{ nodes?: Array<{ id: string; retry?: object; timeout?: string }> }} */ (definition).nodes?.find(
      (n) => n.id === nodeId
    );
    const maxAttempts = resolveMaxAttempts(activityNode ?? {});
    const retryPolicy = getRetryPolicy(activityNode ?? {});
    const timeoutMs = resolveNodeTimeoutMs(activityNode ?? {});
    const willRetry = shouldRetryAfterFailure(attempt, maxAttempts, code, retryPolicy);

    store.append(executionId, {
      kind: "event",
      name: "ActivityFailed",
      payload: {
        executionId,
        nodeId,
        error,
        attempt,
        ...(code !== undefined ? { code } : {}),
        ...(willRetry ? { willRetry: true } : {}),
      },
    });

    if (willRetry) {
      const backoffMs = computeRetryBackoffMs(attempt, retryPolicy);
      if (backoffMs > 0) await policyDelay(backoffMs);

      const nextAttempt = attempt + 1;
      const pendingNodeType =
        typeof last.payload?.nodeType === "string"
          ? last.payload.nodeType
          : activityNode && "type" in activityNode && typeof activityNode.type === "string"
            ? activityNode.type
            : undefined;
      store.append(executionId, {
        kind: "event",
        name: "ActivityRequested",
        payload: {
          executionId,
          nodeId,
          ...(pendingNodeType ? { nodeType: pendingNodeType } : {}),
          attempt: nextAttempt,
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
          ...(isParallelSpanPayload(reqSpan) ? { parallelSpan: { ...reqSpan } } : {}),
          ...(typeof last.payload?.delegateCorrelationId === "string"
            ? { delegateCorrelationId: last.payload.delegateCorrelationId }
            : {}),
        },
      });

      const histState = latestStateFromHistory(store.listByExecution(executionId));
      return {
        status: "awaiting_activity",
        executionId,
        nodeId,
        state: histState ? { ...histState } : { ...input },
        ...(isParallelSpanPayload(reqSpan) ? { parallelSpan: { ...reqSpan } } : {}),
      };
    }

    store.append(executionId, {
      kind: "command",
      name: "FailNode",
      payload: {
        executionId,
        nodeId,
        reason: "activity_failed",
        message: error,
        ...(code !== undefined ? { code } : {}),
      },
    });
    store.append(executionId, {
      kind: "event",
      name: "ExecutionFailed",
      payload: { executionId, error },
    });
    return { status: "failed", error, finalState: latestStateFromHistory(store.listByExecution(executionId)) };
  }

  const rawResult = outcome.result;
  const resultObj =
    rawResult && typeof rawResult === "object" && !Array.isArray(rawResult)
      ? /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(rawResult)))
      : {};
  const completedNode = validateWorkflowDefinition(definition).ok
    ? /** @type {{ nodes?: Array<{ id: string; type: string }> }} */ (definition).nodes?.find((n) => n.id === nodeId)
    : undefined;
  const pendingNodeType =
    typeof last.payload?.nodeType === "string"
      ? last.payload.nodeType
      : completedNode?.type;
  const isDelegateSubmit = pendingNodeType === "agent_delegate";
  const expectedDelegateCorrelationId =
    typeof last.payload?.delegateCorrelationId === "string" ? last.payload.delegateCorrelationId : undefined;
  const submittedDelegateCorrelationId =
    typeof outcome.delegateCorrelationId === "string"
      ? outcome.delegateCorrelationId
      : typeof resultObj.delegateCorrelationId === "string"
        ? resultObj.delegateCorrelationId
        : undefined;
  const submittedExternalTaskId =
    typeof outcome.externalTaskId === "string"
      ? outcome.externalTaskId
      : typeof resultObj.externalTaskId === "string"
        ? resultObj.externalTaskId
        : undefined;

  if (isDelegateSubmit) {
    if (!expectedDelegateCorrelationId) {
      return {
        status: "failed",
        error: "Pending agent_delegate ActivityRequested is missing delegateCorrelationId.",
        code: "SUBMIT_VALIDATION_ERROR",
      };
    }
    if (submittedDelegateCorrelationId !== expectedDelegateCorrelationId) {
      return {
        status: "failed",
        error: `Activity submit delegateCorrelationId "${submittedDelegateCorrelationId ?? ""}" does not match pending "${expectedDelegateCorrelationId}".`,
        code: "SUBMIT_VALIDATION_ERROR",
      };
    }
  }

  const storedResult = JSON.parse(JSON.stringify(resultObj));
  if (isDelegateSubmit) {
    delete storedResult.delegateCorrelationId;
    delete storedResult.externalTaskId;
  }

  const pendingSpan = isParallelSpanPayload(reqSpan) ? reqSpan : undefined;
  store.append(executionId, {
    kind: "event",
    name: "ActivityCompleted",
    payload: {
      executionId,
      nodeId,
      ...(completedNode?.type ? { nodeType: completedNode.type } : {}),
      ...(pendingSpan ? { parallelSpan: { ...pendingSpan } } : {}),
      result: storedResult,
      ...(isDelegateSubmit && expectedDelegateCorrelationId
        ? { delegateCorrelationId: expectedDelegateCorrelationId }
        : {}),
      ...(isDelegateSubmit && submittedExternalTaskId ? { externalTaskId: submittedExternalTaskId } : {}),
    },
  });

  return runGraphWorkflow({
    definition,
    input,
    executionId,
    store,
    stubActivityOutputs,
    activityExecutor,
    activityExecutionMode,
    subworkflowDepth,
    maxSubworkflowDepth,
    ...(assertNoSubworkflowInvocation ? { assertNoSubworkflowInvocation: true } : {}),
    ...(delegateExecutor ? { delegateExecutor } : {}),
    ...(assertNoDelegateExecutorInvocation ? { assertNoDelegateExecutorInvocation: true } : {}),
  });
}

/**
 * @typedef {object} DeliverSignalOutcomeOptions
 * @property {object} definition
 * @property {string} executionId
 * @property {import("../persistence/types.mjs").ExecutionHistoryStore} store
 * @property {Record<string, unknown>} input
 * @property {string} signalName
 * @property {Record<string, unknown>} [payload]
 * @property {Record<string, Record<string, unknown>>} [stubActivityOutputs]
 * @property {import("./activity-executor.mjs").ActivityExecutor} [activityExecutor]
 * @property {"in_process" | "host_mediated"} [activityExecutionMode]
 * @property {number} [subworkflowDepth]
 * @property {number} [maxSubworkflowDepth]
 * @property {boolean} [assertNoSubworkflowInvocation]
 * @property {import("./delegate-executor.mjs").DelegateExecutor} [delegateExecutor]
 * @property {boolean} [assertNoDelegateExecutorInvocation]
 */

/**
 * Append `DeliverSignal` / `SignalReceived` after a signal wait yield and continue the graph walker.
 *
 * @param {DeliverSignalOutcomeOptions} options
 * @returns {Promise<
 *   | { status: "completed"; finalState: Record<string, unknown>; result?: unknown }
 *   | { status: "failed"; error: string; finalState?: Record<string, unknown>; code?: string }
 *   | { status: "interrupted"; executionId: string; nodeId: string; state: Record<string, unknown> }
 *   | { status: "awaiting_activity"; executionId: string; nodeId: string; state: Record<string, unknown>; parallelSpan?: ParallelSpanPayload; agentId?: string; protocol?: string; delegateInput?: Record<string, unknown>; delegateCorrelationId?: string }
 *   | { status: "awaiting_signal"; executionId: string; nodeId: string; state: Record<string, unknown>; signalName: string }
 * >}
 */
export async function deliverSignalOutcome(options) {
  const {
    definition,
    executionId,
    store,
    input,
    signalName,
    payload,
    activityExecutionMode = "in_process",
    stubActivityOutputs = {},
    activityExecutor,
    subworkflowDepth = 0,
    maxSubworkflowDepth = 4,
    assertNoSubworkflowInvocation = false,
    delegateExecutor,
    assertNoDelegateExecutorInvocation = false,
  } = options;

  if (!definition || typeof definition !== "object") {
    return { status: "failed", error: "definition must be a non-null object", code: "SIGNAL_VALIDATION_ERROR" };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { status: "failed", error: "input must be a plain object", code: "SIGNAL_VALIDATION_ERROR" };
  }
  if (typeof executionId !== "string" || !executionId) {
    return { status: "failed", error: "executionId must be a non-empty string", code: "SIGNAL_VALIDATION_ERROR" };
  }
  if (typeof signalName !== "string" || !signalName.trim()) {
    return { status: "failed", error: "signalName must be a non-empty string", code: "SIGNAL_VALIDATION_ERROR" };
  }
  if (!store || typeof store.append !== "function" || typeof store.listByExecution !== "function") {
    return { status: "failed", error: "store must implement ExecutionHistoryStore", code: "SIGNAL_VALIDATION_ERROR" };
  }

  const v = validateWorkflowDefinition(definition);
  if (!v.ok) {
    const msg = v.errors?.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ") ?? "schema validation failed";
    return { status: "failed", error: msg, code: "SIGNAL_VALIDATION_ERROR" };
  }

  try {
    assertNoCustomReducers(definition);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error: msg, code: "SIGNAL_VALIDATION_ERROR" };
  }

  const rows = store.listByExecution(executionId);
  try {
    assertHistoryReadableByEngine(rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error: msg, code: "SIGNAL_VALIDATION_ERROR" };
  }
  if (rows.length === 0) {
    return {
      status: "failed",
      error: `Execution "${executionId}" was not found.`,
      code: "EXECUTION_NOT_FOUND",
    };
  }

  const cancelled = buildCancelledRunResult(rows, executionId);
  if (cancelled) {
    return {
      status: "failed",
      error: "Cannot deliver signal: execution was cancelled.",
      code: "SIGNAL_NOT_AWAITING",
    };
  }

  const definitionBind = verifyCallerDefinitionMatchesCheckpoint(definition, rows);
  if (!definitionBind.ok) {
    return { status: "failed", error: definitionBind.error, code: "SIGNAL_VALIDATION_ERROR" };
  }

  const pending = findPendingSignalWait(rows);
  if (!pending || pending.kind !== "event" || pending.name !== "SignalWaitStarted") {
    return {
      status: "failed",
      error: 'Cannot deliver signal: execution is not awaiting a signal wait.',
      code: "SIGNAL_NOT_AWAITING",
    };
  }

  const pendingNodeId = typeof pending.payload?.nodeId === "string" ? pending.payload.nodeId : "";
  const pendingSignalName =
    typeof pending.payload?.signalName === "string" ? pending.payload.signalName : "";
  if (pendingSignalName !== signalName) {
    return {
      status: "failed",
      error: `Signal name "${signalName}" does not match pending signal "${pendingSignalName}".`,
      code: "SIGNAL_NAME_MISMATCH",
    };
  }

  const payloadObj =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(payload)))
      : {};

  store.append(executionId, {
    kind: "command",
    name: "DeliverSignal",
    payload: { executionId, nodeId: pendingNodeId, signalName, payload: payloadObj },
  });
  store.append(executionId, {
    kind: "event",
    name: "SignalReceived",
    payload: { executionId, nodeId: pendingNodeId, signalName, payload: payloadObj },
  });

  return runGraphWorkflow({
    definition,
    input,
    executionId,
    store,
    stubActivityOutputs,
    activityExecutor,
    activityExecutionMode,
    subworkflowDepth,
    maxSubworkflowDepth,
    ...(assertNoSubworkflowInvocation ? { assertNoSubworkflowInvocation: true } : {}),
    ...(delegateExecutor ? { delegateExecutor } : {}),
    ...(assertNoDelegateExecutorInvocation ? { assertNoDelegateExecutorInvocation: true } : {}),
  });
}

/**
 * @typedef {object} CancelExecutionOutcomeOptions
 * @property {string} executionId
 * @property {import("../persistence/types.mjs").ExecutionHistoryStore} store
 * @property {string} [reason]
 */

/**
 * Append `CancelExecution` / `ExecutionCancelled` and stop the walker cooperatively.
 *
 * @param {CancelExecutionOutcomeOptions} options
 * @returns {Promise<
 *   | { status: "cancelled"; executionId: string; finalState?: Record<string, unknown>; reason?: string }
 *   | { status: "failed"; error: string; code?: string }
 * >}
 */
export async function cancelExecutionOutcome(options) {
  const { executionId, store, reason } = options;

  if (typeof executionId !== "string" || !executionId) {
    return { status: "failed", error: "executionId must be a non-empty string", code: "CANCEL_VALIDATION_ERROR" };
  }
  if (!store || typeof store.append !== "function" || typeof store.listByExecution !== "function") {
    return { status: "failed", error: "store must implement ExecutionHistoryStore", code: "CANCEL_VALIDATION_ERROR" };
  }

  const rows = store.listByExecution(executionId);
  try {
    assertHistoryReadableByEngine(rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error: msg, code: "CANCEL_VALIDATION_ERROR" };
  }
  if (rows.length === 0) {
    return {
      status: "failed",
      error: `Execution "${executionId}" was not found.`,
      code: "EXECUTION_NOT_FOUND",
    };
  }

  const lastTerminal = findLatestTerminalEvent(rows);
  if (lastTerminal?.name === "ExecutionCancelled") {
    const priorReason =
      typeof lastTerminal.payload?.reason === "string" ? lastTerminal.payload.reason : undefined;
    return {
      status: "cancelled",
      executionId,
      finalState: latestStateFromHistory(rows),
      ...(priorReason ? { reason: priorReason } : {}),
    };
  }
  if (lastTerminal?.name === "ExecutionCompleted" || lastTerminal?.name === "ExecutionFailed") {
    return {
      status: "failed",
      error: "Cannot cancel: execution is already terminal.",
      code: "CANCEL_NOT_ALLOWED",
    };
  }

  const nodeId = (() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (typeof row.payload?.nodeId === "string") {
        return row.payload.nodeId;
      }
    }
    return undefined;
  })();

  const reasonText = typeof reason === "string" && reason.trim() !== "" ? reason.trim() : undefined;

  store.append(executionId, {
    kind: "command",
    name: "CancelExecution",
    payload: {
      executionId,
      ...(nodeId ? { nodeId } : {}),
      ...(reasonText ? { reason: reasonText } : {}),
    },
  });
  store.append(executionId, {
    kind: "event",
    name: "ExecutionCancelled",
    payload: {
      executionId,
      ...(nodeId ? { nodeId } : {}),
      ...(reasonText ? { reason: reasonText } : {}),
    },
  });

  return {
    status: "cancelled",
    executionId,
    finalState: latestStateFromHistory(rows),
    ...(reasonText ? { reason: reasonText } : {}),
  };
}
