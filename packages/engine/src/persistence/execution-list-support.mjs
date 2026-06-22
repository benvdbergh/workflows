/** @typedef {import("./types.mjs").HistoryRow} HistoryRow */

const PRIMARY_EVENT_NAMES = new Set(["ExecutionCompleted", "ExecutionFailed", "ExecutionCancelled", "InterruptRaised"]);

/** @typedef {"running" | "completed" | "failed" | "interrupted" | "awaiting_activity" | "awaiting_signal" | "cancelled"} ExecutionPhase */

/**
 * @typedef {object} ExecutionListQuery
 * @property {ExecutionPhase} [phase]
 * @property {string} [definitionName]
 * @property {string} [updatedAfter] ISO 8601 inclusive lower bound on last row `createdAt`
 * @property {string} [updatedBefore] ISO 8601 inclusive upper bound on last row `createdAt`
 * @property {number} [limit] Page size (default 50, max 100)
 * @property {string} [cursor] Opaque cursor from a prior page (`updatedAt|executionId`)
 */

/**
 * @typedef {object} ExecutionListItem
 * @property {string} executionId
 * @property {ExecutionPhase} phase
 * @property {string} [definitionName]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {object} ExecutionListResult
 * @property {ExecutionListItem[]} items
 * @property {string} [nextCursor]
 */

export const DEFAULT_EXECUTION_LIST_LIMIT = 50;
export const MAX_EXECUTION_LIST_LIMIT = 100;

/**
 * @param {HistoryRow[]} rows
 */
function latestPrimaryEvent(rows) {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.kind === "event" && PRIMARY_EVENT_NAMES.has(row.name)) {
      return row;
    }
  }
  return undefined;
}

/**
 * @param {HistoryRow[]} rows
 */
export function findLatestNonCheckpointEvent(rows) {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.kind === "event" && row.name === "CheckpointWritten") continue;
    return row;
  }
  return undefined;
}

/**
 * @param {HistoryRow[]} rows
 * @returns {ExecutionPhase}
 */
export function projectExecutionPhase(rows) {
  const lastPrimary = latestPrimaryEvent(rows);
  if (lastPrimary?.name === "ExecutionCompleted") return "completed";
  if (lastPrimary?.name === "ExecutionFailed") return "failed";
  if (lastPrimary?.name === "ExecutionCancelled") return "cancelled";
  if (lastPrimary?.name === "InterruptRaised") return "interrupted";
  const lastNc = findLatestNonCheckpointEvent(rows);
  if (lastNc?.kind === "event" && lastNc.name === "ActivityRequested") return "awaiting_activity";
  if (lastNc?.kind === "event" && lastNc.name === "SignalWaitStarted") return "awaiting_signal";
  return "running";
}

/**
 * @param {HistoryRow[]} rows
 * @returns {string | undefined}
 */
function latestNodeId(rows) {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (typeof row.payload?.nodeId === "string") {
      return row.payload.nodeId;
    }
  }
  return undefined;
}

/**
 * @param {HistoryRow[]} rows
 * @returns {string | undefined}
 */
function latestError(rows) {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.name === "ExecutionFailed" && typeof row.payload?.error === "string") {
      return row.payload.error;
    }
  }
  return undefined;
}

/**
 * @param {HistoryRow[]} rows
 * @returns {string | undefined}
 */
function latestCancelReason(rows) {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.name === "ExecutionCancelled" && typeof row.payload?.reason === "string") {
      return row.payload.reason;
    }
  }
  return undefined;
}

/**
 * Status projection body shared by `getWorkflowStatus` and `listExecutions` phase filtering.
 *
 * @param {HistoryRow[]} rows
 * @returns {{
 *   phase: ExecutionPhase;
 *   currentNodeId: string | undefined;
 *   lastError: string | undefined;
 *   signalName?: string;
 * }}
 */
