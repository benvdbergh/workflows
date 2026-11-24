---
id: "06"
title: Deployment & Operations
status: proposed
owner: Engineering / Operations
last_reviewed: 2026-11-24
---

# 06 · Deployment & Operations

> **Authority:** Engineering / Operations. **AI policy:** agents propose updates via PR (`workflows/sync.md`).
> **Changes when:** environments, release process, infrastructure or operational practices change.
>
> **Sources:** [docs/governance/release-process.md](../docs/governance/release-process.md), [docs/governance/alpha-ci-cd-packaging-governance.md](../docs/governance/alpha-ci-cd-packaging-governance.md), `.github/workflows/`, [docs/security/alpha-security-baseline.md](../docs/security/alpha-security-baseline.md), operator runbooks under `docs/architecture/arc42-assets/runbooks/`.

## Environments

| Environment | URL / artifact | Deployed from | Data |
|---|---|---|---|
| Local / host-embedded | Operator machine; `npx` or clone | Published npm or workspace | Memory or local SQLite file |
| CI | GitHub Actions | PRs / pushes to `main`/`master` | Ephemeral |
| npm package | `@agent-workflow/engine`, `@agent-workflow/sdk` | Annotated `v*` tags on green `master` | N/A (library) |
| Docs (GitHub Pages) | https://benvdbergh.github.io/workflows/ | Tag release / manual docs-publish | Published static site |

No hosted multi-tenant SaaS control plane in-repo *(seen: protocol/engine packaging model; R5 later)*.

## Release process

1. Preflight via `wf-release` skill / [docs/governance/ga-release-checklist.md](../docs/governance/ga-release-checklist.md) as applicable
2. PR merges to `master` with green CI (validate-workflows, conformance, tests, CodeQL as configured)
3. Maintainer pushes annotated `v*` tag on green commit
4. `.github/workflows/release.yml`: quality gates → pack → OIDC npm publish (`--provenance`) → docs → GitHub Release
5. Break-glass: `release-packaging.yml`, `release-npm-publish.yml`, `docs-publish.yml`
6. Blueprint sync (`blueprint/workflows/sync.md`) can pick up intent drift after merges *(once scheduled)*

Details: [docs/governance/release-process.md](../docs/governance/release-process.md), [alpha-versioning-and-release-commit-flow.md](../docs/governance/alpha-versioning-and-release-commit-flow.md).

## Configuration & secrets

Names only — never values:

| Name | Where set | Used by |
|---|---|---|
| `WORKFLOW_ENGINE_MCP_CONFIG` / `--mcp-config` | Operator env / CLI | Engine-direct MCP manifest |
| `WORKFLOW_ENGINE_MCP_ALLOW_COMMANDS` | Operator env | Command allowlist extension |
| `WORKFLOW_ENGINE_DEFINITION_SIGNING_MODE` | Operator env | `optional` / `require` signing |
| `WORKFLOW_ENGINE_AUTH_TOKENS` | Operator env | Scoped Bearer auth (REST) |
| Signing keys / secret_ref material | Operator secret store | Definition verify / activity boundary |
| npm / GitHub OIDC | Actions | Publish pipeline |

See [docs/security/secret-ref-operator-config.md](../docs/security/secret-ref-operator-config.md) and [engine-direct-manifest-policy.md](../docs/security/engine-direct-manifest-policy.md).

## Observability

- **Errors:** Structured adapter error codes returned to hosts; CodeQL in CI
- **Logs:** Process stderr/stdout for stdio MCP; operator-owned aggregation
- **Uptime / alerts:** No first-party hosted uptime product; operators own process supervision *(inferred)*

## Backup & recovery

- SQLite history files: operator backup/restore; R5 calls out DR runbooks *(seen: ROADMAP)*
- Replay from append-only history is the recovery model for in-flight executions after process crash
- Broken release: stop promotion, document in [docs/releases/alpha-release-notes.md](../docs/releases/alpha-release-notes.md), deprecate npm version if needed

## Runbooks

- [docs/architecture/arc42-assets/runbooks/mcp-stdio-host-smoke.md](../docs/architecture/arc42-assets/runbooks/mcp-stdio-host-smoke.md)
- [docs/architecture/arc42-assets/runbooks/lighthouse-e2e-host-mediated.md](../docs/architecture/arc42-assets/runbooks/lighthouse-e2e-host-mediated.md)
- [docs/architecture/arc42-assets/runbooks/r3-multi-agent-delegation-e2e.md](../docs/architecture/arc42-assets/runbooks/r3-multi-agent-delegation-e2e.md)
- Demos under `docs/architecture/arc42-assets/demos/`
