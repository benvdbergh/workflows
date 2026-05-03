/**
 * POC graph walker: `start`, `end`, `step`, `llm_call`, `tool_call`, `switch`, `interrupt`,
 * plus R2 `parallel`, `wait`, and `set_state`.
 * Switch routing uses only `config.cases` / `config.default` (static edges from the switch id are ignored).
 */
import Ajv2020 from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
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
import { createR2ParallelRuntime } from "./poc-runner-r2-parallel.mjs";

const require = createRequire(import.meta.url);

/** @returns {{ json: (data: unknown, query: string, flags?: string[]) => Promise<unknown> }} */
function loadJq() {
  return require("jq-wasm");
}

const PLACEHOLDER_TYPES = new Set(["step", "llm_call", "tool_call"]);
const NONDETERMINISM_ERROR_CODE = "NONDETERMINISM_DETECTED";

/**
 * @param {object} definition
 * @returns {{ enabled: boolean; mode: "each" | "interval"; intervalN?: number }}
 */
function resolveCheckpointConfig(definition) {
  const cp = definition?.checkpointing;
  if (!cp || typeof cp !== "object") {
    return { enabled: true, mode: "each" };
  }
  const raw =
    typeof cp.strategy === "string"
      ? cp.strategy
      : typeof cp.policy === "string"
        ? cp.policy
        : "after_each_node";
  const strategy = raw.trim();
  if (strategy === "disabled" || strategy === "off" || strategy === "none") {
    return { enabled: false, mode: "each" };
  }
  if (strategy === "every_n_nodes" || strategy === "interval") {
    const n =
      typeof cp.n === "number" && Number.isInteger(cp.n) && cp.n >= 1
        ? cp.n
        : typeof cp.interval === "number" && Number.isInteger(cp.interval) && cp.interval >= 1
          ? cp.interval
          : null;
    if (n == null) {
      throw new Error('checkpointing: strategy "every_n_nodes" requires integer n ≥ 1');
    }
    return { enabled: true, mode: "interval", intervalN: n };
  }
  if (strategy === "after_each_node" || strategy === "") {
    return { enabled: true, mode: "each" };
  }
  throw new Error(`checkpointing: unknown strategy "${strategy}"`);
}

class NondeterminismError extends Error {
  /**
   * @param {string} message
   * @param {Record<string, unknown>} context
   */
  constructor(message, context) {
    super(message);
    this.name = "NondeterminismError";
    this.code = NONDETERMINISM_ERROR_CODE;
    this.context = context;
  }
}

/**
 * @param {import("../persistence/types.mjs").HistoryRow} row
 * @returns {{ name: string; nodeId?: string; seq: number }}
 */
function commandIdentity(row) {
  return {
    name: row.name,
    seq: row.seq,
    ...(typeof row.payload?.nodeId === "string" ? { nodeId: row.payload.nodeId } : {}),
  };
}

/**
 * @param {string} name
 * @param {Record<string, unknown>} payload
 * @returns {{ name: string; nodeId?: string }}
 */
function expectedCommandIdentity(name, payload) {
  return {
    name,
    ...(typeof payload.nodeId === "string" ? { nodeId: payload.nodeId } : {}),
  };
}

/**
 * @param {unknown} jqResult
 * @returns {boolean}
 */
function jqTruthy(jqResult) {
  return jqResult !== false && jqResult !== null;
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {object} cfg wait node config
 * @returns {number}
 */
function parseWaitDurationMs(cfg) {
  if (typeof cfg.duration_ms === "number" && cfg.duration_ms >= 0) return cfg.duration_ms;
  const s = typeof cfg.duration === "string" ? cfg.duration.trim() : "";
  if (!s) {
    throw new Error('wait (kind "duration"): expected duration_ms (number) or duration (string)');
  }
  const m = /^(\d+)\s*(ms|s|m|h)?$/i.exec(s);
  if (!m) {
    throw new Error(`wait (kind "duration"): cannot parse duration string "${s}"`);
  }
  const n = Number(m[1]);
  const u = (m[2] || "ms").toLowerCase();
  const mult = u === "h" ? 3_600_000 : u === "m" ? 60_000 : u === "s" ? 1000 : 1;
  return n * mult;
}

/**
 * @param {{ config?: object }} node
 * @param {Record<string, unknown>} state
 * @param {{ json: (data: unknown, query: string) => Promise<unknown> }} jq
 * @returns {Promise<Record<string, unknown>>}
 */
async function buildSetStateOutput(node, state, jq) {
  const cfg = node.config && typeof node.config === "object" ? /** @type {{ assignments?: unknown }} */ (node.config) : {};
  const assignments =
    cfg.assignments && typeof cfg.assignments === "object" && !Array.isArray(cfg.assignments)
      ? /** @type {Record<string, unknown>} */ (cfg.assignments)
      : {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, specRaw] of Object.entries(assignments)) {
    if (!specRaw || typeof specRaw !== "object" || Array.isArray(specRaw)) {
      throw new Error(`set_state "${node.id}": assignment "${key}" must be an object with "jq" or "literal".`);
    }
    const spec = /** @type {Record<string, unknown>} */ (specRaw);
    if ("jq" in spec) {
      const q = typeof spec.jq === "string" ? spec.jq : "";
      if (!q.trim()) throw new Error(`set_state "${node.id}": empty jq for "${key}"`);
      try {
        out[key] = await jq.json(state, q);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`set_state "${node.id}" key "${key}" (jq): ${msg}`);
      }
    } else if ("literal" in spec) {
      out[key] = JSON.parse(JSON.stringify(spec.literal));
    } else {
      throw new Error(`set_state "${node.id}": assignment "${key}" must use "jq" or "literal".`);
    }
  }
  return out;
}

