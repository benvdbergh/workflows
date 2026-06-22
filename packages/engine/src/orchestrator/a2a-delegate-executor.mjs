/**
 * Production A2A delegate executor for `agent_delegate` nodes with `protocol: "a2a"`.
 *
 * Credentials and A2A base URL come from operator config (env / secret refs), not workflow JSON (RFC-07 §7.3).
 *
 * @see docs/user/a2a-delegate-mapping.md
 */

import { mintDelegateCorrelationId } from "./delegate-executor.mjs";

/** @typedef {"A2A_CONFIG_INVALID" | "A2A_CREDENTIALS_MISSING" | "A2A_TASK_FAILED" | "A2A_PROVIDER_ERROR" | "DELEGATE_PROTOCOL_UNSUPPORTED"} A2ADelegateErrorCode */

/**
 * @typedef {object} A2AOperatorConfig
 * @property {string} [baseUrl] A2A HTTP API base URL (required for production executor).
 * @property {string} [apiKeyEnv] Env var name holding the Bearer token.
 * @property {string} [apiKeySecretRef] Secret ref (`env:VAR` or `file:path`); resolved at invocation via {@link SecretResolver}.
 * @property {number} [pollIntervalMs] Poll interval when task is not terminal (default 500).
 * @property {number} [pollTimeoutMs] Max wait for terminal task status (default 120_000).
 */

/**
 * @typedef {object} A2ATaskSubmitRequest
 * @property {string} apiKey
 * @property {string} agentId
 * @property {string} correlationId
 * @property {Record<string, unknown>} input
 */

/**
 * @typedef {object} A2ATaskRecord
 * @property {string} id
 * @property {"submitted" | "working" | "input-required" | "completed" | "failed"} status
 * @property {Record<string, unknown>} [output]
 * @property {string} [error]
 */

/**
 * Injectable A2A HTTP transport (mock in tests; default uses fetch).
 *
 * @typedef {object} A2ATransport
 * @property {(req: A2ATaskSubmitRequest) => Promise<A2ATaskRecord>} submitTask
 * @property {(apiKey: string, taskId: string) => Promise<A2ATaskRecord>} getTask
 */

/**
 * @param {A2AOperatorConfig | undefined} operatorConfig
 * @param {{ env?: NodeJS.ProcessEnv; secretResolver?: import("../security/secret-resolver.mjs").SecretResolver }} [options]
 * @returns {Promise<{ ok: true, apiKey: string } | { ok: false, error: string, code: "A2A_CONFIG_INVALID" | "A2A_CREDENTIALS_MISSING" }>}
 */
export async function resolveA2AApiKey(operatorConfig, options = {}) {
  const env = options.env ?? process.env;
  const secretResolver = options.secretResolver;
  const cfg = operatorConfig && typeof operatorConfig === "object" ? operatorConfig : {};
  const apiKeyEnv = typeof cfg.apiKeyEnv === "string" ? cfg.apiKeyEnv.trim() : "";
  const secretRef = typeof cfg.apiKeySecretRef === "string" ? cfg.apiKeySecretRef.trim() : "";
  if (apiKeyEnv && secretRef) {
    return {
      ok: false,
      error: "operator config must set only one of apiKeyEnv or apiKeySecretRef",
      code: "A2A_CONFIG_INVALID",
    };
  }
  if (apiKeyEnv) {
    const value = env[apiKeyEnv];
    if (typeof value === "string" && value.trim() !== "") {
      return { ok: true, apiKey: value };
    }
    return {
      ok: false,
      error: `A2A API key env var "${apiKeyEnv}" is unset or empty`,
      code: "A2A_CREDENTIALS_MISSING",
    };
  }
  if (secretRef) {
    if (!secretResolver) {
      return {
        ok: false,
        error: `apiKeySecretRef "${secretRef}" requires a secretResolver`,
        code: "A2A_CREDENTIALS_MISSING",
      };
    }
    try {
      const value = await secretResolver.resolve(secretRef);
      if (typeof value === "string" && value.trim() !== "") {
        return { ok: true, apiKey: value };
      }
      return {
        ok: false,
        error: `apiKeySecretRef "${secretRef}" resolved to an empty value`,
        code: "A2A_CREDENTIALS_MISSING",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `apiKeySecretRef "${secretRef}" could not be resolved: ${message}`,
        code: "A2A_CREDENTIALS_MISSING",
      };
    }
  }
  return {
    ok: false,
    error: "A2A operator config requires apiKeyEnv or apiKeySecretRef",
    code: "A2A_CREDENTIALS_MISSING",
  };
}

