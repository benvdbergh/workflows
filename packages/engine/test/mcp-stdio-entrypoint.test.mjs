import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  resolveExecutionHistoryStoreOptions,
} from "../src/adapters/mcp/stdio-server-config.mjs";
import { SqliteExecutionHistoryStore } from "../src/persistence/sqlite-history-store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("resolveExecutionHistoryStoreOptions", () => {
  it("defaults to memory when unset", () => {
    const result = resolveExecutionHistoryStoreOptions(["node", "mcp.mjs"], {}, process.cwd());
    assert.deepEqual(result, { ok: true, kind: "memory" });
  });

  it("prefers --store and --store-path over env", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wf-store-"));
    const dbPath = path.join(dir, "runs.sqlite");
    const env = {
      WORKFLOW_ENGINE_STORE: "memory",
      WORKFLOW_ENGINE_STORE_PATH: path.join(dir, "ignored.sqlite"),
    };
    const argv = ["node", "mcp.mjs", "--store", "sqlite", "--store-path", dbPath];
    const result = resolveExecutionHistoryStoreOptions(argv, env, dir);
    assert.deepEqual(result, { ok: true, kind: "sqlite", path: dbPath });
  });

  it("uses WORKFLOW_ENGINE_STORE env when flags absent", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wf-store-"));
    const dbPath = path.join(dir, "env.sqlite");
    const result = resolveExecutionHistoryStoreOptions(
      ["node", "mcp.mjs"],
      { WORKFLOW_ENGINE_STORE: "sqlite", WORKFLOW_ENGINE_STORE_PATH: "env.sqlite" },
      dir
    );
    assert.deepEqual(result, { ok: true, kind: "sqlite", path: dbPath });
  });

  it("rejects sqlite without store path", () => {
    const result = resolveExecutionHistoryStoreOptions(["node", "mcp.mjs", "--store", "sqlite"], {}, process.cwd());
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /store-path/i);
    }
  });

  it("rejects unknown store kind", () => {
    const result = resolveExecutionHistoryStoreOptions(["node", "mcp.mjs", "--store", "postgres"], {}, process.cwd());
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /Unknown store kind/i);
    }
  });
});

describe("resolveExecutionHistoryStoreOptions persistence", () => {
  it("persists rows in sqlite and survives reopen", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wf-store-"));
    const dbPath = path.join(dir, "runs.sqlite");
    try {
      const options = { ok: true, kind: "sqlite", path: dbPath };
      const store = new SqliteExecutionHistoryStore({ path: dbPath });
      store.append("exec-1", { kind: "command", name: "StartRun", payload: { executionId: "exec-1" } });
      store.close();

      const reopened = new SqliteExecutionHistoryStore({ path: dbPath });
      const rows = reopened.listByExecution("exec-1");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].name, "StartRun");
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("MCP stdio entrypoint", () => {
  it("prints usage on --help", () => {
    const scriptPath = path.resolve(__dirname, "../src/mcp-stdio-server.mjs");
    const run = spawnSync(process.execPath, [scriptPath, "--help"], { encoding: "utf8" });

    assert.equal(run.status, 0);
    assert.match(run.stdout, /workflow_submit_activity/i);
    assert.match(run.stdout, /workflow_start\/workflow_status\/workflow_resume/i);
    assert.match(run.stdout, /--store memory\|sqlite/i);
    assert.match(run.stdout, /--store-path/i);
    assert.equal(run.stderr, "");
  });

  it("logs activity routing summary on startup for partial operator config", () => {
    const scriptPath = path.resolve(__dirname, "../src/mcp-stdio-server.mjs");
    const run = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        WORKFLOW_ENGINE_LLM_CONFIG: '{"apiKeyEnv":"TEST_LLM_KEY"}',
        TEST_LLM_KEY: "sk-test",
        WORKFLOW_ENGINE_MCP_CONFIG: "",
      },
      timeout: 2000,
    });

    assert.match(run.stderr, /\[engine-mcp-stdio\] execution history store: memory/);
    assert.match(
      run.stderr,
      /\[engine-mcp-stdio\] activity routing: llm_call=production, tool_call=missing, step=missing/
    );
    assert.match(run.stderr, /\[engine-mcp-stdio\] demo stub fallback: inactive/);
  });

  it("warns when WORKFLOW_ENGINE_AUTH_TOKENS is set", () => {
    const scriptPath = path.resolve(__dirname, "../src/mcp-stdio-server.mjs");
    const run = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        WORKFLOW_ENGINE_AUTH_TOKENS: '[{"token":"t1","scopes":["start"]}]',
        WORKFLOW_ENGINE_MCP_CONFIG: "",
      },
      timeout: 2000,
    });

    assert.match(
      run.stderr,
      /WORKFLOW_ENGINE_AUTH_TOKENS is set but stdio does not enforce bearer auth/
    );
  });

  it("exits when sqlite store is requested without store path", () => {
    const scriptPath = path.resolve(__dirname, "../src/mcp-stdio-server.mjs");
    const run = spawnSync(process.execPath, [scriptPath, "--store", "sqlite"], {
      encoding: "utf8",
      env: {
        ...process.env,
        WORKFLOW_ENGINE_MCP_CONFIG: "",
      },
    });

    assert.equal(run.status, 1);
    assert.match(run.stderr, /SQLite store requires --store-path/i);
  });

  it("logs sqlite store path on startup", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wf-mcp-sqlite-"));
    const dbPath = path.join(dir, "runs.sqlite");
    const scriptPath = path.resolve(__dirname, "../src/mcp-stdio-server.mjs");
    const run = spawnSync(process.execPath, [scriptPath, "--store", "sqlite", "--store-path", dbPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        WORKFLOW_ENGINE_MCP_CONFIG: "",
      },
      timeout: 2000,
    });

    try {
      assert.match(run.stderr, /execution history store: sqlite/);
      assert.match(run.stderr, new RegExp(dbPath.replace(/\\/g, "\\\\")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
