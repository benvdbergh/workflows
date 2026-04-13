/**
 * General POC graph walker: `start`, `end`, `step`, `llm_call`, `tool_call`, `switch`, `interrupt`.
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
import { hydrateReplayContext } from "./replay-loader.mjs";

const require = createRequire(import.meta.url);

/** @returns {{ json: (data: unknown, query: string, flags?: string[]) => Promise<unknown> }} */
function loadJq() {
  return require("jq-wasm");
}

const PLACEHOLDER_TYPES = new Set(["step", "llm_call", "tool_call"]);
const NONDETERMINISM_ERROR_CODE = "NONDETERMINISM_DETECTED";
const CHECKPOINT_POLICY = "after_each_node";

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
 */

/**
 * @param {RunPocWorkflowOptions} options
 * @returns {Promise<
 *   | { status: "completed"; finalState: Record<string, unknown>; result?: unknown }
 *   | { status: "failed"; error: string; finalState?: Record<string, unknown> }
 *   | { status: "interrupted"; executionId: string; nodeId: string; state: Record<string, unknown> }
 * >}
 */
export async function runPocWorkflow(options) {
  const { definition, input, executionId, store, stubActivityOutputs = {}, activityExecutor } = options;
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
  function appendCheckpoint(nodeId, stateSnapshot, lastAppliedEventSeq) {
    appendEvt("CheckpointWritten", {
      policy: CHECKPOINT_POLICY,
      workflowVersion: definitionMeta.workflowVersion,
      definitionHash: definitionMeta.definitionHash,
      lastAppliedEventSeq,
      nodeId,
      stateRef: {
        kind: "inline_state",
        state: JSON.parse(JSON.stringify(stateSnapshot)),
      },
    });
  }

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

      /** @type {Record<string, unknown>} */
      let output = {};

      if (node.type === "start" || node.type === "end") {
        output = {};
      } else if (PLACEHOLDER_TYPES.has(node.type)) {
        const replayedOutput = scheduled.replayed ? replay.replayResults.get(current) : undefined;
        if (replayedOutput) {
          output = JSON.parse(JSON.stringify(replayedOutput));
          appendEvt("ActivityCompleted", { nodeId: current, result: output, replayed: true });
        } else {
          appendEvt("ActivityRequested", { nodeId: current, nodeType: node.type });
          const activityResult = await executor.executeActivity({
            executionId,
            node: /** @type {{ id: string; type: string; config?: object }} */ (node),
            state,
          });
          if (!activityResult.ok) {
            const { error, code } = activityResult;
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
          output = activityResult.output;
          appendEvt("ActivityCompleted", { nodeId: current, result: output });
        }
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
 */

/**
 * @param {ResumePocWorkflowOptions} options
 * @returns {Promise<
 *   | { status: "completed"; finalState: Record<string, unknown>; result?: unknown }
 *   | { status: "failed"; error: string; finalState?: Record<string, unknown> }
 *   | { status: "interrupted"; executionId: string; nodeId: string; state: Record<string, unknown> }
 * >}
 */
export async function resumePocWorkflow(options) {
  const { definition, executionId, store, resumePayload, stubActivityOutputs = {}, activityExecutor } = options;
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

  const rows = store.listByExecution(executionId);
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
  function appendCheckpoint(nodeId, stateSnapshot, lastAppliedEventSeq) {
    appendEvt("CheckpointWritten", {
      policy: CHECKPOINT_POLICY,
      workflowVersion: definitionMeta.workflowVersion,
      definitionHash: definitionMeta.definitionHash,
      lastAppliedEventSeq,
      nodeId,
      stateRef: {
        kind: "inline_state",
        state: JSON.parse(JSON.stringify(stateSnapshot)),
      },
    });
  }

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

      /** @type {Record<string, unknown>} */
      let output = {};

      if (node.type === "start" || node.type === "end") {
        output = {};
      } else if (PLACEHOLDER_TYPES.has(node.type)) {
        appendEvt("ActivityRequested", { nodeId: current, nodeType: node.type });
        const activityResult = await executor.executeActivity({
          executionId,
          node: /** @type {{ id: string; type: string; config?: object }} */ (node),
          state,
        });
        if (!activityResult.ok) {
          const { error, code } = activityResult;
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
        output = activityResult.output;
        appendEvt("ActivityCompleted", { nodeId: current, result: output });
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