/**
 * @param {A2AOperatorConfig | undefined} operatorConfig
 * @returns {{ ok: true, baseUrl: string, pollIntervalMs: number, pollTimeoutMs: number } | { ok: false, error: string, code: "A2A_CONFIG_INVALID" }}
 */
export function parseA2AOperatorConfig(operatorConfig) {
  const cfg = operatorConfig && typeof operatorConfig === "object" ? operatorConfig : {};
  const baseUrl = typeof cfg.baseUrl === "string" ? cfg.baseUrl.trim().replace(/\/$/, "") : "";
  if (!baseUrl) {
    return { ok: false, error: "A2A operator config requires baseUrl", code: "A2A_CONFIG_INVALID" };
  }
  const pollIntervalMs =
    typeof cfg.pollIntervalMs === "number" && cfg.pollIntervalMs > 0 ? cfg.pollIntervalMs : 500;
  const pollTimeoutMs =
    typeof cfg.pollTimeoutMs === "number" && cfg.pollTimeoutMs > 0 ? cfg.pollTimeoutMs : 120_000;
  return { ok: true, baseUrl, pollIntervalMs, pollTimeoutMs };
}

/**
 * @param {unknown} body
 * @returns {A2ATaskRecord}
 */
export function parseA2ATaskResponse(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("A2A response body must be a JSON object");
  }
  const record = /** @type {Record<string, unknown>} */ (body);
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const status = typeof record.status === "string" ? record.status.trim() : "";
  if (!id) {
    throw new Error("A2A response missing task id");
  }
  if (
    status !== "submitted" &&
    status !== "working" &&
    status !== "input-required" &&
    status !== "completed" &&
    status !== "failed"
  ) {
    throw new Error(`A2A response has unsupported status "${status}"`);
  }
  const output =
    record.output && typeof record.output === "object" && !Array.isArray(record.output)
      ? /** @type {Record<string, unknown>} */ ({ .../** @type {object} */ (record.output) })
      : undefined;
  const error = typeof record.error === "string" ? record.error : undefined;
  return {
    id,
    status: /** @type {A2ATaskRecord["status"]} */ (status),
    ...(output ? { output } : {}),
    ...(error ? { error } : {}),
  };
}

/**
 * Default fetch-based A2A HTTP client (POST /tasks, GET /tasks/:id).
 *
 * @implements {A2ATransport}
 */
export class HttpA2ATransport {
  /**
   * @param {{ baseUrl: string; fetchImpl?: typeof fetch }} opts
   */
  constructor(opts) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  /**
   * @param {A2ATaskSubmitRequest} req
   * @returns {Promise<A2ATaskRecord>}
   */
  async submitTask(req) {
    if (typeof this.fetchImpl !== "function") {
      throw new Error("fetch is not available; inject fetchImpl on HttpA2ATransport");
    }
    const res = await this.fetchImpl(`${this.baseUrl}/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${req.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: req.agentId,
        correlation_id: req.correlationId,
        input: req.input,
      }),
    });
    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`A2A submit HTTP ${res.status}: ${rawText.slice(0, 500)}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error("A2A submit returned non-JSON response body");
    }
    return parseA2ATaskResponse(parsed);
  }

  /**
   * @param {string} apiKey
   * @param {string} taskId
   * @returns {Promise<A2ATaskRecord>}
   */
  async getTask(apiKey, taskId) {
    if (typeof this.fetchImpl !== "function") {
      throw new Error("fetch is not available; inject fetchImpl on HttpA2ATransport");
    }
    const res = await this.fetchImpl(`${this.baseUrl}/tasks/${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`A2A poll HTTP ${res.status}: ${rawText.slice(0, 500)}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error("A2A poll returned non-JSON response body");
    }
    return parseA2ATaskResponse(parsed);
  }
}

/**
 * @param {A2ATransport} transport
 * @param {string} apiKey
 * @param {string} taskId
 * @param {number} pollIntervalMs
 * @param {number} pollTimeoutMs
 * @returns {Promise<A2ATaskRecord>}
 */
