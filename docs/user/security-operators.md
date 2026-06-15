# Security (operators)

Condensed operator checklist for running the reference engine in alpha. Full baseline: [alpha security baseline](https://github.com/benvdbergh/workflows/blob/main/docs/security/alpha-security-baseline.md).

## Before you deploy

- [ ] Treat workflow definitions as **trusted code** — MCP stdio runs as the host OS user.
- [ ] Pin engine version in MCP config (`@agent-workflow/engine@0.1.2`), not only `@alpha`, for production-like environments.
- [ ] Never embed secrets in workflow JSON — use host secret stores and redacted config.
- [ ] Review [SECURITY.md](https://github.com/benvdbergh/workflows/blob/main/SECURITY.md) for vulnerability reporting.

## MCP adapter defaults

| Control | Value |
|---------|-------|
| Max JSON payload | 2 MiB UTF-8 per definition / input / resume |
| Transport validation | AJV on `workflow_start` and `workflow_resume` |
| Persisted event redaction | Keys matching `apiKey`, `token`, `password`, `secret` (case-insensitive) |
| Engine-direct commands | Default allowlist: `node`, `npx` basenames |

Extend engine-direct allowlist only with `WORKFLOW_ENGINE_MCP_ALLOW_COMMANDS` and documented manifest policy.

## Not in alpha

- Scoped MCP auth tokens on stdio adapter
- Cryptographic definition signing verification
- Full manifest path sandbox

Plan for these at GA (R4) if deploying beyond evaluation sandboxes.

## Incident response

Report security issues privately per [SECURITY.md](https://github.com/benvdbergh/workflows/blob/main/SECURITY.md). Do not open public issues for vulnerabilities.
