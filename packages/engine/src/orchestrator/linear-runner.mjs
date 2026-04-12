/**
 * Linear POC orchestration: validate → start → walk → complete (single chain from `__start__` to `end`).
 */
import Ajv2020 from "ajv/dist/2020.js";
import { createRequire } from "node:module";
import { validateWorkflowDefinition } from "../validate.mjs";
import { StubActivityExecutor } from "./activity-executor.mjs";

const require = createRequire(import.meta.url);

/** @returns {{ json: (data: unknown, query: string, flags?: string[]) => Promise<unknown> }} */
function loadJq() {
  return require("jq-wasm");
}

const PLACEHOLDER_TYPES = new Set(["step", "llm_call", "tool_call"]);

/**
 * Fail fast if any `state_schema.properties.*.reducer` is `custom`.
 * @param {unknown} definition
 */
export function assertNoCustomReducers(definition) {
  if (!definition || typeof definition !== "object") return;
  const stateSchema = /** @type {{ properties?: Record<string, { reducer?: string }> }} */ (definition).state_schema;
  const props = stateSchema?.properties;
  if (!props || typeof props !== "object") return;
  for (const [key, spec] of Object.entries(props)) {
    if (spec && typeof spec === "object" && spec.reducer === "custom") {
      throw new Error(
        `Unsupported reducer "custom" on state_schema.properties.${key}. POC only supports overwrite (default), append, and merge (see docs/poc-scope.md).`
      );
    }
  }
}

/**
 * Clone JSON-schema property shapes for Ajv by stripping non-schema `reducer` annotations.
 * @param {object} stateSchema
 */
export function stateSchemaForValidation(stateSchema) {
  const raw = /** @type {{ properties?: Record<string, unknown> }} */ (stateSchema);
  const props = raw.properties;
  if (!props) return { ...raw };
  const nextProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const { reducer: _r, ...rest } = /** @type {Record<string, unknown>} */ (v);
      nextProps[k] = rest;
    } else {
      nextProps[k] = v;
    }
  }
  return { ...raw, properties: nextProps };
}

/**
 * @param {unknown} a
 * @param {unknown} b
 */
function deepMerge(a, b) {
  if (b === null || typeof b !== "object" || Array.isArray(b)) return b;
  const base = a && typeof a === "object" && !Array.isArray(a) ? /** @type {Record<string, unknown>} */ ({ ...a }) : {};
  for (const [k, v] of Object.entries(b)) {
    const prev = base[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v) && prev !== null && typeof prev === "object" && !Array.isArray(prev)) {
      base[k] = deepMerge(prev, v);
    } else {
      base[k] = v;
    }
  }
  return base;
}

/**
 * @param {Record<string, unknown>} state
 * @param {Record<string, unknown>} output
 * @param {object | undefined} stateSchema
 */
