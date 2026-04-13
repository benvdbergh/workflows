/**
 * @typedef {import("../persistence/types.mjs").HistoryRow} HistoryRow
 * @typedef {import("../persistence/types.mjs").ExecutionHistoryStore} ExecutionHistoryStore
 */

/**
 * @typedef {'genesis' | 'safe_point'} ReplayStartMode
 */

/**
 * @typedef {object} ReplayHydrationOptions
 * @property {string} executionId
 * @property {ExecutionHistoryStore} store
 * @property {ReplayStartMode} [startMode]
 */

/**
 * @typedef {object} ReplayHydrationResult
 * @property {string} executionId
 * @property {number} startSeq
 * @property {HistoryRow[]} rows
 * @property {HistoryRow[]} commands
 * @property {HistoryRow[]} events
 * @property {Array<{ eventSeq: number; commandSeq?: number; commandName?: string }>} commandEventCorrelation
 * @property {{ nodeId?: string; status: 'running' | 'interrupted' | 'completed' | 'failed' | 'not_started' }} lastPosition
 * @property {Map<string, Record<string, unknown>>} replayResults
 */

/**
 * Load deterministic replay context from persisted command/event history.
 *
 * @param {ReplayHydrationOptions} options
 * @returns {ReplayHydrationResult}
 */
export function hydrateReplayContext(options) {
  const { executionId, store, startMode = "genesis" } = options;
  if (!store || typeof store.listByExecution !== "function") {
    throw new Error("store must implement ExecutionHistoryStore.listByExecution");
  }
  if (typeof executionId !== "string" || !executionId) {
    throw new Error("executionId must be a non-empty string");
  }
  if (startMode !== "genesis" && startMode !== "safe_point") {
    throw new Error('startMode must be either "genesis" or "safe_point"');
  }

  const allRows = store.listByExecution(executionId);
  let startSeq = 1;
  if (startMode === "safe_point") {
    const checkpoint = findLatestSafeReplayPoint(allRows);
    if (checkpoint !== undefined) startSeq = checkpoint;
  }

  const rows = allRows.filter((row) => row.seq >= startSeq).sort((a, b) => a.seq - b.seq);
  const commands = rows.filter((row) => row.kind === "command");
  const events = rows.filter((row) => row.kind === "event");

  /** @type {Array<{ eventSeq: number; commandSeq?: number; commandName?: string }>} */
  const commandEventCorrelation = [];
  /** @type {Map<string, HistoryRow>} */
  const latestCommandByNode = new Map();
  let latestCommand;

  for (const row of rows) {
    if (row.kind === "command") {
      latestCommand = row;
      const nodeId = typeof row.payload?.nodeId === "string" ? row.payload.nodeId : undefined;
      if (nodeId) latestCommandByNode.set(nodeId, row);
      continue;
    }

    const eventNodeId = typeof row.payload?.nodeId === "string" ? row.payload.nodeId : undefined;
    const nodeSpecific = eventNodeId ? latestCommandByNode.get(eventNodeId) : undefined;
    const matched = nodeSpecific ?? latestCommand;
    commandEventCorrelation.push({
      eventSeq: row.seq,
      ...(matched ? { commandSeq: matched.seq, commandName: matched.name } : {}),
    });
  }

  const replayResults = collectReplayResults(rows);
  const lastPosition = deriveLastPosition(rows);

  return {
    executionId,
    startSeq,
    rows,
    commands,
    events,
    commandEventCorrelation,
    lastPosition,
    replayResults,
  };
}

/**
 * @param {HistoryRow[]} rows
 * @returns {number | undefined}
 */
function findLatestSafeReplayPoint(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const payload = rows[i].payload;
    const candidate =
      typeof payload?.safeReplayFromSeq === "number"
        ? payload.safeReplayFromSeq
        : typeof payload?.replayFromSeq === "number"
          ? payload.replayFromSeq
          : undefined;
    if (candidate !== undefined && Number.isInteger(candidate) && candidate >= 1) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * @param {HistoryRow[]} rows
 * @returns {Map<string, Record<string, unknown>>}
 */
function collectReplayResults(rows) {
  /** @type {Map<string, Record<string, unknown>>} */
  const replayResults = new Map();
  for (const row of rows) {
    if (row.kind !== "event" || row.name !== "ActivityCompleted") continue;
    const nodeId = typeof row.payload?.nodeId === "string" ? row.payload.nodeId : undefined;
    const result =
      row.payload?.result && typeof row.payload.result === "object"
        ? /** @type {Record<string, unknown>} */ (row.payload.result)
        : undefined;
    if (!nodeId || !result) continue;
    replayResults.set(nodeId, JSON.parse(JSON.stringify(result)));
  }
  return replayResults;
}

/**
 * @param {HistoryRow[]} rows
 * @returns {{ nodeId?: string; status: 'running' | 'interrupted' | 'completed' | 'failed' | 'not_started' }}
 */
function deriveLastPosition(rows) {
  if (rows.length === 0) return { status: "not_started" };

  /** @type {string | undefined} */
  let latestNodeId;
  for (let i = rows.length - 1; i >= 0; i--) {
    const nodeId = typeof rows[i].payload?.nodeId === "string" ? rows[i].payload.nodeId : undefined;
    if (nodeId) {
      latestNodeId = nodeId;
      break;
    }
  }

  const last = rows[rows.length - 1];
  if (last.kind === "event" && last.name === "ExecutionCompleted") {
    return { nodeId: latestNodeId, status: "completed" };
  }
  if (last.kind === "event" && last.name === "ExecutionFailed") {
    return { nodeId: latestNodeId, status: "failed" };
  }
  if (last.kind === "event" && last.name === "InterruptRaised") {
    return { nodeId: latestNodeId, status: "interrupted" };
  }
  return { nodeId: latestNodeId, status: "running" };
}