/**
 * @typedef {{ parallelNodeId: string; joinTargetId: string; branchName: string; branchEntryNodeId: string }} ParallelSpanPayload
 */

/**
 * Shared `step` / `llm_call` / `tool_call` boundary for the POC walker (replay, in-process executor, host yield).
 *
 * @param {object} args
 * @param {{ id: string; type: string; config?: object }} args.node
 * @param {{ replayed: boolean }} args.scheduled
 * @param {Record<string, unknown>} args.state
 * @param {string} args.executionId
 * @param {import("./activity-executor.mjs").ActivityExecutor} args.executor
 * @param {import("./replay-loader.mjs").ReplayHydrationResult} args.replay
 * @param {"in_process" | "host_mediated"} args.activityExecutionMode
 * @param {(name: string, payload: Record<string, unknown>) => number} args.appendEvt
 * @param {ParallelSpanPayload | undefined} [args.parallelSpan]
 * @returns {Promise<
 *   | { kind: "completed"; output: Record<string, unknown> }
 *   | { kind: "failed"; error: string; code?: string }
 *   | { kind: "awaiting_activity"; nodeId: string; parallelSpan?: ParallelSpanPayload }
 * >}
 */
async function runPlaceholderActivityStep(args) {
  const {
    node,
    scheduled,
    state,
    executionId,
    executor,
    replay,
    activityExecutionMode,
    appendEvt,
    parallelSpan,
  } = args;

  const replayedOutput = scheduled.replayed ? replay.replayResults.get(node.id) : undefined;
  if (replayedOutput) {
    const output = JSON.parse(JSON.stringify(replayedOutput));
    appendEvt("ActivityCompleted", { nodeId: node.id, result: output, replayed: true });
    return { kind: "completed", output };
  }

  /** @type {Record<string, unknown>} */
  const reqPayload = { nodeId: node.id, nodeType: node.type };
  if (
    parallelSpan &&
    typeof parallelSpan.parallelNodeId === "string" &&
    typeof parallelSpan.joinTargetId === "string" &&
    typeof parallelSpan.branchName === "string" &&
    typeof parallelSpan.branchEntryNodeId === "string"
  ) {
    reqPayload.parallelSpan = { ...parallelSpan };
  }
  appendEvt("ActivityRequested", reqPayload);

  if (activityExecutionMode === "host_mediated") {
    return {
      kind: "awaiting_activity",
      nodeId: node.id,
      ...(parallelSpan &&
      typeof parallelSpan.parallelNodeId === "string" &&
      typeof parallelSpan.joinTargetId === "string" &&
      typeof parallelSpan.branchName === "string" &&
      typeof parallelSpan.branchEntryNodeId === "string"
        ? { parallelSpan: { ...parallelSpan } }
        : {}),
    };
  }

  const activityResult = await executor.executeActivity({
    executionId,
    node: /** @type {{ id: string; type: string; config?: object }} */ (node),
    state,
  });
  if (!activityResult.ok) {
    return {
      kind: "failed",
      error: activityResult.error,
      ...(activityResult.code !== undefined ? { code: activityResult.code } : {}),
    };
  }
  appendEvt("ActivityCompleted", { nodeId: node.id, result: activityResult.output });
  return { kind: "completed", output: activityResult.output };
}

/**
 * @param {string} nodeId
 * @param {{ replayed: boolean }} scheduled
 * @param {(name: string, payload: Record<string, unknown>) => { replayed: boolean }} appendCmd
 * @param {(name: string, payload: Record<string, unknown>) => number} appendEvt
 * @param {object | undefined} config
 */
