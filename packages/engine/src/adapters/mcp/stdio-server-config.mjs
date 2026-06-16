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
import { StubActivityExecutor } from "../../orchestrator/activity-executor.mjs";
import {
  buildCompositeActivityExecutor,
  CompositeActivityExecutor,
} from "../../orchestrator/composite-activity-executor.mjs";
import { LlmActivityExecutor } from "../../orchestrator/llm-activity-executor.mjs";
import { McpManifestActivityExecutor } from "../../orchestrator/mcp-stdio-activity-executor.mjs";
import {
  StepActivityExecutor,
  StepHandlerRegistry,
} from "../../orchestrator/step-activity-executor.mjs";

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
 * @param {string} raw Env value (inline JSON object or file path).
 * @param {string} cwd
 * @param {string} label Env var name for error messages.
 * @returns {Record<string, unknown>}
 */
function parseJsonEnvOrFilePath(raw, cwd, label) {
  const trimmed = String(raw).trim();
  let text;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    text = trimmed;
  } else {
    const p = path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
    text = readFileSync(p, "utf8");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} is not valid JSON: ${message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return /** @type {Record<string, unknown>} */ (parsed);
}

/**
 * Reads LLM operator config from `WORKFLOW_ENGINE_LLM_CONFIG` (inline JSON or file path).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [cwd]
 * @returns {import("../../orchestrator/llm-activity-executor.mjs").LlmOperatorConfig | null}
 */
export function resolveLlmOperatorConfigFromEnv(env = process.env, cwd = process.cwd()) {
  const raw = env.WORKFLOW_ENGINE_LLM_CONFIG;
  if (!raw || String(raw).trim() === "") {
    return null;
  }
  const parsed = parseJsonEnvOrFilePath(raw, cwd, "WORKFLOW_ENGINE_LLM_CONFIG");
  return /** @type {import("../../orchestrator/llm-activity-executor.mjs").LlmOperatorConfig} */ (parsed);
}

/**
 * Loads a frozen {@link StepHandlerRegistry} from `WORKFLOW_ENGINE_STEP_HANDLERS`.
 * Value is inline JSON or a file path. Each key is a handler URN; each value is the static handler output
 * (same shape as conformance `stepHandlers` vectors).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [cwd]
 * @returns {import("../../orchestrator/step-activity-executor.mjs").StepHandlerRegistry | null}
 */
export function loadStepHandlerRegistryFromEnv(env = process.env, cwd = process.cwd()) {
  const raw = env.WORKFLOW_ENGINE_STEP_HANDLERS;
  if (!raw || String(raw).trim() === "") {
    return null;
  }
  const handlers = parseJsonEnvOrFilePath(raw, cwd, "WORKFLOW_ENGINE_STEP_HANDLERS");
  const registry = new StepHandlerRegistry();
  for (const [urn, output] of Object.entries(handlers)) {
    registry.register(urn, async () => /** @type {Record<string, unknown>} */ (output));
  }
  return registry.createFrozenCopy();
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

/**
 * @param {{
 *   manifestPath?: string | null;
 *   llmConfig?: import("../../orchestrator/llm-activity-executor.mjs").LlmOperatorConfig | null;
 *   stepHandlerRegistry?: import("../../orchestrator/step-activity-executor.mjs").StepHandlerRegistry | null;
 *   env?: NodeJS.ProcessEnv;
 *   cwd?: string;
 *   profile?: string | null;
 * }} [options]
 * @returns {Promise<
 *   | { ok: true; executor: CompositeActivityExecutor | undefined }
 *   | { ok: false; errors: ReadonlyArray<{ instancePath?: string; keyword: string; message?: string }> }
 *   | { ok: false; error: string }
 * >}
 */
export async function loadProductionActivityExecutor(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const profile = options.profile ?? env.WORKFLOW_ENGINE_PROFILE ?? null;
  const demoProfile = profile === "demo";

  /** @type {Partial<{ step: import("../../orchestrator/activity-executor.mjs").ActivityExecutor; llm_call: import("../../orchestrator/activity-executor.mjs").ActivityExecutor; tool_call: import("../../orchestrator/activity-executor.mjs").ActivityExecutor; fallback?: import("../../orchestrator/activity-executor.mjs").ActivityExecutor }>} */
  const subExecutors = {};

  const manifestPath =
    options.manifestPath !== undefined ? options.manifestPath : resolveWorkflowEngineMcpConfigPath(process.argv, cwd);

  if (manifestPath) {
    const loaded = await loadEngineDirectActivityExecutor(manifestPath, { cwd });
    if (!loaded.ok) {
      return loaded;
    }
    subExecutors.tool_call = loaded.executor;
  }

  const llmConfig =
    options.llmConfig !== undefined ? options.llmConfig : resolveLlmOperatorConfigFromEnv(env, cwd);
  if (llmConfig) {
    subExecutors.llm_call = new LlmActivityExecutor({ operatorConfig: llmConfig, env });
  }

  const stepRegistry =
    options.stepHandlerRegistry !== undefined
      ? options.stepHandlerRegistry
      : loadStepHandlerRegistryFromEnv(env, cwd);
  if (stepRegistry) {
    subExecutors.step = new StepActivityExecutor({ registry: stepRegistry });
  }

  if (!subExecutors.step && !subExecutors.llm_call && !subExecutors.tool_call) {
    return { ok: true, executor: undefined };
  }

  if (demoProfile) {
    subExecutors.fallback = new StubActivityExecutor();
  }

  return { ok: true, executor: buildCompositeActivityExecutor(subExecutors) };
}

export { enginePackageVersion };
