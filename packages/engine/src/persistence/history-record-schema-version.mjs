/**
 * Version of the **persisted history row envelope** (store columns + payload interpretation
 * contract), not the workflow definition `document.schema` (RFC-03) and not RFC-04 command/event
 * taxonomy names.
 *
 * Bump when adding required columns, changing payload normalization, or breaking replay in a way
 * that requires migration or a compatibility shim.
 */
export const CURRENT_HISTORY_RECORD_SCHEMA_VERSION = 1;

/**
 * @param {unknown} v
 * @returns {number}
 */
export function coerceRecordSchemaVersion(v) {
  if (typeof v === "number" && Number.isInteger(v) && v >= 1) return v;
  return 1;
}

/**
 * @param {import("./types.mjs").HistoryRow} row
 * @returns {number}
 */
export function recordSchemaVersionOf(row) {
  return coerceRecordSchemaVersion(row.recordSchemaVersion);
}

/**
 * Ensures every row in a loaded execution can be interpreted by this engine build.
 *
 * @param {import("./types.mjs").HistoryRow[]} rows
 */
export function assertHistoryReadableByEngine(rows) {
  for (const row of rows) {
    const v = recordSchemaVersionOf(row);
    if (v > CURRENT_HISTORY_RECORD_SCHEMA_VERSION) {
      throw new Error(
        `History row seq ${row.seq} uses record_schema_version ${v}; this engine supports up to ${CURRENT_HISTORY_RECORD_SCHEMA_VERSION}. Upgrade @agent-workflow/engine.`
      );
    }
  }
}
