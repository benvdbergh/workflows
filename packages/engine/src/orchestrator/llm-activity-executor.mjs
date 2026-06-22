/**
 * Engine-direct LLM activity executor for `llm_call` nodes (OpenAI-compatible chat completions).
 *
 * Credentials and provider endpoints come from operator config (env / secret refs), not workflow JSON (RFC-07 §7.3).
 */

import Ajv2020 from "ajv/dist/2020.js";

/** @typedef {"LLM_CONFIG_INVALID" | "LLM_CREDENTIALS_MISSING" | "LLM_PROVIDER_ERROR" | "LLM_OUTPUT_VALIDATION_FAILED" | "ACTIVITY_EXECUTOR_UNSUPPORTED_NODE"} LlmActivityErrorCode */

/**
 * Minimal operator-side LLM credentials (not stored in workflow documents).
 *
 * @typedef {object} LlmOperatorConfig
 * @property {string} [apiKeyEnv] Env var name holding the provider API key.
 * @property {string} [apiKeySecretRef] Secret ref (`env:VAR` or `file:path`); resolved at invocation via {@link SecretResolver}.
 * @property {string} [baseUrl] OpenAI-compatible API base URL (default `https://api.openai.com/v1`).
 */

/**
 * @typedef {object} LlmChatMessage
 * @property {"system" | "user" | "assistant"} role
 * @property {string} content
 */

/**
 * @typedef {object} LlmChatCompletionRequest
 * @property {string} apiKey
 * @property {string} model
 * @property {LlmChatMessage[]} messages
 * @property {{ type: "json_object" } | undefined} [responseFormat]
 */

/**
 * @typedef {object} LlmChatCompletionResponse
 * @property {string} content Raw assistant message content.
 */

/**
 * Injectable LLM transport (mock in tests; default uses fetch against OpenAI-compatible APIs).
 *
 * @typedef {object} LlmProvider
 * @property {(req: LlmChatCompletionRequest) => Promise<LlmChatCompletionResponse>} chatCompletion
 */

/**
 * @param {LlmOperatorConfig | undefined} operatorConfig
 * @param {{ env?: NodeJS.ProcessEnv; secretResolver?: import("../security/secret-resolver.mjs").SecretResolver }} [options]
 * @returns {Promise<{ ok: true, apiKey: string } | { ok: false, error: string, code: "LLM_CREDENTIALS_MISSING" }>}
 */
export async function resolveLlmApiKey(operatorConfig, options = {}) {
  const env = options.env ?? process.env;
  const secretResolver = options.secretResolver;
  const cfg = operatorConfig && typeof operatorConfig === "object" ? operatorConfig : {};
  const apiKeyEnv = typeof cfg.apiKeyEnv === "string" ? cfg.apiKeyEnv.trim() : "";
  if (apiKeyEnv) {
    const value = env[apiKeyEnv];
    if (typeof value === "string" && value.trim() !== "") {
      return { ok: true, apiKey: value };
    }
    return {
      ok: false,
      error: `LLM API key env var "${apiKeyEnv}" is unset or empty`,
      code: "LLM_CREDENTIALS_MISSING",
    };
  }
  const secretRef = typeof cfg.apiKeySecretRef === "string" ? cfg.apiKeySecretRef.trim() : "";
  if (secretRef) {
    if (!secretResolver) {
      return {
        ok: false,
        error: `apiKeySecretRef "${secretRef}" requires a secretResolver`,
        code: "LLM_CREDENTIALS_MISSING",
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
        code: "LLM_CREDENTIALS_MISSING",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `apiKeySecretRef "${secretRef}" could not be resolved: ${message}`,
        code: "LLM_CREDENTIALS_MISSING",
      };
    }
  }
  return {
    ok: false,
    error: "LLM operator config requires apiKeyEnv or apiKeySecretRef",
    code: "LLM_CREDENTIALS_MISSING",
  };
}

/**
 * @param {unknown} cfg
 * @returns {{ ok: true, config: { model: string; systemPrompt?: string; userPrompt?: string; outputSchema?: object } } | { ok: false, error: string, code: "LLM_CONFIG_INVALID" }}
 */
