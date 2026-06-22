# Alpha Repository Security Baseline

**Last reviewed:** 2026-06-04  
**Review cadence:** every 30 days while alpha is active  
**Owner:** maintainers

This document states the minimum security posture for the public alpha and distinguishes what is currently enabled in-repo versus pending org/repository controls.

## 1) Disclosure readiness

- `SECURITY.md` is present at repository root for GitHub community health discovery.
- Public disclosure guidance is explicit and includes a temporary private handoff process.
- Private vulnerability reporting via GitHub Security Advisories is **pending enablement**.

Reference: [`SECURITY.md`](../../SECURITY.md)

## 2) Dependency and code scanning posture

### Enabled now

- Workflow validation and conformance CI is active in `.github/workflows/validate-workflows.yml`.
- Manual governed release packaging path is active in `.github/workflows/release-packaging.yml` (no auto-publish, read-only permissions, package artifact only).
- `npm ci` is used in CI for lockfile-resolved dependency installs.
- **Dependabot** version updates: `.github/dependabot.yml` (npm + GitHub Actions). Enable **Dependabot alerts** and GHSA ingestion in repository settings (org-gated).
- **CodeQL** static analysis: `.github/workflows/codeql.yml` (JavaScript/TypeScript, least-privilege `security-events: write`).

### MCP transport and engine (reference package)

- **Payload size cap:** 2 MiB UTF-8 JSON per definition / input / resume_payload at MCP adapter transport (`MAX_MCP_WORKFLOW_JSON_BYTES`).
- **AJV validation** at transport before `createWorkflowApplicationPort` on `workflow_start` and `workflow_resume`.
- **Adapter error mapping:** definition validation failures on `workflow_start` return `VALIDATION_ERROR` (not `ENGINE_FAILURE`).
- **Persisted-event secret redaction:** keys `apiKey`, `token`, `password`, `secret` (case-insensitive) redacted via `RedactingExecutionHistoryStore` on all port-backed runs.
- **Engine-direct command allowlist:** default `node` / `npx` basenames; extend with `WORKFLOW_ENGINE_MCP_ALLOW_COMMANDS` — see [engine-direct-manifest-policy.md](engine-direct-manifest-policy.md).
- **Definition signing (v1):** JWS compact Ed25519 (`EdDSA`) via `verifyDefinitionSignature`; policy `WORKFLOW_ENGINE_DEFINITION_SIGNING_MODE` (`optional` default, `require` rejects unsigned). See [definition-signing-v1-profile.md](definition-signing-v1-profile.md).

### Pending (v1 / org)

- **Scoped MCP auth tokens** and action-level authZ on MCP tools (required for R4 GA per `ROADMAP.md`; not implemented in alpha — document as ADR follow-up, no token validation on stdio adapter today).
- Secret scanning and push protection (org/repo settings).
- Private GitHub Security Advisories workflow.
- Full manifest path sandbox and cryptographic **manifest** verification (definition signing v1 is implemented — see [definition-signing-v1-profile.md](definition-signing-v1-profile.md)).

## 3) Secret scanning and push protection expectations

### Baseline expectations for contributors

- Never commit secrets, tokens, private keys, or credentials to the repository.
- Use placeholder values in docs and examples.
- Treat any leaked token as compromised and rotate immediately.

### Organization/repository prerequisites

- Secret scanning must be enabled by repository administrators.
- Push protection should be enforced at org or repository level where plan/entitlements allow it.
- Admins should define bypass governance (who can bypass and with what audit trail).

Until these controls are active, maintainers rely on manual review, payload redaction defaults, and least-privilege token handling.

## 4) MCP stdio deployment risks

- **Default store:** `workflows-engine-mcp` uses in-memory history; executions are not durable across process restarts and are visible to any client on the same stdio session.
- **Shared hosts:** Multiple operators or agents attaching to one engine process share execution IDs and history unless an external store contract is introduced (SQLite-backed MCP persistence is documented as optional future work, not enabled by default).
- **Engine-direct:** Enabling `WORKFLOW_ENGINE_MCP_CONFIG` runs child MCP servers with operator-supplied credentials in the engine trust zone.

## 5) Accepted security gaps register

Accepted short-term gaps are tracked in `security-gap-register.md` with owner and trigger dates.

Link: [security-gap-register.md](security-gap-register.md)

## 6) Follow-up trigger model

Any of the following should trigger immediate re-review of this baseline:

- before each alpha baseline tag (`v0.y.z`)
- after enabling any org-level security control
- after any reported vulnerability or secret exposure event
