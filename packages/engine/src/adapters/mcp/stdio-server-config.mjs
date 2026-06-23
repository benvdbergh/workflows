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
  A2ADelegateExecutor,
  parseA2AOperatorConfig,
} from "../../orchestrator/a2a-delegate-executor.mjs";
import {
  buildCompositeActivityExecutor,
  CompositeActivityExecutor,
} from "../../orchestrator/composite-activity-executor.mjs";
import {
  buildCompositeDelegateExecutor,
  CompositeDelegateExecutor,
} from "../../orchestrator/composite-delegate-executor.mjs";
import { MockA2ADelegateExecutor } from "../../orchestrator/delegate-executor.mjs";
import { LlmActivityExecutor } from "../../orchestrator/llm-activity-executor.mjs";
import { McpDelegateExecutor } from "../../orchestrator/mcp-delegate-executor.mjs";
import { McpManifestActivityExecutor } from "../../orchestrator/mcp-stdio-activity-executor.mjs";
import {
  StepActivityExecutor,
  StepHandlerRegistry,
} from "../../orchestrator/step-activity-executor.mjs";
import {
  resolveDefinitionSigningOptions,
  resolveDefinitionSigningPolicyFromEnv,
  resolveSigningPublicKeysFromEnv,
} from "../../definition-signing.mjs";
import { createDefaultSecretResolver } from "../../security/secret-resolver.mjs";

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
 * @typedef {{ ok: true; kind: "memory" } | { ok: true; kind: "sqlite"; path: string } | { ok: false; error: string }} ExecutionHistoryStoreResolveResult
 */

/**
 * Resolves execution history store options for `workflows-engine-mcp`.
 * CLI `--store` / `--store-path` win over `WORKFLOW_ENGINE_STORE` / `WORKFLOW_ENGINE_STORE_PATH`.
 * Default: in-memory store (backward compatible).
 *
 * @param {string[]} argv process.argv
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [cwd]
 * @returns {ExecutionHistoryStoreResolveResult}
 */
