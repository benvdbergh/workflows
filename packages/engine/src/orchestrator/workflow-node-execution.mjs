/**
 * Node-level execution helpers for the workflow graph walker (switch routing, timers,
 * set_state, and the activity boundary for step / llm_call / tool_call).
 */

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
/**
 * Resolve subworkflow / delegate `input_mapping` against parent state (jq template strings or literals).
 *
 * @param {Record<string, unknown>} parentState
 * @param {Record<string, unknown>} inputMapping
 * @param {{ json: (data: unknown, query: string) => Promise<unknown> }} jq
 * @returns {Promise<Record<string, unknown>>}
 */
export async function applyInputMapping(parentState, inputMapping, jq) {
  /** @type {Record<string, unknown>} */
  const childInput = {};
  for (const [key, specRaw] of Object.entries(inputMapping)) {
    if (specRaw && typeof specRaw === "object" && !Array.isArray(specRaw)) {
      const spec = /** @type {Record<string, unknown>} */ (specRaw);
      if ("jq" in spec) {
        const q = typeof spec.jq === "string" ? spec.jq : "";
        if (!q.trim()) throw new Error(`input_mapping "${key}": empty jq expression`);
        try {
          childInput[key] = await jq.json(parentState, q);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(`input_mapping "${key}" (jq): ${msg}`);
        }
        continue;
      }
      if ("literal" in spec) {
        childInput[key] = JSON.parse(JSON.stringify(spec.literal));
        continue;
      }
    }
    if (typeof specRaw === "string") {
      const trimmed = specRaw.trim();
      const template = /^\$\{\s*(.+?)\s*\}$/.exec(trimmed);
      if (template) {
        try {
          childInput[key] = await jq.json(parentState, template[1]);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(`input_mapping "${key}" (template): ${msg}`);
        }
        continue;
      }
      childInput[key] = specRaw;
      continue;
    }
    childInput[key] = JSON.parse(JSON.stringify(specRaw));
  }
  return childInput;
}

export async function buildSetStateOutput(node, state, jq) {
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
 * Shared `step` / `llm_call` / `tool_call` boundary for the graph walker (replay, in-process executor, host yield).
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
export async function runPlaceholderActivityStep(args) {
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
    const hostSubmittedAlready = replay.events.some(
      (row) =>
        row.name === "ActivityCompleted" &&
        row.payload?.nodeId === node.id &&
        row.payload?.replayed !== true
    );
    if (!hostSubmittedAlready) {
      appendEvt("ActivityCompleted", { nodeId: node.id, result: output, replayed: true });
    }
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
export async function runWaitNodeExecution(nodeId, scheduled, appendCmd, appendEvt, config) {
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
 * @param {{ config?: object }} node
 * @returns {string}
 */
export function summarizePrompt(node) {
  const cfg = node.config && typeof node.config === "object" ? /** @type {{ prompt?: string }} */ (node.config) : {};
  const p = typeof cfg.prompt === "string" ? cfg.prompt : "";
  const max = 200;
  return p.length > max ? `${p.slice(0, max)}…` : p;
}

/**
 * @param {{ config?: object }} node
 * @param {Record<string, unknown>} state
 * @param {{ json: (data: unknown, query: string) => Promise<unknown> }} jq
 * @returns {Promise<string>}
 */
export async function resolveSwitchTarget(node, state, jq) {
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

