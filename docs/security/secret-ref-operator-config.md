# Secret refs in operator config

**Scope:** LLM and A2A operator config only — not workflow JSON ([RFC-07 §7.3](../RFC/rfc-07-security-model.md)).

Operator credentials for `llm_call` and `agent_delegate` (A2A) activities are supplied via host config (`WORKFLOW_ENGINE_LLM_CONFIG`, `WORKFLOW_ENGINE_A2A_CONFIG`, or programmatic bootstrap). Use **`apiKeyEnv`** for a direct environment variable name, or **`apiKeySecretRef`** for a structured secret reference resolved at activity invocation time.

## Ref format

| Prefix | Example | Resolution |
|--------|---------|------------|
| `env:` | `env:OPENAI_API_KEY` | Read `process.env.OPENAI_API_KEY` (trimmed; must be non-empty) |
| `file:` | `file:.secrets/openai-key` | Read file relative to process cwd (trimmed; must be non-empty) |

The reference engine tries providers in order: **env**, then **file**. External vault SDKs are out of scope for v1; host operators can inject secrets via env or mounted files.

## Operator config fields

**LLM** (`LlmOperatorConfig`):

```json
{
  "apiKeySecretRef": "env:OPENAI_API_KEY",
  "baseUrl": "https://api.openai.com/v1"
}
```

**A2A** (`A2AOperatorConfig`):

```json
{
  "baseUrl": "https://a2a.example",
  "apiKeySecretRef": "file:.secrets/a2a-token"
}
```

Exactly one of `apiKeyEnv` or `apiKeySecretRef` is required when credentials are needed; setting both is rejected at resolution with `LLM_CONFIG_INVALID` / `A2A_CONFIG_INVALID`.

## Persistence

Resolved secret values are used only for the outbound provider call at the activity boundary. They are **never** written to execution history. Persisted event/command payloads pass through `RedactingExecutionHistoryStore`, which redacts keys such as `apiKey`, `token`, `password`, and `secret`.

## MCP stdio bootstrap

`workflows-engine-mcp` wires a default composite resolver from `process.env` and the current working directory when constructing `LlmActivityExecutor` and `A2ADelegateExecutor`. Library integrators may inject a custom `SecretResolver` via executor options or `createDefaultSecretResolver({ env, cwd })`.