export function resolveExecutionHistoryStoreOptions(argv, env = process.env, cwd = process.cwd()) {
  const sliced = argv.slice(2);
  /** @type {string | null} */
  let storeKind = null;
  /** @type {string | null} */
  let storePath = null;

  for (let i = 0; i < sliced.length; i++) {
    if (sliced[i] === "--store" && i + 1 < sliced.length) {
      storeKind = sliced[i + 1];
      i++;
      continue;
    }
    if (sliced[i] === "--store-path" && i + 1 < sliced.length) {
      storePath = sliced[i + 1];
      i++;
    }
  }

  if (!storeKind) {
    const envStore = env.WORKFLOW_ENGINE_STORE;
    if (envStore && String(envStore).trim() !== "") {
      storeKind = String(envStore).trim();
    }
  }
  if (!storePath) {
    const envPath = env.WORKFLOW_ENGINE_STORE_PATH;
    if (envPath && String(envPath).trim() !== "") {
      storePath = String(envPath).trim();
    }
  }

  const kind = storeKind ? String(storeKind).trim().toLowerCase() : "memory";
  if (kind === "memory") {
    return { ok: true, kind: "memory" };
  }
  if (kind === "sqlite") {
    if (!storePath || String(storePath).trim() === "") {
      return {
        ok: false,
        error: "SQLite store requires --store-path <path> or WORKFLOW_ENGINE_STORE_PATH",
      };
    }
    const p = String(storePath).trim();
    return { ok: true, kind: "sqlite", path: path.isAbsolute(p) ? p : path.resolve(cwd, p) };
  }
  return { ok: false, error: `Unknown store kind "${storeKind}"; expected memory or sqlite` };
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
 * Reads A2A operator config from `WORKFLOW_ENGINE_A2A_CONFIG` (inline JSON or file path).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [cwd]
 * @returns {import("../../orchestrator/a2a-delegate-executor.mjs").A2AOperatorConfig | null}
 */
export function resolveA2AOperatorConfigFromEnv(env = process.env, cwd = process.cwd()) {
  const raw = env.WORKFLOW_ENGINE_A2A_CONFIG;
  if (!raw || String(raw).trim() === "") {
    return null;
  }
  const parsed = parseJsonEnvOrFilePath(raw, cwd, "WORKFLOW_ENGINE_A2A_CONFIG");
  return /** @type {import("../../orchestrator/a2a-delegate-executor.mjs").A2AOperatorConfig} */ (parsed);
}

/**
 * Loads a frozen {@link StepHandlerRegistry} from `WORKFLOW_ENGINE_STEP_HANDLERS`.
 *
 * **Static-output bootstrap only** — not programmatic handler registration. The env value is inline JSON
 * or a file path to a JSON object. Each key is a handler URN; each value is a **fixed output object**
 * (same shape as conformance `stepHandlers` vectors). Every entry is registered as
 * `async () => output` — the returned object is never computed from workflow state, node config, or I/O.
 *
 * For async handler functions that inspect {@link import("../../orchestrator/step-activity-executor.mjs").StepHandlerContext}
 * or perform side effects, use {@link StepHandlerRegistry#register} at library bootstrap and pass the
 * frozen registry to {@link StepActivityExecutor} (see `packages/engine/README.md`).
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

/** @typedef {"production" | "stub(demo)" | "missing" | "stub(default)"} ActivityRouteStatus */

/**
 * @typedef {{
 *   llm_call: ActivityRouteStatus;
 *   tool_call: ActivityRouteStatus;
 *   step: ActivityRouteStatus;
 *   demoStubFallback: boolean;
 * }} ActivityRoutingSummary
 */

/**
 * @param {{
 *   hasLlm: boolean;
 *   hasTool: boolean;
 *   hasStep: boolean;
 *   demoStubFallback: boolean;
 *   compositeMode: boolean;
 * }} params
 * @returns {ActivityRoutingSummary}
 */
export function buildActivityRoutingSummary(params) {
  /** @param {boolean} configured */
  const status = (configured) => {
    if (configured) {
      return /** @type {ActivityRouteStatus} */ ("production");
    }
    if (!params.compositeMode) {
      return /** @type {ActivityRouteStatus} */ ("stub(default)");
    }
    if (params.demoStubFallback) {
      return /** @type {ActivityRouteStatus} */ ("stub(demo)");
    }
    return /** @type {ActivityRouteStatus} */ ("missing");
  };
  return {
    llm_call: status(params.hasLlm),
    tool_call: status(params.hasTool),
    step: status(params.hasStep),
    demoStubFallback: params.demoStubFallback,
  };
}

/**
 * @param {ActivityRoutingSummary} summary
 * @returns {string}
 */
export function formatActivityRoutingSummaryLog(summary) {
  const routes = [`llm_call=${summary.llm_call}`, `tool_call=${summary.tool_call}`, `step=${summary.step}`].join(", ");
  const fallback = summary.demoStubFallback ? "active" : "inactive";
  return `[engine-mcp-stdio] activity routing: ${routes}\n[engine-mcp-stdio] demo stub fallback: ${fallback}\n`;
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
 *   secretResolver?: import("../../security/secret-resolver.mjs").SecretResolver;
 *   env?: NodeJS.ProcessEnv;
 *   cwd?: string;
 *   profile?: string | null;
 * }} [options]
 * @returns {Promise<
 *   | { ok: true; executor: CompositeActivityExecutor | undefined; routingSummary: ActivityRoutingSummary }
 *   | { ok: false; errors: ReadonlyArray<{ instancePath?: string; keyword: string; message?: string }> }
 *   | { ok: false; error: string }
 * >}
 */
export async function loadProductionActivityExecutor(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const secretResolver = options.secretResolver ?? createDefaultSecretResolver({ env, cwd });
  const profile = options.profile ?? env.WORKFLOW_ENGINE_PROFILE ?? null;
  const demoProfile = profile === "demo";

  /** @type {Partial<{ step: import("../../orchestrator/activity-executor.mjs").ActivityExecutor; llm_call: import("../../orchestrator/activity-executor.mjs").ActivityExecutor; tool_call: import("../../orchestrator/activity-executor.mjs").ActivityExecutor; fallback?: import("../../orchestrator/activity-executor.mjs").ActivityExecutor }>} */
  const subExecutors = {};

  const manifestPath =
    options.manifestPath !== undefined ? options.manifestPath : resolveWorkflowEngineMcpConfigPath(process.argv, cwd);

  let hasTool = false;
  if (manifestPath) {
    const loaded = await loadEngineDirectActivityExecutor(manifestPath, { cwd });
    if (!loaded.ok) {
      return loaded;
    }
    subExecutors.tool_call = loaded.executor;
    hasTool = true;
  }

  const llmConfig =
    options.llmConfig !== undefined ? options.llmConfig : resolveLlmOperatorConfigFromEnv(env, cwd);
  let hasLlm = false;
  if (llmConfig) {
    subExecutors.llm_call = new LlmActivityExecutor({ operatorConfig: llmConfig, env, secretResolver });
    hasLlm = true;
  }

  const stepRegistry =
    options.stepHandlerRegistry !== undefined
      ? options.stepHandlerRegistry
      : loadStepHandlerRegistryFromEnv(env, cwd);
  let hasStep = false;
  if (stepRegistry) {
    subExecutors.step = new StepActivityExecutor({ registry: stepRegistry });
    hasStep = true;
  }

  if (!hasStep && !hasLlm && !hasTool) {
    return {
      ok: true,
      executor: undefined,
      routingSummary: buildActivityRoutingSummary({
        hasLlm: false,
        hasTool: false,
        hasStep: false,
        demoStubFallback: demoProfile,
        compositeMode: false,
      }),
    };
  }

  if (demoProfile) {
    subExecutors.fallback = new StubActivityExecutor();
  }

  return {
    ok: true,
    executor: buildCompositeActivityExecutor(subExecutors),
    routingSummary: buildActivityRoutingSummary({
      hasLlm,
      hasTool,
      hasStep,
      demoStubFallback: demoProfile,
      compositeMode: true,
    }),
  };
}

