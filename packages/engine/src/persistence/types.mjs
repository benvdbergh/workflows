/**
 * @typedef {'command' | 'event'} HistoryKind
 */

/**
 * @typedef {object} HistoryAppendInput
 * @property {HistoryKind} kind
 * @property {string} name
 * @property {object} payload
 */

/**
 * One row in the append-only execution history (read model).
 *
 * @typedef {object} HistoryRow
 * @property {string} executionId
 * @property {number} seq Monotonic per execution (starts at 1).
 * @property {HistoryKind} kind
 * @property {string} name
 * @property {object} payload Parsed JSON object.
 * @property {string} [createdAt] ISO 8601 timestamp when stored (if available).
 * @property {number} [recordSchemaVersion] Persisted envelope version (see `history-record-schema-version.mjs`). Omitted or unset reads as **1**.
 */

/**
 * Port: append-only, execution-scoped command/event history.
 *
 * **Record envelope:** Adapters MUST stamp each appended row with
 * `CURRENT_HISTORY_RECORD_SCHEMA_VERSION` (see `history-record-schema-version.mjs`) so readers
 * can fail fast on newer stores.
 *
 * **Concurrency:** Implementations should assume a **single writer per process** for a given
 * `executionId`. SQLite uses a transaction (read max `seq` then insert) so appends stay
 * monotonic for that writer. Multiple processes writing the same execution are not supported.
 *
 * @typedef {object} ExecutionHistoryStore
 * @property {(executionId: string, input: HistoryAppendInput) => number} append Returns assigned `seq`.
 * @property {(executionId: string, fromSeq?: number, toSeq?: number) => HistoryRow[]} readRange Inclusive bounds when provided; ordered by `seq` ascending.
 * @property {(executionId: string) => HistoryRow[]} listByExecution Convenience: all rows for an execution, ordered by `seq`.
 */

export {};