async function runWaitNodeExecution(nodeId, scheduled, appendCmd, appendEvt, config) {
  const wcfg = config && typeof config === "object" ? config : {};
  const kind = /** @type {{ kind?: string }} */ (wcfg).kind;
  if (kind === "signal") {
    throw new Error(
      'wait kind "signal" requires a host to deliver workflow_signal (not implemented in this engine profile)'
    );
  }
  let waitMs = 0;
  let untilIso;
  if (kind === "duration") {
    waitMs = parseWaitDurationMs(wcfg);
  } else if (kind === "until") {
    untilIso = typeof wcfg.until === "string" ? wcfg.until : "";
    const t = Date.parse(untilIso);
    if (Number.isNaN(t)) throw new Error('wait kind "until": invalid ISO-8601 timestamp');
    waitMs = Math.max(0, t - Date.now());
  } else {
    throw new Error(`wait: unsupported or missing kind "${kind ?? ""}"`);
  }
  appendCmd("StartTimer", {
    nodeId,
    kind,
    ...(untilIso ? { until: untilIso } : { wait_ms: waitMs }),
  });
  appendEvt("TimerStarted", { nodeId, kind });
  if (!scheduled.replayed && waitMs > 0) await delay(waitMs);
  appendEvt("TimerFired", { nodeId, kind });
}

/**
 * @param {object} definition
 * @returns {{ workflowVersion?: string; definitionHash: string }}
 */
function checkpointDefinitionMeta(definition) {
  const workflowVersion = typeof definition?.document?.version === "string" ? definition.document.version : undefined;
  const canonical = JSON.stringify(definition);
  const definitionHash = createHash("sha256").update(canonical).digest("hex");
  return { workflowVersion, definitionHash };
}

/**
 * @param {Array<{ source: string; target: string }>} edges
 * @returns {Map<string, string[]>}
 */
function buildOutgoing(edges) {
  const out = new Map();
  for (const e of edges) {
    if (!e || typeof e.source !== "string" || typeof e.target !== "string") continue;
    const list = out.get(e.source) ?? [];
    list.push(e.target);
    out.set(e.source, list);
  }
  return out;
}

/**
 * @param {{ config?: object }} node
 * @returns {string}
 */
function summarizePrompt(node) {
  const cfg = node.config && typeof node.config === "object" ? /** @type {{ prompt?: string }} */ (node.config) : {};
  const p = typeof cfg.prompt === "string" ? cfg.prompt : "";
  const max = 200;
  return p.length > max ? `${p.slice(0, max)}…` : p;
}

/**
 * @param {import("ajv").ValidateFunction} validateState
 * @param {Record<string, unknown>} state
 * @param {string} context
 */
function throwIfStateInvalid(validateState, state, context) {
  const ok = validateState(state);
  if (!ok) {
    const detail =
      validateState.errors?.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ") ?? "state validation failed";
    throw new Error(`${context}: ${detail}`);
  }
}

/**
 * @param {Array<{ id: string; type: string }>} nodes
 * @param {Map<string, string[]>} outgoing
 */
function assertPocGraphEdges(nodes, outgoing) {
  const startOut = outgoing.get("__start__") ?? [];
  if (startOut.length !== 1) {
    throw new Error(
      `POC walker requires exactly one edge from "__start__"; found ${startOut.length}.`
    );
  }

  const starts = nodes.filter((n) => n.type === "start");
  const ends = nodes.filter((n) => n.type === "end");
  if (starts.length !== 1) {
    throw new Error(`POC walker requires exactly one "start" node; found ${starts.length}.`);
  }
  if (ends.length !== 1) {
    throw new Error(`POC walker requires exactly one "end" node; found ${ends.length}.`);
  }

  for (const n of nodes) {
    const outs = outgoing.get(n.id) ?? [];
    if (n.type === "switch") {
      continue;
    }
    if (n.type === "end") {
      if (outs.length !== 0) {
        throw new Error(`Node "${n.id}" (end) must have no outgoing edges; found ${outs.length}.`);
      }
      continue;
    }
    if (n.type === "interrupt") {
      if (outs.length !== 1) {
        throw new Error(
          `Node "${n.id}" (interrupt) must have exactly one outgoing edge; found ${outs.length}.`
        );
      }
      continue;
    }
    if (n.type === "parallel" || n.type === "wait" || n.type === "set_state") {
      if (outs.length !== 1) {
        throw new Error(
          `Node "${n.id}" (type "${n.type}") must have exactly one outgoing edge (successor / join target); found ${outs.length}.`
        );
      }
      continue;
    }
    if (outs.length !== 1) {
      throw new Error(
        `Node "${n.id}" (type "${n.type}") must have exactly one outgoing edge for POC; found ${outs.length}.`
      );
    }
  }
}