/**
 * @param {string} manifestPath
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<
 *   | { ok: true; executor: import("../../orchestrator/mcp-delegate-executor.mjs").McpDelegateExecutor | undefined }
 *   | { ok: false; errors: ReadonlyArray<{ instancePath?: string; keyword: string; message?: string }> }
 * >}
 */
export async function loadEngineDirectMcpDelegateExecutor(manifestPath, options = {}) {
  const result = await readAndValidateMcpOperatorManifestFile(manifestPath, options);
  if (!result.ok) {
    return { ok: false, errors: result.errors };
  }
  if (!result.manifest.delegateAgents) {
    return { ok: true, executor: undefined };
  }
  const executor = new McpDelegateExecutor({
    manifest: result.manifest,
    clientName: "@agent-workflow/workflows-engine-mcp",
    clientVersion: enginePackageVersion,
  });
  return { ok: true, executor };
}

/**
 * @param {{
 *   manifestPath?: string | null;
 *   a2aConfig?: import("../../orchestrator/a2a-delegate-executor.mjs").A2AOperatorConfig | null;
 *   secretResolver?: import("../../security/secret-resolver.mjs").SecretResolver;
 *   env?: NodeJS.ProcessEnv;
 *   cwd?: string;
 *   profile?: string | null;
 * }} [options]
 * @returns {Promise<
 *   | { ok: true; executor: CompositeDelegateExecutor | undefined }
 *   | { ok: false; errors: ReadonlyArray<{ instancePath?: string; keyword: string; message?: string }> }
 *   | { ok: false; error: string }
 * >}
 */
export async function loadProductionDelegateExecutor(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const secretResolver = options.secretResolver ?? createDefaultSecretResolver({ env, cwd });
  const profile = options.profile ?? env.WORKFLOW_ENGINE_PROFILE ?? null;
  const demoProfile = profile === "demo";

  /** @type {Partial<{ a2a: import("../../orchestrator/delegate-executor.mjs").DelegateExecutor; mcp: import("../../orchestrator/delegate-executor.mjs").DelegateExecutor; fallback?: import("../../orchestrator/delegate-executor.mjs").DelegateExecutor }>} */
  const subExecutors = {};

  const manifestPath =
    options.manifestPath !== undefined ? options.manifestPath : resolveWorkflowEngineMcpConfigPath(process.argv, cwd);

  if (manifestPath) {
    const loaded = await loadEngineDirectMcpDelegateExecutor(manifestPath, { cwd });
    if (!loaded.ok) {
      return loaded;
    }
    if (loaded.executor) {
      subExecutors.mcp = loaded.executor;
    }
  }

  const a2aConfig =
    options.a2aConfig !== undefined ? options.a2aConfig : resolveA2AOperatorConfigFromEnv(env, cwd);
  if (a2aConfig) {
    const parsed = parseA2AOperatorConfig(a2aConfig);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    subExecutors.a2a = new A2ADelegateExecutor({ operatorConfig: a2aConfig, env, secretResolver });
  }

  if (!subExecutors.a2a && !subExecutors.mcp) {
    return { ok: true, executor: undefined };
  }

  if (demoProfile) {
    subExecutors.fallback = new MockA2ADelegateExecutor();
  }

  return { ok: true, executor: buildCompositeDelegateExecutor(subExecutors) };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [cwd]
 * @returns {import("../../adapters/mcp/transport-validation.mjs").TransportValidationOptions}
 */
export function resolveTransportValidationOptionsFromEnv(env = process.env, cwd = process.cwd()) {
  return {
    signing: resolveDefinitionSigningOptions({
      policy: resolveDefinitionSigningPolicyFromEnv(env),
      publicKeysById: resolveSigningPublicKeysFromEnv(env, cwd),
      env,
      cwd,
    }),
  };
}

export { enginePackageVersion };
