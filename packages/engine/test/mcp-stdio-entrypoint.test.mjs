import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("MCP stdio entrypoint", () => {
  it("prints usage on --help", () => {
    const scriptPath = path.resolve(__dirname, "../src/mcp-stdio-server.mjs");
    const run = spawnSync(process.execPath, [scriptPath, "--help"], { encoding: "utf8" });

    assert.equal(run.status, 0);
    assert.match(run.stdout, /workflow_submit_activity/i);
    assert.match(run.stdout, /workflow_start\/workflow_status\/workflow_resume/i);
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
});