/**
 * @param {{ config?: object }} node
 * @param {Record<string, unknown>} state
 * @param {{ json: (data: unknown, query: string) => Promise<unknown> }} jq
 * @returns {Promise<string>}
 */
async function resolveSwitchTarget(node, state, jq) {
  const cfg = node.config && typeof node.config === "object" ? /** @type {{ cases?: unknown; default?: unknown }} */ (node.config) : {};
  const cases = Array.isArray(cfg.cases) ? cfg.cases : [];
  const def = typeof cfg.default === "string" ? cfg.default : undefined;

  for (const c of cases) {
    if (!c || typeof c !== "object") continue;
    const when = typeof /** @type {{ when?: unknown }} */ (c).when === "string" ? String(/** @type {{ when: string }} */ (c).when) : "";
    const target = typeof /** @type {{ target?: unknown }} */ (c).target === "string" ? String(/** @type {{ target: string }} */ (c).target) : "";
    if (!when.trim() || !target) continue;
    try {
      const r = await jq.json(state, when);
      if (jqTruthy(r)) {
        return target;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`switch "${node.id}" case jq failed (${when}): ${msg}`);
    }
  }

  if (cases.length > 0 && def === undefined) {
    throw new Error(
      `switch "${node.id}": no case matched and config.default is missing (required when cases are present).`
    );
  }
  if (def === undefined) {
    throw new Error(`switch "${node.id}": no routing target (add config.cases or config.default).`);
  }
  return def;
}

/**
 * @typedef {object} RunPocWorkflowOptions
 * @property {object} definition
 * @property {Record<string, unknown>} input
 * @property {string} executionId
 * @property {import("../persistence/types.mjs").ExecutionHistoryStore} store
 * @property {Record<string, Record<string, unknown>>} [stubActivityOutputs]
 * @property {import("./activity-executor.mjs").ActivityExecutor} [activityExecutor]
 * @property {"in_process" | "host_mediated"} [activityExecutionMode] default in-process stub/executor; `host_mediated` yields after `ActivityRequested` until `submitActivityOutcome`.
 */

/**
 * @param {RunPocWorkflowOptions} options
 * @returns {Promise<
 *   | { status: "completed"; finalState: Record<string, unknown>; result?: unknown }
 *   | { status: "failed"; error: string; finalState?: Record<string, unknown> }
 *   | { status: "interrupted"; executionId: string; nodeId: string; state: Record<string, unknown> }
 *   | { status: "awaiting_activity"; executionId: string; nodeId: string; state: Record<string, unknown>; parallelSpan?: ParallelSpanPayload }
 * >}
 */
export async function runPocWorkflow(options) {
  const {
    definition,
    input,
    executionId,
    store,
    stubActivityOutputs = {},
    activityExecutor,
    activityExecutionMode = "in_process",
  } = options;
  const executor = activityExecutor ?? new StubActivityExecutor(stubActivityOutputs);

  if (!definition || typeof definition !== "object") {
    return { status: "failed", error: "definition must be a non-null object" };
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
    assertPocGraphEdges(nodes, outgoing);
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

  const { executeParallelBlock } = createR2ParallelRuntime({
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
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @returns {Record<string, unknown> | undefined}
 */
function latestStateFromHistory(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.name === "StateUpdated" && r.payload && typeof r.payload.state === "object" && r.payload.state !== null) {
      return /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(r.payload.state)));
    }
  }
  return undefined;
}

/**
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @returns {import("../persistence/types.mjs").HistoryRow | undefined}
 */
function latestPrimaryEvent(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.kind !== "event") continue;
    if (row.name === "CheckpointWritten") continue;
    return row;
  }
  return undefined;
}

/**
 * @typedef {object} ResumePocWorkflowOptions
 * @property {object} definition
 * @property {string} executionId
 * @property {import("../persistence/types.mjs").ExecutionHistoryStore} store
 * @property {Record<string, unknown>} resumePayload
 * @property {Record<string, Record<string, unknown>>} [stubActivityOutputs]
 * @property {import("./activity-executor.mjs").ActivityExecutor} [activityExecutor]
 * @property {"in_process" | "host_mediated"} [activityExecutionMode]
 */

