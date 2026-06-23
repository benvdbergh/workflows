import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runGraphWorkflow, SqliteExecutionHistoryStore } from "../packages/engine/src/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

/**
 * SQLite execution history smoke: a completed run persists rows that survive store reopen.
 */
export async function runSqliteStoreSmoke() {
  const definition = JSON.parse(
    readFileSync(path.join(repoRoot, "examples", "fixtures.valid", "minimal-linear.workflow.json"), "utf8")
  );
  const executionId = "sqlite-store-smoke-1";
  const dir = mkdtempSync(path.join(tmpdir(), "wf-sqlite-smoke-"));
  const dbPath = path.join(dir, "runs.sqlite");

  try {
    const store = new SqliteExecutionHistoryStore({ path: dbPath });
    const run = await runGraphWorkflow({
      definition,
      input: {},
      executionId,
      store,
    });
    if (run.status !== "completed") {
      store.close();
      return {
        passed: false,
        reason: `SQLite smoke expected status completed but got ${run.status}`,
      };
    }

    const rowCount = store.listByExecution(executionId).length;
    store.close();
    if (rowCount < 2) {
      return {
        passed: false,
        reason: `SQLite smoke expected persisted history rows but got ${rowCount}`,
      };
    }

    const reopened = new SqliteExecutionHistoryStore({ path: dbPath });
    const persisted = reopened.listByExecution(executionId);
    reopened.close();
    if (persisted.length !== rowCount) {
      return {
        passed: false,
        reason: `SQLite smoke reopen row count mismatch: ${persisted.length} vs ${rowCount}`,
      };
    }

    return { passed: true };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  const result = await runSqliteStoreSmoke();
  if (result.passed) {
    console.error("PASS [sqlite-store-smoke] SqliteExecutionHistoryStore persistence");
  } else {
    console.error(`FAIL [sqlite-store-smoke] ${result.reason}`);
    process.exitCode = 1;
  }
}
