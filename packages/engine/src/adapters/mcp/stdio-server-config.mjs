/**
 * Resolves engine-direct (MCP manifest) config for `workflows-engine-mcp` only.
 * Does not use `AGENT_WORKFLOW_MCP_MANIFEST` or the default `.agent-workflow/mcp.json` path
 * so the stdio server default remains stub in-process unless explicitly opted in.
 *
 * @see docs/architecture/adr/ADR-0003-engine-direct-mcp-activity-execution.md
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAndValidateMcpOperatorManifestFile } from "../../config/mcp-operator-manifest.mjs";
import { McpManifestActivityExecutor } from "../../orchestrator/mcp-stdio-activity-executor.mjs";

const enginePackageJsonPath = fileURLToPath(new URL("../../../package.json", import.meta.url));
const enginePackageVersion = JSON.parse(readFileSync(enginePackageJsonPath, "utf8")).version;

/**
 * @param {string[]} argv process.argv
 * @param {string} [cwd]
 * @returns {string | null} Absolute path to manifest JSON, or null when engine-direct is not configured.
 */
export function resolveWorkflowEngineMcpConfigPath(argv, cwd = process.cwd()) {
  const sliced = argv.slice(2);
  for (let i = 0; i < sliced.length; i++) {
    if (sliced[i] === "--mcp-config" && i + 1 < sliced.length) {
      const p = sliced[i + 1];
      return path.isAbsolute(p) ? p : path.resolve(cwd, p);
    }
  }
  const env = process.env.WORKFLOW_ENGINE_MCP_CONFIG;
  if (env && String(env).trim() !== "") {
    const p = String(env).trim();
    return path.isAbsolute(p) ? p : path.resolve(cwd, p);
  }
  return null;
}

/**
 * @param {ReadonlyArray<{ instancePath?: string; keyword: string; message?: string }>} errors
 * @returns {string}
 */
export function formatMcpManifestValidationErrors(errors) {
  const lines = [];
  for (const err of errors) {
    const line = [
      err.instancePath !== undefined && err.instancePath !== ""
        ? `instancePath: ${err.instancePath}`
        : "instancePath: (root)",
      `keyword: ${err.keyword}`,
      err.message ? `message: ${err.message}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    lines.push(line);
  }
  return lines.join("\n");
}

/**
 * @param {string} manifestPath
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<
 *   | { ok: true; executor: import("../../orchestrator/mcp-stdio-activity-executor.mjs").McpManifestActivityExecutor }
 *   | { ok: false; errors: ReadonlyArray<{ instancePath?: string; keyword: string; message?: string }> }
 * >}
 */
export async function loadEngineDirectActivityExecutor(manifestPath, options = {}) {
  const result = await readAndValidateMcpOperatorManifestFile(manifestPath, options);
  if (!result.ok) {
    return { ok: false, errors: result.errors };
  }
  const executor = new McpManifestActivityExecutor({
    manifest: result.manifest,
    clientName: "@agent-workflow/workflows-engine-mcp",
    clientVersion: enginePackageVersion,
  });
  return { ok: true, executor };
}

export { enginePackageVersion };
