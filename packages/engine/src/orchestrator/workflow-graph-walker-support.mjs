/**
 * Checkpointing, history inspection, deterministic replay command matching, and related
 * invariants for the workflow graph walker (orchestration domain support).
 */

import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "../canonical-json.mjs";

export const NONDETERMINISM_ERROR_CODE = "NONDETERMINISM_DETECTED";

export const RESUME_FAILURE_CODE = {
  NOT_ALLOWED: "INVALID_RESUME_PAYLOAD",
  VALIDATION_FAILED: "INVALID_RESUME_PAYLOAD",
};

/**
 * @param {object} definition
 * @returns {{ enabled: boolean; mode: "each" | "interval"; intervalN?: number }}
 */
export function resolveCheckpointConfig(definition) {
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

export class NondeterminismError extends Error {
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
export function commandIdentity(row) {
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
export function expectedCommandIdentity(name, payload) {
  return {
    name,
    ...(typeof payload.nodeId === "string" ? { nodeId: payload.nodeId } : {}),
  };
}

/**
 * @param {object} definition
 * @returns {{ workflowVersion?: string; definitionHash: string }}
 */
export function checkpointDefinitionMeta(definition) {
  const workflowVersion = typeof definition?.document?.version === "string" ? definition.document.version : undefined;
  const canonical = canonicalJsonStringify(definition);
  const definitionHash = createHash("sha256").update(canonical).digest("hex");
  return { workflowVersion, definitionHash };
}

/**
 * Latest `definitionHash` from checkpoint history (newest `CheckpointWritten` wins).
 *
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @returns {string | undefined}
 */
export function latestCheckpointDefinitionHash(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.kind !== "event" || row.name !== "CheckpointWritten") continue;
    const hash = row.payload?.definitionHash;
    if (typeof hash === "string" && hash.length > 0) {
      return hash;
    }
  }
  return undefined;
}

/**
 * When history includes a checkpoint, caller `definition` must hash to the same `definitionHash`.
 *
 * @param {object} definition
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @returns {{ ok: true } | { ok: false; error: string }}
 */
export function verifyCallerDefinitionMatchesCheckpoint(definition, rows) {
  const bound = latestCheckpointDefinitionHash(rows);
  if (!bound) {
    return { ok: true };
  }
  const callerHash = checkpointDefinitionMeta(definition).definitionHash;
  if (callerHash !== bound) {
    return {
      ok: false,
      error: "Workflow definition does not match checkpoint definitionHash for this execution.",
    };
  }
  return { ok: true };
}

/**
 * @param {import("ajv").ValidateFunction} validateState
 * @param {Record<string, unknown>} state
 * @param {string} context
 */
export function throwIfStateInvalid(validateState, state, context) {
  const ok = validateState(state);
  if (!ok) {
    const detail =
      validateState.errors?.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ") ?? "state validation failed";
    throw new Error(`${context}: ${detail}`);
  }
}

/**
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @returns {Record<string, unknown> | undefined}
 */
export function latestStateFromHistory(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.name === "StateUpdated" && r.payload && typeof r.payload.state === "object" && r.payload.state !== null) {
      return /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(r.payload.state)));
    }
  }
  return undefined;
}

const TERMINAL_EVENT_NAMES = new Set(["ExecutionCompleted", "ExecutionFailed", "ExecutionCancelled"]);

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isTerminalEventName(name) {
  return TERMINAL_EVENT_NAMES.has(name);
}

/**
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @returns {import("../persistence/types.mjs").HistoryRow | undefined}
 */
export function findLatestTerminalEvent(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.kind === "event" && isTerminalEventName(row.name)) {
      return row;
    }
  }
  return undefined;
}

/**
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @returns {import("../persistence/types.mjs").HistoryRow | undefined}
 */
export function latestPrimaryEvent(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.kind !== "event") continue;
    if (row.name === "CheckpointWritten") continue;
    return row;
  }
  return undefined;
}

/**
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @returns {import("../persistence/types.mjs").HistoryRow | undefined}
 */
export function findLatestNonCheckpointEvent(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.kind === "event" && row.name === "CheckpointWritten") continue;
    return row;
  }
  return undefined;
}

/**
 * Latest `SignalWaitStarted` without a later `SignalReceived` for the same node.
 *
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @returns {import("../persistence/types.mjs").HistoryRow | undefined}
 */
export function findPendingSignalWait(rows) {
  const last = findLatestNonCheckpointEvent(rows);
  if (last?.kind === "event" && last.name === "SignalWaitStarted") {
    const nodeId = typeof last.payload?.nodeId === "string" ? last.payload.nodeId : "";
    if (!nodeId) {
      return undefined;
    }
    const hasReceived = rows.some(
      (later) =>
        later.seq > last.seq &&
        later.kind === "event" &&
        later.name === "SignalReceived" &&
        later.payload?.nodeId === nodeId
    );
    if (!hasReceived) {
      return last;
    }
  }
  return undefined;
}

/**
 * `SignalReceived` was appended for a wait node but the walker has not completed that node yet.
 *
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @returns {boolean}
 */
export function isPendingSignalWaitContinuation(rows) {
  const last = findLatestNonCheckpointEvent(rows);
  if (!last || last.kind !== "event" || last.name !== "SignalReceived") {
    return false;
  }
  const nodeId = typeof last.payload?.nodeId === "string" ? last.payload.nodeId : "";
  if (!nodeId) {
    return false;
  }
  const hasCompleteNode = rows.some(
    (r) =>
      r.kind === "command" &&
      r.name === "CompleteNode" &&
      r.payload?.nodeId === nodeId &&
      r.seq > last.seq
  );
  return !hasCompleteNode;
}

