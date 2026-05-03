/**
 * Operator MCP manifest: Cursor-style `mcp.json` subset (stdio command/args/env only).
 * @see docs/architecture/mcp-operator-manifest.md
 */
import Ajv2020 from "ajv/dist/2020.js";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @typedef {{ command: string, args: string[], env: Record<string, string> }} McpStdioServerDefinition */
/** @typedef {{ mcpServers: Record<string, McpStdioServerDefinition> }} NormalizedMcpOperatorManifest */

/**
 * @returns {string}
 */
function bundledManifestSchemaPath() {
  return path.join(__dirname, "..", "..", "schemas", "mcp-operator-manifest.json");
}

/**
 * @returns {import("ajv").AnySchema}
 */
function loadMcpOperatorManifestSchema() {
  const p = bundledManifestSchemaPath();
  if (!existsSync(p)) {
    throw new Error(`MCP operator manifest schema not found at ${p}`);
  }
  return JSON.parse(readFileSync(p, "utf8"));
}

/** @type {import("ajv").ValidateFunction | null} */
let cachedValidate = null;

/**
 * @returns {(data: unknown) => boolean}
 */
function getCompiledValidator() {
  if (!cachedValidate) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    cachedValidate = ajv.compile(loadMcpOperatorManifestSchema());
  }
  return cachedValidate;
}

/**
 * @param {unknown} data
 * @returns {{ ok: true, manifest: NormalizedMcpOperatorManifest } | { ok: false, errors: import("ajv").ErrorObject[] }}
 */
export function validateMcpOperatorManifest(data) {
  const validate = getCompiledValidator();
  const valid = validate(data);
  if (!valid) {
    return { ok: false, errors: validate.errors ?? [] };
  }
  return { ok: true, manifest: normalizeMcpOperatorManifest(/** @type {Record<string, any>} */ (data)) };
}

/**
 * @param {Record<string, any>} data validated root
 * @returns {NormalizedMcpOperatorManifest}
 */
export function normalizeMcpOperatorManifest(data) {
  const rawServers = data.mcpServers;
  /** @type {Record<string, McpStdioServerDefinition>} */
  const mcpServers = {};
  for (const name of Object.keys(rawServers)) {
    const s = rawServers[name];
    mcpServers[name] = {
      command: s.command,
      args: Array.isArray(s.args) ? [...s.args] : [],
      env: s.env && typeof s.env === "object" && !Array.isArray(s.env) ? { ...s.env } : {},
    };
  }
  return { mcpServers };
}

/**
 * Resolution order for locating a manifest file (no file read).
 * 1. `explicitPath` when provided.
 * 2. `process.env.AGENT_WORKFLOW_MCP_MANIFEST` when set to a non-empty string.
 * 3. `${cwd}/.agent-workflow/mcp.json` when that path exists.
 * Otherwise returns `null`.
 *
 * @param {{ explicitPath?: string | undefined; cwd?: string | undefined }} [options]
 * @returns {string | null}
 */
export function resolveMcpOperatorManifestPath(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  if (options.explicitPath && String(options.explicitPath).trim() !== "") {
    const p = String(options.explicitPath);
    return path.isAbsolute(p) ? p : path.resolve(cwd, p);
  }
  const fromEnv = process.env.AGENT_WORKFLOW_MCP_MANIFEST;
  if (fromEnv && String(fromEnv).trim() !== "") {
    const p = String(fromEnv).trim();
    return path.isAbsolute(p) ? p : path.resolve(cwd, p);
  }
  const defaultPath = path.join(cwd, ".agent-workflow", "mcp.json");
  if (existsSync(defaultPath)) {
    return defaultPath;
  }
  return null;
}

/**
 * Read UTF-8 JSON from disk and validate.
 * @param {string} filePath absolute or relative path (relative to cwd if not absolute)
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<{ ok: true, manifest: NormalizedMcpOperatorManifest } | { ok: false, errors: import("ajv").ErrorObject[] } | { ok: false, errors: { instancePath: string; keyword: string; message: string }[] }>}
 */
export async function readAndValidateMcpOperatorManifestFile(filePath, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  let raw;
  try {
    raw = await readFile(resolved, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      errors: [{ instancePath: "", keyword: "read", message: `Failed to read manifest: ${msg}` }],
    };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      errors: [{ instancePath: "", keyword: "parse", message: `Invalid JSON: ${msg}` }],
    };
  }
  return validateMcpOperatorManifest(data);
}