export function parseLlmCallNodeConfig(cfg) {
  const raw = cfg && typeof cfg === "object" && !Array.isArray(cfg) ? /** @type {Record<string, unknown>} */ (cfg) : {};
  const model = typeof raw.model === "string" ? raw.model.trim() : "";
  if (!model) {
    return { ok: false, error: "llm_call node requires config.model (non-empty string)", code: "LLM_CONFIG_INVALID" };
  }
  const systemPrompt = typeof raw.system_prompt === "string" ? raw.system_prompt : undefined;
  const userFromUser = typeof raw.user_prompt === "string" ? raw.user_prompt : undefined;
  const userFromPrompt = typeof raw.prompt === "string" ? raw.prompt : undefined;
  const userPrompt = userFromUser ?? userFromPrompt;
  if (raw.system_prompt !== undefined && typeof raw.system_prompt !== "string") {
    return { ok: false, error: "llm_call config.system_prompt must be a string when present", code: "LLM_CONFIG_INVALID" };
  }
  if (raw.user_prompt !== undefined && typeof raw.user_prompt !== "string") {
    return { ok: false, error: "llm_call config.user_prompt must be a string when present", code: "LLM_CONFIG_INVALID" };
  }
  if (raw.prompt !== undefined && typeof raw.prompt !== "string") {
    return { ok: false, error: "llm_call config.prompt must be a string when present", code: "LLM_CONFIG_INVALID" };
  }
  let outputSchema;
  if (raw.output_schema !== undefined) {
    if (!raw.output_schema || typeof raw.output_schema !== "object" || Array.isArray(raw.output_schema)) {
      return { ok: false, error: "llm_call config.output_schema must be a JSON Schema object when present", code: "LLM_CONFIG_INVALID" };
    }
    outputSchema = /** @type {object} */ ({ .../** @type {object} */ (raw.output_schema) });
  }
  return {
    ok: true,
    config: {
      model,
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
      ...(userPrompt !== undefined ? { userPrompt } : {}),
      ...(outputSchema !== undefined ? { outputSchema } : {}),
    },
  };
}

/**
 * @param {string} content
 * @returns {Record<string, unknown> | { text: string }}
 */
export function parseLlmAssistantContent(content) {
  const trimmed = content.trim();
  if (!trimmed) return { text: "" };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return /** @type {Record<string, unknown>} */ ({ ...parsed });
    }
  } catch {
    // fall through to text wrapper
  }
  return { text: content };
}

/**
 * @param {unknown} output
 * @param {object | undefined} outputSchema
 * @returns {{ ok: true, output: Record<string, unknown> } | { ok: false, error: string, code: "LLM_OUTPUT_VALIDATION_FAILED" }}
 */
export function validateLlmStructuredOutput(output, outputSchema) {
  if (!outputSchema) {
    const record =
      output && typeof output === "object" && !Array.isArray(output)
        ? /** @type {Record<string, unknown>} */ ({ .../** @type {object} */ (output) })
        : { value: output };
    return { ok: true, output: record };
  }
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(outputSchema);
  const valid = validate(output);
  if (!valid) {
    const detail = (validate.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`)
      .join("; ");
    return {
      ok: false,
      error: `LLM output failed output_schema validation: ${detail || "invalid"}`,
      code: "LLM_OUTPUT_VALIDATION_FAILED",
    };
  }
  return {
    ok: true,
    output: /** @type {Record<string, unknown>} */ ({ .../** @type {object} */ (output) }),
  };
}

/**
 * @param {Record<string, unknown>} state
 * @param {{ systemPrompt?: string; userPrompt?: string }} prompts
 * @returns {LlmChatMessage[]}
 */
export function buildLlmChatMessages(state, prompts) {
  /** @type {LlmChatMessage[]} */
  const messages = [];
  if (prompts.systemPrompt) {
    messages.push({ role: "system", content: prompts.systemPrompt });
  }
  const userContent =
    prompts.userPrompt ??
    (Object.keys(state).length > 0 ? JSON.stringify(state) : "Respond according to the system instructions.");
  messages.push({ role: "user", content: userContent });
  return messages;
}

/**
 * Default fetch-based OpenAI-compatible chat completions client.
 *
 * @implements {LlmProvider}
 */
export class OpenAiCompatibleLlmProvider {
  /**
   * @param {{ baseUrl?: string; fetchImpl?: typeof fetch }} [opts]
   */
  constructor(opts = {}) {
    this.baseUrl = (opts.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  /**
   * @param {LlmChatCompletionRequest} req
   * @returns {Promise<LlmChatCompletionResponse>}
   */
  async chatCompletion(req) {
    if (typeof this.fetchImpl !== "function") {
      throw new Error("fetch is not available; inject fetchImpl on OpenAiCompatibleLlmProvider");
    }
    const body = {
      model: req.model,
      messages: req.messages,
      ...(req.responseFormat ? { response_format: req.responseFormat } : {}),
    };
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${req.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`LLM provider HTTP ${res.status}: ${rawText.slice(0, 500)}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error("LLM provider returned non-JSON response body");
    }
    const content = parsed?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("LLM provider response missing choices[0].message.content");
    }
    return { content };
  }
}