export function applyOutputWithReducers(state, output, stateSchema) {
  const props = /** @type {{ properties?: Record<string, { reducer?: string }> }} */ (stateSchema)?.properties ?? {};
  const next = { ...state };
  for (const [key, value] of Object.entries(output)) {
    const prop = props[key];
    const reducer = prop?.reducer ?? "overwrite";
    if (reducer === "overwrite") {
      next[key] = value;
    } else if (reducer === "append") {
      const prev = Array.isArray(next[key]) ? /** @type {unknown[]} */ (next[key]) : [];
      const add = Array.isArray(value) ? value : [value];
      next[key] = [...prev, ...add];
    } else if (reducer === "merge") {
      const prev = next[key] && typeof next[key] === "object" && !Array.isArray(next[key]) ? next[key] : {};
      const chunk = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      next[key] = deepMerge(prev, chunk);
    } else {
      throw new Error(`Unknown reducer "${reducer}" for state key "${key}" (expected overwrite, append, or merge).`);
    }
  }
  return next;
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
 * @param {Array<{ id: string; type: string }>} nodes
 * @param {Map<string, string[]>} outgoing
 * @returns {string[]} ordered node ids from entry through `end` (inclusive)
 */
export function computeLinearNodePath(nodes, outgoing) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const startOut = outgoing.get("__start__") ?? [];
  if (startOut.length === 0) {
    throw new Error('Linear runner requires exactly one edge from synthetic source "__start__" to the entry node.');
  }
  if (startOut.length > 1) {
    throw new Error(
      `Non-linear topology: "__start__" has ${startOut.length} outgoing edges; linear workflows must have exactly one.`
    );
  }

  /** @type {string[]} */
  const path = [];
  const visited = new Set();
  let current = startOut[0];

  while (true) {
    if (visited.has(current)) {
      throw new Error(`Cycle detected at node "${current}"; linear workflows must be acyclic.`);
    }
    visited.add(current);
    const node = byId.get(current);
    if (!node) {
      throw new Error(`Edge references unknown node id "${current}".`);
    }
    path.push(current);

    if (node.type === "end") {
      break;
    }

    const outs = outgoing.get(current) ?? [];
    if (outs.length === 0) {
      throw new Error(`Dead end at node "${current}" (type "${node.type}") before reaching an "end" node.`);
    }
    if (outs.length > 1) {
      throw new Error(
        `Non-linear topology: node "${current}" has ${outs.length} outgoing edges (${outs.join(", ")}); linear workflows allow at most one successor per node.`
      );
    }
    current = outs[0];
  }

  const allIds = new Set(nodes.map((n) => n.id));
  if (visited.size !== allIds.size) {
    const missing = [...allIds].filter((id) => !visited.has(id));
    throw new Error(
      `Unreachable or extraneous nodes (${missing.map((id) => `"${id}"`).join(", ")}); linear runner requires every node to lie on the single path from "__start__" to "end".`
    );
  }

  for (const [src, targets] of outgoing.entries()) {
    if (src === "__start__") continue;
    if (targets.length > 1) {
      throw new Error(
        `Non-linear topology: node "${src}" branches to ${targets.length} targets (${targets.join(", ")}).`
      );
    }
  }

  const ends = nodes.filter((n) => n.type === "end");
  if (ends.length !== 1) {
    throw new Error(`Linear runner requires exactly one "end" node; found ${ends.length}.`);
  }
  const starts = nodes.filter((n) => n.type === "start");
  if (starts.length !== 1) {
    throw new Error(`Linear runner requires exactly one "start" node; found ${starts.length}.`);
  }

  return path;
}

/**
 * @param {Array<{ id: string; type: string }>} nodes
 */
function assertNoUnsupportedNodeTypes(nodes) {
  for (const n of nodes) {
    if (n.type === "switch" || n.type === "interrupt") {
      throw new Error(
        `Node "${n.id}" has type "${n.type}", which is not supported by the linear runner (see STORY-2-5 / docs/poc-scope.md).`
      );
    }
  }
}

/**
 * @param {object} definition
 */
function assertLinearNodeTypesOnPath(definition) {
  const nodes = /** @type {{ nodes: Array<{ type: string; id: string }> }} */ (definition).nodes;
  const allowed = new Set(["start", "end", "step", "llm_call", "tool_call"]);
  for (const n of nodes) {
    if (!allowed.has(n.type)) {
      throw new Error(`Node "${n.id}" has unsupported type "${n.type}" for the linear runner.`);
    }
  }
}

/**
 * @typedef {object} RunLinearWorkflowOptions
 * @property {object} definition Parsed workflow definition (POC JSON).
 * @property {Record<string, unknown>} input Initial execution state (workflow input object).
 * @property {string} executionId Correlation id for history rows.
 * @property {import("../persistence/types.mjs").ExecutionHistoryStore} store Append-only history store.
 * @property {Record<string, Record<string, unknown>>} [stubActivityOutputs] Per-node stub outputs for the default stub executor (default `{}`). Ignored if `activityExecutor` is set.
 * @property {import("./activity-executor.mjs").ActivityExecutor} [activityExecutor] Activity port (default `new StubActivityExecutor(stubActivityOutputs)`).
 */

/**
 * @param {RunLinearWorkflowOptions} options
 * @returns {Promise<{ status: 'completed'; finalState: unknown; result?: unknown } | { status: 'failed'; error: string; finalState?: Record<string, unknown> }>}
 */
