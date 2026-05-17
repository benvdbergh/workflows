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
import { assertWorkflowGraphInvariants, buildOutgoing } from "./workflow-graph-invariants.mjs";
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
  isParallelSpanPayload,
  latestPrimaryEvent,
  latestStateFromHistory,
  parallelSpansEqual,
  resolveCheckpointConfig,
  throwIfStateInvalid,
} from "./workflow-graph-walker-support.mjs";

const require = createRequire(import.meta.url);

/** @returns {{ json: (data: unknown, query: string, flags?: string[]) => Promise<unknown> }} */
function loadJq() {
  return require("jq-wasm");
}

const PLACEHOLDER_TYPES = new Set(["step", "llm_call", "tool_call"]);

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
 *   | { status: "awaiting_activity"; executionId: string; nodeId: string; state: Record<string, unknown>; parallelSpan?: ParallelSpanPayload }
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
    return { status: "failed", error: msg };
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error: msg };
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
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
      runWaitNode: (node, scheduled) =>
        runWaitNodeExecution(node.id, scheduled, appendCmd, appendEvt, node.config),
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
    appendEvt("ExecutionStarted", {
      workflowName: definition.document?.name,
      workflowVersion: definition.document?.version,
      inputKeys: Object.keys(input),
    });

    throwIfStateInvalid(validateState, state, "Initial state invalid vs state_schema");

    const startOut = outgoing.get("__start__") ?? [];
    let current = startOut[0];

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
        if (pr.kind === "interrupt") {
          return {
            status: "interrupted",
            executionId,
            nodeId: pr.nodeId,
            state: pr.state,
          };
        }
        if (pr.kind === "failed") {
          return { status: "failed", error: pr.error, finalState: state };
        }
        appendCmd("CompleteNode", { nodeId: current, output: {} });
        const pStateSeq = appendEvt("StateUpdated", { nodeId: current, state: JSON.parse(JSON.stringify(state)) });
        appendCheckpoint(current, state, pStateSeq);
        throwIfStateInvalid(validateState, state, `State invalid after parallel "${current}"`);
        current = joinTarget;
        continue;
      }

      if (node.type === "wait") {
        try {
          await runWaitNodeExecution(current, scheduled, appendCmd, appendEvt, node.config);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          appendCmd("FailNode", { nodeId: current, reason: "wait_failed", message: msg });
          appendEvt("ExecutionFailed", { error: msg });
          return { status: "failed", error: msg, finalState: state };
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
        appendCmd("CompleteNode", { nodeId: current, output: {} });
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
          appendEvt,
          jq,
        });
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
          appendEvt("ActivityFailed", { nodeId: current, error, ...(code !== undefined ? { code } : {}) });
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
 */

/**
 * @param {ResumeGraphWorkflowOptions} options
 * @returns {Promise<
 *   | { status: "completed"; finalState: Record<string, unknown>; result?: unknown }
 *   | { status: "failed"; error: string; finalState?: Record<string, unknown> }
 *   | { status: "interrupted"; executionId: string; nodeId: string; state: Record<string, unknown> }
 *   | { status: "awaiting_activity"; executionId: string; nodeId: string; state: Record<string, unknown>; parallelSpan?: ParallelSpanPayload }
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
    return { status: "failed", error: msg };
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
      runWaitNode: (node, scheduled) =>
        runWaitNodeExecution(node.id, scheduled, resumeAppendCmd, appendEvt, node.config),
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
        if (pr.kind === "interrupt") {
          return {
            status: "interrupted",
            executionId,
            nodeId: pr.nodeId,
            state: pr.state,
          };
        }
        if (pr.kind === "failed") {
          return { status: "failed", error: pr.error, finalState: state };
        }
        appendCmd("CompleteNode", { nodeId: current, output: {} });
        const pStateSeq = appendEvt("StateUpdated", { nodeId: current, state: JSON.parse(JSON.stringify(state)) });
        appendCheckpoint(current, state, pStateSeq);
        throwIfStateInvalid(validateState, state, `State invalid after parallel "${current}"`);
        current = joinTarget;
        continue;
      }

      if (node.type === "wait") {
        try {
          await runWaitNodeExecution(current, { replayed: false }, resumeAppendCmd, appendEvt, node.config);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          appendCmd("FailNode", { nodeId: current, reason: "wait_failed", message: msg });
          appendEvt("ExecutionFailed", { error: msg });
          return { status: "failed", error: msg, finalState: state };
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
        appendCmd("CompleteNode", { nodeId: current, output: {} });
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
          appendEvt,
          jq,
        });
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
          appendEvt("ActivityFailed", { nodeId: current, error, ...(code !== undefined ? { code } : {}) });
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
 * @property {{ ok: true; result?: Record<string, unknown> } | { ok: false; error: string; code?: string }} outcome
 * @property {ParallelSpanPayload} [expectedParallelSpan] Required when the pending request carries `parallelSpan` (parallel branches); must match exactly.
 * @property {"in_process" | "host_mediated"} [activityExecutionMode] Continuation mode for any further activities (default `host_mediated`).
 * @property {Record<string, Record<string, unknown>>} [stubActivityOutputs]
 * @property {import("./activity-executor.mjs").ActivityExecutor} [activityExecutor]
 */

/**
 * Append `ActivityCompleted` / `ActivityFailed` after a host-mediated yield and continue the graph walker from persisted history.
 *
 * @param {SubmitActivityOutcomeOptions} options
 * @returns {Promise<
 *   | { status: "completed"; finalState: Record<string, unknown>; result?: unknown }
 *   | { status: "failed"; error: string; finalState?: Record<string, unknown>; code?: string }
 *   | { status: "interrupted"; executionId: string; nodeId: string; state: Record<string, unknown> }
 *   | { status: "awaiting_activity"; executionId: string; nodeId: string; state: Record<string, unknown>; parallelSpan?: ParallelSpanPayload }
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

  const last = findLatestNonCheckpointEvent(rows);
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
    store.append(executionId, {
      kind: "event",
      name: "ActivityFailed",
      payload: { executionId, nodeId, error, ...(code !== undefined ? { code } : {}) },
    });
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
  store.append(executionId, {
    kind: "event",
    name: "ActivityCompleted",
    payload: { executionId, nodeId, result: resultObj },
  });

  return runGraphWorkflow({
    definition,
    input,
    executionId,
    store,
    stubActivityOutputs,
    activityExecutor,
    activityExecutionMode,
    ...(delegateExecutor ? { delegateExecutor } : {}),
    ...(assertNoDelegateExecutorInvocation ? { assertNoDelegateExecutorInvocation: true } : {}),
  });
}