/**
 * ActivityExecutor for `llm_call` nodes via an injectable {@link LlmProvider}.
 *
 * @implements {import("./activity-executor.mjs").ActivityExecutor}
 */
export class LlmActivityExecutor {
  /**
   * @param {{
   *   operatorConfig?: LlmOperatorConfig;
   *   provider?: LlmProvider;
   *   env?: NodeJS.ProcessEnv;
   *   secretResolver?: import("../security/secret-resolver.mjs").SecretResolver;
   * }} [opts]
   */
  constructor(opts = {}) {
    this.operatorConfig = opts.operatorConfig ?? {};
    this.env = opts.env ?? process.env;
    this.secretResolver = opts.secretResolver;
    this.provider =
      opts.provider ??
      new OpenAiCompatibleLlmProvider({
        baseUrl: this.operatorConfig.baseUrl,
      });
  }

  /**
   * @param {import("./activity-executor.mjs").ActivityExecutorContext} ctx
   * @returns {Promise<import("./activity-executor.mjs").ActivityExecutorResult>}
   */
  async executeActivity(ctx) {
    const { node, state } = ctx;
    if (node.type !== "llm_call") {
      return {
        ok: false,
        error: `LlmActivityExecutor only supports llm_call nodes (got ${node.type})`,
        code: "ACTIVITY_EXECUTOR_UNSUPPORTED_NODE",
      };
    }
    const parsedCfg = parseLlmCallNodeConfig(node.config);
    if (!parsedCfg.ok) {
      return { ok: false, error: parsedCfg.error, code: parsedCfg.code };
    }
    const keyResult = await resolveLlmApiKey(this.operatorConfig, {
      env: this.env,
      secretResolver: this.secretResolver,
    });
    if (!keyResult.ok) {
      return { ok: false, error: keyResult.error, code: keyResult.code };
    }
    const { model, systemPrompt, userPrompt, outputSchema } = parsedCfg.config;
    const messages = buildLlmChatMessages(state, { systemPrompt, userPrompt });
    let providerResponse;
    try {
      providerResponse = await this.provider.chatCompletion({
        apiKey: keyResult.apiKey,
        model,
        messages,
        ...(outputSchema ? { responseFormat: { type: "json_object" } } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message, code: "LLM_PROVIDER_ERROR" };
    }
    let parsedOutput;
    if (outputSchema) {
      try {
        parsedOutput = JSON.parse(providerResponse.content.trim());
      } catch {
        return {
          ok: false,
          error: "LLM provider returned content that is not valid JSON (required when output_schema is set)",
          code: "LLM_OUTPUT_VALIDATION_FAILED",
        };
      }
    } else {
      parsedOutput = parseLlmAssistantContent(providerResponse.content);
    }
    const validated = validateLlmStructuredOutput(parsedOutput, outputSchema);
    if (!validated.ok) {
      return { ok: false, error: validated.error, code: validated.code };
    }
    return { ok: true, output: validated.output };
  }
}