export async function runLinearWorkflow(options) {
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

  try {
    assertNoUnsupportedNodeTypes(/** @type {{ nodes: Array<{ id: string; type: string }> }} */ (definition).nodes);
    assertLinearNodeTypesOnPath(definition);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error: msg };
  }

  const nodes = /** @type {{ nodes: Array<{ id: string; type: string; config?: object }>; edges: Array<{ source: string; target: string }>; state_schema: object; document: { name?: string; version?: string } }} */ (
    definition
  ).nodes;
  const edges = definition.edges;
  const outgoing = buildOutgoing(edges);

  /** @type {Record<string, unknown>} */
  let state = { ...input };

  let path;
  try {
    path = computeLinearNodePath(nodes, outgoing);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error: msg };
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateState = ajv.compile(stateSchemaForValidation(definition.state_schema));
  const jq = loadJq();

  function appendCmd(name, payload) {
    store.append(executionId, { kind: "command", name, payload: { executionId, ...payload } });
  }
  function appendEvt(name, payload) {
    store.append(executionId, { kind: "event", name, payload: { executionId, ...payload } });
  }

  function validateCurrentState(context) {
    const ok = validateState(state);
    if (!ok) {
      const detail = validateState.errors?.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ") ?? "state validation failed";
      throw new Error(`${context}: ${detail}`);
    }
  }

  try {
    appendEvt("ExecutionStarted", {
      workflowName: definition.document?.name,
      workflowVersion: definition.document?.version,
      inputKeys: Object.keys(input),
    });

    validateCurrentState("Initial state invalid vs state_schema");

    for (const nodeId of path) {
      const node = byId.get(nodeId);
      if (!node) throw new Error(`Internal error: missing node ${nodeId}`);

      appendCmd("ScheduleNode", { nodeId });
      appendEvt("NodeScheduled", { nodeId });

      /** @type {Record<string, unknown>} */
      let output = {};

      if (node.type === "start" || node.type === "end") {
        output = {};
      } else if (PLACEHOLDER_TYPES.has(node.type)) {
        appendEvt("ActivityRequested", { nodeId, nodeType: node.type });
        const activityResult = await executor.executeActivity({
          executionId,
          node: /** @type {{ id: string; type: string; config?: object }} */ (node),
          state,
        });
        if (!activityResult.ok) {
          const { error, code } = activityResult;
          appendEvt("ActivityFailed", { nodeId, error, ...(code !== undefined ? { code } : {}) });
          appendCmd("FailNode", {
            nodeId,
            reason: "activity_failed",
            message: error,
            ...(code !== undefined ? { code } : {}),
          });
          appendEvt("ExecutionFailed", { error });
          return {
            status: "failed",
            error,
            finalState: state,
          };
        }
        output = activityResult.output;
        appendEvt("ActivityCompleted", { nodeId, result: output });
      } else {
        throw new Error(`Unsupported node type "${node.type}" on path`);
      }

      appendCmd("CompleteNode", { nodeId, output });

      if (node.type !== "end") {
        state = /** @type {Record<string, unknown>} */ (applyOutputWithReducers(state, output, definition.state_schema));
        appendEvt("StateUpdated", { nodeId, state: JSON.parse(JSON.stringify(state)) });
        validateCurrentState(`State invalid after node "${nodeId}"`);
      }
    }

    const endNode = byId.get(path[path.length - 1]);
    const mapping = endNode?.config && typeof endNode.config === "object" && "output_mapping" in endNode.config ? String(/** @type {{ output_mapping?: string }} */ (endNode.config).output_mapping ?? "") : "";

    let result;
    try {
      const query = mapping.trim() ? mapping : ".";
      result = await jq.json(state, query);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      appendCmd("FailNode", { nodeId: endNode?.id, reason: "output_mapping_jq_failed", message: msg });
      appendEvt("ExecutionFailed", { error: msg });
      return { status: "failed", error: `end output_mapping (jq) failed: ${msg}`, finalState: state };
    }

    appendEvt("ExecutionCompleted", { result });
    return { status: "completed", finalState: state, result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendCmd("FailNode", { reason: "orchestration_error", message: msg });
    appendEvt("ExecutionFailed", { error: msg });
    return { status: "failed", error: msg, finalState: state };
  }
}
