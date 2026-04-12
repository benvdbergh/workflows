/** @typedef {import("./types.mjs").HistoryAppendInput} HistoryAppendInput */
/** @typedef {import("./types.mjs").HistoryRow} HistoryRow */
/** @typedef {import("./types.mjs").ExecutionHistoryStore} ExecutionHistoryStore */

/**
 * In-memory {@link ExecutionHistoryStore} for tests and ephemeral runs.
 * Sequence numbers are monotonic per `executionId`, starting at 1.
 *
 * @implements {ExecutionHistoryStore}
 */
export class MemoryExecutionHistoryStore {
  /** @type {Map<string, HistoryRow[]>} */
  #byExecution = new Map();

  /**
   * @param {string} executionId
   * @param {HistoryAppendInput} input
   * @returns {number}
   */
  append(executionId, input) {
    const rows = this.#byExecution.get(executionId) ?? [];
    const nextSeq = rows.length === 0 ? 1 : rows[rows.length - 1].seq + 1;
    const createdAt = new Date().toISOString();
    /** @type {HistoryRow} */
    const row = {
      executionId,
      seq: nextSeq,
      kind: input.kind,
      name: input.name,
      payload: structuredClone(input.payload),
      createdAt,
    };
    rows.push(row);
    this.#byExecution.set(executionId, rows);
    return nextSeq;
  }

  /**
   * @param {string} executionId
   * @param {number} [fromSeq]
   * @param {number} [toSeq]
   * @returns {HistoryRow[]}
   */
  readRange(executionId, fromSeq, toSeq) {
    const rows = this.#byExecution.get(executionId) ?? [];
    return rows
      .filter((r) => {
        if (fromSeq !== undefined && r.seq < fromSeq) return false;
        if (toSeq !== undefined && r.seq > toSeq) return false;
        return true;
      })
      .map((r) => ({
        ...r,
        payload: structuredClone(r.payload),
      }));
  }

  /**
   * @param {string} executionId
   * @returns {HistoryRow[]}
   */
  listByExecution(executionId) {
    return this.readRange(executionId);
  }
}
