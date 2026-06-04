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