export async function pollA2ATaskUntilTerminal(transport, apiKey, taskId, pollIntervalMs, pollTimeoutMs) {
  const deadline = Date.now() + pollTimeoutMs;
  /** @type {A2ATaskRecord | undefined} */
  let latest;
  while (Date.now() <= deadline) {
    latest = await transport.getTask(apiKey, taskId);
    if (latest.status === "completed" || latest.status === "failed") {
      return latest;
    }
    if (latest.status === "input-required") {
      throw new Error(
        `A2A task "${taskId}" requires host input (input-required); use host_mediated activity mode for interactive delegates`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  const status = latest?.status ?? "unknown";
  throw new Error(`A2A task "${taskId}" did not reach a terminal status within ${pollTimeoutMs}ms (last status: ${status})`);
}

/**
 * Production delegate executor: submit A2A task, poll until completed/failed.
 *
 * @implements {import("./delegate-executor.mjs").DelegateExecutor}
 */
export class A2ADelegateExecutor {
  /**
   * @param {{
   *   operatorConfig?: A2AOperatorConfig;
   *   transport?: A2ATransport;
   *   env?: NodeJS.ProcessEnv;
   *   secretResolver?: import("../security/secret-resolver.mjs").SecretResolver;
   * }} [opts]
   */
  constructor(opts = {}) {
    this.operatorConfig = opts.operatorConfig ?? {};
    this.env = opts.env ?? process.env;
    this.secretResolver = opts.secretResolver;
    this.transport = opts.transport;
  }

  /**
   * @param {import("./delegate-executor.mjs").DelegateExecutorContext} ctx
   * @returns {Promise<import("./delegate-executor.mjs").DelegateExecutorResult>}
   */
  async executeDelegate(ctx) {
    const { executionId, node, delegateInput, protocol } = ctx;
    const delegateCorrelationId = mintDelegateCorrelationId(executionId, node.id);

    if (protocol !== "a2a") {
      return {
        ok: false,
        error: `A2ADelegateExecutor only supports protocol "a2a" (got "${protocol}")`,
        code: "DELEGATE_PROTOCOL_UNSUPPORTED",
      };
    }

    const parsedCfg = parseA2AOperatorConfig(this.operatorConfig);
    if (!parsedCfg.ok) {
      return { ok: false, error: parsedCfg.error, code: parsedCfg.code };
    }

    const keyResult = await resolveA2AApiKey(this.operatorConfig, {
      env: this.env,
      secretResolver: this.secretResolver,
    });
    if (!keyResult.ok) {
      return { ok: false, error: keyResult.error, code: keyResult.code };
    }

    const cfg =
      node.config && typeof node.config === "object"
        ? /** @type {{ agent_id?: string }} */ (node.config)
        : {};
    const agentId = typeof cfg.agent_id === "string" ? cfg.agent_id.trim() : "";
    if (!agentId) {
      return { ok: false, error: `agent_delegate "${node.id}": agent_id is required`, code: "A2A_CONFIG_INVALID" };
    }

    const transport =
      this.transport ??
      new HttpA2ATransport({
        baseUrl: parsedCfg.baseUrl,
      });

    let submitted;
    try {
      submitted = await transport.submitTask({
        apiKey: keyResult.apiKey,
        agentId,
        correlationId: delegateCorrelationId,
        input: delegateInput,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message, code: "A2A_PROVIDER_ERROR" };
    }

    const externalTaskId = submitted.id;
    let terminal = submitted;
    if (submitted.status !== "completed" && submitted.status !== "failed") {
      try {
        terminal = await pollA2ATaskUntilTerminal(
          transport,
          keyResult.apiKey,
          externalTaskId,
          parsedCfg.pollIntervalMs,
          parsedCfg.pollTimeoutMs
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message, code: "A2A_PROVIDER_ERROR" };
      }
    }

    if (terminal.status === "failed") {
      return {
        ok: false,
        error: terminal.error ?? `A2A task "${externalTaskId}" failed`,
        code: "A2A_TASK_FAILED",
      };
    }

    const output =
      terminal.output && typeof terminal.output === "object" && !Array.isArray(terminal.output)
        ? /** @type {Record<string, unknown>} */ ({ ...terminal.output })
        : { delegate_status: "completed" };

    return {
      ok: true,
      output,
      delegateCorrelationId,
      externalTaskId,
    };
  }
}