export function projectExecutionStatusDetails(rows) {
  const phase = projectExecutionPhase(rows);
  if (phase === "completed") {
    return { phase, currentNodeId: undefined, lastError: undefined };
  }
  if (phase === "failed") {
    return { phase, currentNodeId: latestNodeId(rows), lastError: latestError(rows) };
  }
  if (phase === "cancelled") {
    const reason = latestCancelReason(rows);
    return { phase, currentNodeId: latestNodeId(rows), lastError: reason };
  }
  if (phase === "interrupted") {
    return { phase, currentNodeId: latestNodeId(rows), lastError: undefined };
  }
  const lastNc = findLatestNonCheckpointEvent(rows);
  if (phase === "awaiting_activity") {
    const nid =
      lastNc?.kind === "event" && typeof lastNc.payload?.nodeId === "string"
        ? lastNc.payload.nodeId
        : latestNodeId(rows);
    return { phase, currentNodeId: nid, lastError: undefined };
  }
  if (phase === "awaiting_signal") {
    const nid =
      lastNc?.kind === "event" && typeof lastNc.payload?.nodeId === "string"
        ? lastNc.payload.nodeId
        : latestNodeId(rows);
    const signalName =
      lastNc?.kind === "event" && typeof lastNc.payload?.signalName === "string"
        ? lastNc.payload.signalName
        : undefined;
    return {
      phase,
      currentNodeId: nid,
      lastError: undefined,
      ...(signalName ? { signalName } : {}),
    };
  }
  return { phase, currentNodeId: latestNodeId(rows), lastError: undefined };
}

/**
 * @param {HistoryRow[]} rows
 * @returns {string | undefined}
 */
export function definitionNameFromHistory(rows) {
  for (const row of rows) {
    if (row.kind === "event" && row.name === "ExecutionStarted") {
      const name = row.payload?.workflowName;
      if (typeof name === "string" && name.trim() !== "") {
        return name;
      }
    }
  }
  return undefined;
}

/**
 * @param {HistoryRow[]} rows
 * @returns {string | undefined}
 */
export function updatedAtFromHistory(rows) {
  if (rows.length === 0) return undefined;
  return rows[rows.length - 1].createdAt;
}

/**
 * @param {string} executionId
 * @param {HistoryRow[]} rows
 * @returns {ExecutionListItem}
 */
export function summarizeExecution(executionId, rows) {
  const definitionName = definitionNameFromHistory(rows);
  const updatedAt = updatedAtFromHistory(rows);
  return {
    executionId,
    phase: projectExecutionPhase(rows),
    ...(definitionName ? { definitionName } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

/**
 * @param {number | undefined} limit
 */
export function normalizeExecutionListLimit(limit) {
  if (limit === undefined) return DEFAULT_EXECUTION_LIST_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer.");
  }
  return Math.min(limit, MAX_EXECUTION_LIST_LIMIT);
}

/**
 * @param {ExecutionListItem} a
 * @param {ExecutionListItem} b
 * @returns {number}
 */
function compareExecutions(a, b) {
  const ua = a.updatedAt ?? "";
  const ub = b.updatedAt ?? "";
  if (ua !== ub) return ua > ub ? -1 : 1;
  return a.executionId.localeCompare(b.executionId);
}

/**
 * @param {string} cursor
 * @returns {{ updatedAt: string; executionId: string }}
 */
export function parseExecutionListCursor(cursor) {
  const sep = cursor.indexOf("|");
  if (sep <= 0 || sep >= cursor.length - 1) {
    throw new Error("Invalid execution list cursor.");
  }
  return {
    updatedAt: cursor.slice(0, sep),
    executionId: cursor.slice(sep + 1),
  };
}

/**
 * @param {ExecutionListItem} item
 * @returns {string}
 */
export function encodeExecutionListCursor(item) {
  return `${item.updatedAt ?? ""}|${item.executionId}`;
}

/**
 * @param {ExecutionListItem[]} summaries
 * @param {ExecutionListQuery} query
 * @returns {ExecutionListResult}
 */
export function applyExecutionListQuery(summaries, query) {
  const limit = normalizeExecutionListLimit(query.limit);
  let filtered = summaries.filter((item) => {
    if (query.phase !== undefined && item.phase !== query.phase) return false;
    if (query.definitionName !== undefined && item.definitionName !== query.definitionName) return false;
    if (query.updatedAfter !== undefined) {
      const updatedAt = item.updatedAt ?? "";
      if (updatedAt === "" || updatedAt < query.updatedAfter) return false;
    }
    if (query.updatedBefore !== undefined) {
      const updatedAt = item.updatedAt ?? "";
      if (updatedAt === "" || updatedAt > query.updatedBefore) return false;
    }
    return true;
  });

  filtered.sort(compareExecutions);

  if (query.cursor !== undefined) {
    const parsed = parseExecutionListCursor(query.cursor);
    const cursorItem = { executionId: parsed.executionId, phase: "running", updatedAt: parsed.updatedAt };
    filtered = filtered.filter((item) => compareExecutions(item, cursorItem) > 0);
  }

  const page = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const last = page.at(-1);
  return {
    items: page,
    ...(hasMore && last ? { nextCursor: encodeExecutionListCursor(last) } : {}),
  };
}
