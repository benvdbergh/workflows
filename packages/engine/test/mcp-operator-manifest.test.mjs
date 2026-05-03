import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizeMcpOperatorManifest,
  readAndValidateMcpOperatorManifestFile,
  resolveMcpOperatorManifestPath,
  validateMcpOperatorManifest,
} from "../src/config/mcp-operator-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures", "mcp-manifest");

describe("validateMcpOperatorManifest", () => {
  it("accepts valid fixture and normalizes defaults", () => {
    const data = JSON.parse(readFileSync(path.join(fixturesDir, "valid.json"), "utf8"));
    const result = validateMcpOperatorManifest(data);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.manifest.mcpServers.minimal.command, "node");
    assert.deepEqual(result.manifest.mcpServers.minimal.args, []);
    assert.deepEqual(result.manifest.mcpServers.minimal.env, {});
    assert.ok(Array.isArray(result.manifest.mcpServers["demo-tool"].args));
    assert.equal(result.manifest.mcpServers["demo-tool"].env.EXAMPLE_TOKEN, "REDACTED_PLACEHOLDER");
  });

  it("rejects unknown top-level keys with actionable errors", () => {
    const data = JSON.parse(readFileSync(path.join(fixturesDir, "unknown-top-level.json"), "utf8"));
    const result = validateMcpOperatorManifest(data);
    assert.equal(result.ok, false);
    if (result.ok) return;
    const msg = JSON.stringify(result.errors ?? []);
    assert.ok(msg.includes("alwaysAllow") || msg.includes("additional properties"), msg);
  });

  it("rejects unknown server fields (e.g. url alongside strict schema)", () => {
    const data = JSON.parse(readFileSync(path.join(fixturesDir, "unknown-server-field.json"), "utf8"));
    const result = validateMcpOperatorManifest(data);
    assert.equal(result.ok, false);
  });

  it("rejects missing command", () => {
    const data = JSON.parse(readFileSync(path.join(fixturesDir, "missing-command.json"), "utf8"));
    const result = validateMcpOperatorManifest(data);
    assert.equal(result.ok, false);
  });

  it("rejects empty mcpServers", () => {
    const result = validateMcpOperatorManifest({ mcpServers: {} });
    assert.equal(result.ok, false);
  });
});

describe("normalizeMcpOperatorManifest", () => {
  it("copies args and env defensively", () => {
    const raw = {
      mcpServers: {
        x: { command: "sh", args: ["-c", "true"], env: { A: "1" } },
      },
    };
    const n = normalizeMcpOperatorManifest(raw);
    n.mcpServers.x.args.push("mutated");
    raw.mcpServers.x.args.push("raw-mutated");
    assert.deepEqual(n.mcpServers.x.args, ["-c", "true", "mutated"]);
  });
});

describe("readAndValidateMcpOperatorManifestFile", () => {
  it("returns parse error for invalid JSON", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mcp-manifest-"));
    const bad = path.join(dir, "bad.json");
    writeFileSync(bad, "{ not json", "utf8");
    const result = await readAndValidateMcpOperatorManifestFile(bad);
    rmSync(dir, { recursive: true, force: true });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors?.some((e) => e.keyword === "parse"));
  });
});

describe("resolveMcpOperatorManifestPath", () => {
  it("prefers explicitPath over env and default file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mcp-resolve-"));
    const explicit = path.join(dir, "explicit.json");
    const hidden = path.join(dir, ".agent-workflow", "mcp.json");
    mkdirSync(path.dirname(hidden), { recursive: true });
    writeFileSync(hidden, '{"mcpServers":{"h":{"command":"x"}}}', "utf8");
    writeFileSync(explicit, '{"mcpServers":{"e":{"command":"y"}}}', "utf8");
    const prev = process.env.AGENT_WORKFLOW_MCP_MANIFEST;
    process.env.AGENT_WORKFLOW_MCP_MANIFEST = hidden;
    try {
      const got = resolveMcpOperatorManifestPath({ cwd: dir, explicitPath: explicit });
      assert.equal(got, path.resolve(explicit));
    } finally {
      if (prev === undefined) delete process.env.AGENT_WORKFLOW_MCP_MANIFEST;
      else process.env.AGENT_WORKFLOW_MCP_MANIFEST = prev;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses AGENT_WORKFLOW_MCP_MANIFEST when set and no explicit path", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mcp-env-"));
    const p = path.join(dir, "from-env.json");
    writeFileSync(p, '{"mcpServers":{"a":{"command":"z"}}}', "utf8");
    const prev = process.env.AGENT_WORKFLOW_MCP_MANIFEST;
    process.env.AGENT_WORKFLOW_MCP_MANIFEST = p;
    try {
      const got = resolveMcpOperatorManifestPath({ cwd: dir });
      assert.equal(got, path.resolve(p));
    } finally {
      if (prev === undefined) delete process.env.AGENT_WORKFLOW_MCP_MANIFEST;
      else process.env.AGENT_WORKFLOW_MCP_MANIFEST = prev;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to .agent-workflow/mcp.json when present", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mcp-default-"));
    const defaultPath = path.join(dir, ".agent-workflow", "mcp.json");
    mkdirSync(path.dirname(defaultPath), { recursive: true });
    writeFileSync(defaultPath, '{"mcpServers":{"d":{"command":"w"}}}', "utf8");
    try {
      const got = resolveMcpOperatorManifestPath({ cwd: dir });
      assert.equal(got, defaultPath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns null when nothing matches", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mcp-none-"));
    const prev = process.env.AGENT_WORKFLOW_MCP_MANIFEST;
    delete process.env.AGENT_WORKFLOW_MCP_MANIFEST;
    try {
      assert.equal(resolveMcpOperatorManifestPath({ cwd: dir }), null);
    } finally {
      if (prev !== undefined) process.env.AGENT_WORKFLOW_MCP_MANIFEST = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