/**
 * @param {ResumePocWorkflowOptions} options
 * @returns {Promise<
 *   | { status: "completed"; finalState: Record<string, unknown>; result?: unknown }
 *   | { status: "failed"; error: string; finalState?: Record<string, unknown> }
 *   | { status: "interrupted"; executionId: string; nodeId: string; state: Record<string, unknown> }
 *   | { status: "awaiting_activity"; executionId: string; nodeId: string; state: Record<string, unknown>; parallelSpan?: ParallelSpanPayload }
 * >}
 */
export async function resumePocWorkflow(options) {
  const {
    definition,
    executionId,
    store,
    resumePayload,
    stubActivityOutputs = {},
    activityExecutor,
    activityExecutionMode = "in_process",
  } = options;
  const executor = activityExecutor ?? new StubActivityExecutor(stubActivityOutputs);

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
  const lastRow = latestPrimaryEvent(rows);
  if (!lastRow || lastRow.name !== "InterruptRaised") {
    const err = 'Cannot resume: last history event is not "InterruptRaised".';
    store.append(executionId, {
      kind: "command",
      name: "FailNode",
      payload: { executionId, reason: "resume_not_allowed", message: err },
    });
    store.append(executionId, { kind: "event", name: "ExecutionFailed", payload: { executionId, error: err } });
    return { status: "failed", error: err, finalState: latestStateFromHistory(rows) };
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
    return { status: "failed", error: err, finalState: latestStateFromHistory(rows) };
  }

  const nodes = /** @type {{ nodes: Array<{ id: string; type: string; config?: object }>; edges: Array<{ source: string; target: string }>; state_schema: object; document: { name?: string; version?: string } }} */ (
    definition
  ).nodes;
  const edges = definition.edges;
  const outgoing = buildOutgoing(edges);

  try {
    assertPocGraphEdges(nodes, outgoing);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error: msg, finalState: latestStateFromHistory(rows) };
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
    return { status: "failed", error: err, finalState: latestStateFromHistory(rows) };
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
    return { status: "failed", error: err, finalState: latestStateFromHistory(rows) };
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
    return { status: "failed", error: err, finalState: latestStateFromHistory(rows) };
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
    return { status: "failed", error: err };
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

  const { executeParallelBlock: resumeExecuteParallel } = createR2ParallelRuntime({
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
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @returns {import("../persistence/types.mjs").HistoryRow | undefined}
 */
function findLatestNonCheckpointEvent(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.kind === "event" && row.name === "CheckpointWritten") continue;
    return row;
  }
  return undefined;
}

/**
 * @param {unknown} span
 * @returns {span is ParallelSpanPayload}
 */
function isParallelSpanPayload(span) {
  if (!span || typeof span !== "object" || Array.isArray(span)) return false;
  const s = /** @type {Record<string, unknown>} */ (span);
  return (
    typeof s.parallelNodeId === "string" &&
    typeof s.joinTargetId === "string" &&
    typeof s.branchName === "string" &&
    typeof s.branchEntryNodeId === "string"
  );
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function parallelSpansEqual(a, b) {
  if (!isParallelSpanPayload(a) || !isParallelSpanPayload(b)) return false;
  return (
    a.parallelNodeId === b.parallelNodeId &&
    a.joinTargetId === b.joinTargetId &&
    a.branchName === b.branchName &&
    a.branchEntryNodeId === b.branchEntryNodeId
  );
}

/**
 * @typedef {object} SubmitActivityOutcomeOptions
 * @property {object} definition
 * @property {string} executionId
 * @property {import("../persistence/types.mjs").ExecutionHistoryStore} store
 * @property {Record<string, unknown>} input Same `input` as the initial `runPocWorkflow` / `startWorkflow` call (replay reconstruction requires it).
 * @property {string} nodeId Activity node id matching the pending `ActivityRequested` event.
 * @property {{ ok: true; result?: Record<string, unknown> } | { ok: false; error: string; code?: string }} outcome
 * @property {ParallelSpanPayload} [expectedParallelSpan] Required when the pending request carries `parallelSpan` (parallel branches); must match exactly.
 * @property {"in_process" | "host_mediated"} [activityExecutionMode] Continuation mode for any further activities (default `host_mediated`).
 * @property {Record<string, Record<string, unknown>>} [stubActivityOutputs]
 * @property {import("./activity-executor.mjs").ActivityExecutor} [activityExecutor]
 */

/**
 * Append `ActivityCompleted` / `ActivityFailed` after a host-mediated yield and continue the POC walker from persisted history.
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

  return runPocWorkflow({
    definition,
    input,
    executionId,
    store,
    stubActivityOutputs,
    activityExecutor,
    activityExecutionMode,
  });
}
