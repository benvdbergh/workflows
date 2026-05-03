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
});
