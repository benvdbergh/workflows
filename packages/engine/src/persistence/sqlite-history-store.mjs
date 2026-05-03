import { DatabaseSync } from "node:sqlite";
import { CURRENT_HISTORY_RECORD_SCHEMA_VERSION } from "./history-record-schema-version.mjs";

/** @typedef {import("./types.mjs").HistoryAppendInput} HistoryAppendInput */
/** @typedef {import("./types.mjs").HistoryRow} HistoryRow */
/** @typedef {import("./types.mjs").ExecutionHistoryStore} ExecutionHistoryStore */

/**
 * @param {DatabaseSync} db
 */
function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS history (
      execution_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      record_schema_version INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (execution_id, seq)
    );
  `);
  /** @type {Array<{ name: string }>} */
  const cols = db.prepare("PRAGMA table_info(history)").all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("record_schema_version")) {
    db.exec(`ALTER TABLE history ADD COLUMN record_schema_version INTEGER NOT NULL DEFAULT 1`);
  }
}

/**
 * SQLite-backed {@link ExecutionHistoryStore} via **Node built-in** `node:sqlite` (`DatabaseSync`).
 * Append-only: no UPDATE/DELETE APIs on historical rows.
 *
 * **Monotonicity:** Each `append` uses a transaction (`BEGIN IMMEDIATE` … `COMMIT`): read
 * `MAX(seq)` for the execution, then `INSERT` with `seq + 1`. Assume a **single writer per
 * process** (and avoid concurrent writers across processes on the same file for the same
 * `executionId`).
 *
 * **Runtime:** Node.js **≥ 22.5.0** (module added in v22.5.0).
 *
 * @implements {ExecutionHistoryStore}
 */
export class SqliteExecutionHistoryStore {
  /** @type {DatabaseSync} */
  #db;
  /** @type {boolean} */
  #ownsDb;

  /**
   * @param {{ path: string } | { database: DatabaseSync }} options
   *   Use `path` for a file path or `:memory:`. Use `database` to inject a `DatabaseSync` (caller may `close()`).
   */
  constructor(options) {
    if ("database" in options && options.database) {
      this.#db = options.database;
      this.#ownsDb = false;
    } else if ("path" in options && options.path !== undefined) {
      this.#db = new DatabaseSync(options.path);
      this.#ownsDb = true;
    } else {
      throw new Error("SqliteExecutionHistoryStore: expected { path: string } or { database: DatabaseSync }");
    }
    ensureSchema(this.#db);
    try {
      this.#db.exec("PRAGMA journal_mode = WAL;");
      this.#db.exec("PRAGMA foreign_keys = ON;");
    } catch {
      /* pragma may fail on some builds; history table still works */
    }
  }

  /**
   * @param {string} executionId
   * @param {HistoryAppendInput} input
   * @returns {number}
   */
  append(executionId, input) {
    const payloadJson = JSON.stringify(input.payload);
    const createdAt = new Date().toISOString();
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.#db
        .prepare(`SELECT COALESCE(MAX(seq), 0) AS m FROM history WHERE execution_id = ?`)
        .get(executionId);
      const m = row && typeof row.m === "number" ? row.m : 0;
      const nextSeq = m + 1;
      this.#db
        .prepare(
          `INSERT INTO history (execution_id, seq, kind, name, payload_json, created_at, record_schema_version)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          executionId,
          nextSeq,
          input.kind,
          input.name,
          payloadJson,
          createdAt,
          CURRENT_HISTORY_RECORD_SCHEMA_VERSION
        );
      this.#db.exec("COMMIT");
      return nextSeq;
    } catch (err) {
      try {
        this.#db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    }
  }

  /**
   * @param {string} executionId
   * @param {number} [fromSeq]
   * @param {number} [toSeq]
   * @returns {HistoryRow[]}
   */
  readRange(executionId, fromSeq, toSeq) {
    let sql = `
      SELECT execution_id, seq, kind, name, payload_json, created_at,
             COALESCE(record_schema_version, 1) AS record_schema_version
      FROM history
      WHERE execution_id = ?
    `;
    /** @type {unknown[]} */
    const params = [executionId];
    if (fromSeq !== undefined) {
      sql += ` AND seq >= ?`;
      params.push(fromSeq);
    }
    if (toSeq !== undefined) {
      sql += ` AND seq <= ?`;
      params.push(toSeq);
    }
    sql += ` ORDER BY seq ASC`;
    const raw = this.#db.prepare(sql.trim()).all(...params);
    return raw.map((r) => {
      const row = /** @type {{ execution_id: string; seq: number; kind: string; name: string; payload_json: string; created_at: string; record_schema_version?: number }} */ (
        r
      );
      return /** @type {HistoryRow} */ ({
        executionId: row.execution_id,
        seq: row.seq,
        kind: row.kind,
        name: row.name,
        payload: JSON.parse(row.payload_json),
        createdAt: row.created_at,
        recordSchemaVersion:
          typeof row.record_schema_version === "number" ? row.record_schema_version : 1,
      });
    });
  }

  /**
   * @param {string} executionId
   * @returns {HistoryRow[]}
   */
  listByExecution(executionId) {
    return this.readRange(executionId);
  }

  close() {
    if (this.#ownsDb) this.#db.close();
  }
}