/**
 * When history ends with `ExecutionCancelled`, return a cooperative cancel outcome for read-only replay.
 *
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @param {string} executionId
 * @returns {{ status: "cancelled"; executionId: string; finalState?: Record<string, unknown>; reason?: string } | undefined}
 */
export function buildCancelledRunResult(rows, executionId) {
  const lastTerminal = findLatestTerminalEvent(rows);
  if (lastTerminal?.name !== "ExecutionCancelled") {
    return undefined;
  }
  const priorReason =
    typeof lastTerminal.payload?.reason === "string" ? lastTerminal.payload.reason : undefined;
  return {
    status: "cancelled",
    executionId,
    finalState: latestStateFromHistory(rows),
    ...(priorReason ? { reason: priorReason } : {}),
  };
}

/**
 * Latest `ActivityRequested` that has no later `ActivityCompleted` for the same node (host submit target).
 *
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @returns {import("../persistence/types.mjs").HistoryRow | undefined}
 */
export function findPendingActivityRequest(rows) {
  const last = findLatestNonCheckpointEvent(rows);
  if (last?.kind === "event" && last.name === "ActivityRequested") {
    return last;
  }
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.kind !== "event" || row.name !== "ActivityRequested") {
      continue;
    }
    const nodeId = typeof row.payload?.nodeId === "string" ? row.payload.nodeId : "";
    if (!nodeId) {
      continue;
    }
    const hasLaterCompletion = rows.some(
      (later) =>
        later.seq > row.seq &&
        later.kind === "event" &&
        later.name === "ActivityCompleted" &&
        later.payload?.nodeId === nodeId
    );
    if (!hasLaterCompletion) {
      return row;
    }
    break;
  }
  return undefined;
}

/** Node types completed via host `submitActivityOutcome` (step / llm_call / tool_call / agent_delegate). */
const HOST_ACTIVITY_NODE_TYPES = new Set(["step", "llm_call", "tool_call", "agent_delegate"]);

/**
 * Host-mediated submit (or in-process crash recovery for placeholder activities) left
 * `ActivityCompleted` without a matching `CompleteNode` for a step/llm_call/tool_call node.
 *
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @param {(nodeId: string) => string | undefined} [resolveNodeType] maps node id to workflow node `type`
 * @returns {boolean}
 */
export function isPendingActivityCompletionContinuation(rows, resolveNodeType) {
  const last = findLatestNonCheckpointEvent(rows);
  if (!last || last.kind !== "event" || last.name !== "ActivityCompleted") {
    return false;
  }
  const nodeId = typeof last.payload?.nodeId === "string" ? last.payload.nodeId : "";
  if (!nodeId) {
    return false;
  }
  if (isParallelSpanPayload(last.payload?.parallelSpan)) {
    return false;
  }
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.kind !== "event" || row.name !== "ActivityRequested" || row.payload?.nodeId !== nodeId) {
      continue;
    }
    if (isParallelSpanPayload(row.payload?.parallelSpan)) {
      return false;
    }
    break;
  }
  const nodeType =
    typeof last.payload?.nodeType === "string"
      ? last.payload.nodeType
      : resolveNodeType?.(nodeId);
  if (!nodeType || !HOST_ACTIVITY_NODE_TYPES.has(nodeType)) {
    return false;
  }
  const hasCompleteNode = rows.some(
    (r) =>
      r.kind === "command" &&
      r.name === "CompleteNode" &&
      r.payload?.nodeId === nodeId &&
      r.seq > last.seq
  );
  return !hasCompleteNode;
}

/**
 * @param {import("../persistence/types.mjs").HistoryRow[]} rows
 * @param {Record<string, unknown>} input
 * @returns {{ ok: true } | { ok: false; error: string }}
 */
export function verifyHostContinuationInput(rows, input) {
  const started = rows.find((r) => r.kind === "event" && r.name === "ExecutionStarted");
  if (!started) {
    return { ok: true };
  }
  const rawKeys = started.payload?.inputKeys;
  if (!Array.isArray(rawKeys)) {
    return { ok: true };
  }
  const expectedKeys = [...rawKeys].map(String).sort();
  const actualKeys = Object.keys(input).sort();
  if (expectedKeys.join("\0") !== actualKeys.join("\0")) {
    return {
      ok: false,
      error: "Submit input keys do not match ExecutionStarted.inputKeys for this execution.",
    };
  }
  const firstState = rows.find((r) => r.kind === "event" && r.name === "StateUpdated");
  const genesis =
    firstState?.payload?.state && typeof firstState.payload.state === "object" && !Array.isArray(firstState.payload.state)
      ? /** @type {Record<string, unknown>} */ (firstState.payload.state)
      : undefined;
  if (genesis) {
    for (const key of expectedKeys) {
      if (key in genesis && key in input && JSON.stringify(input[key]) !== JSON.stringify(genesis[key])) {
        return {
          ok: false,
          error: `Submit input key "${key}" does not match workflow start state for this execution.`,
        };
      }
    }
  }
  return { ok: true };
}

/**
 * @param {unknown} span
 * @returns {span is import("./workflow-node-execution.mjs").ParallelSpanPayload}
 */
export function isParallelSpanPayload(span) {
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
export function parallelSpansEqual(a, b) {
  if (!isParallelSpanPayload(a) || !isParallelSpanPayload(b)) return false;
  return (
    a.parallelNodeId === b.parallelNodeId &&
    a.joinTargetId === b.joinTargetId &&
    a.branchName === b.branchName &&
    a.branchEntryNodeId === b.branchEntryNodeId
  );
}
