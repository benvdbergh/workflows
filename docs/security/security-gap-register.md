# Alpha Security Gap Register

**Last reviewed:** 2026-06-04

This register tracks accepted temporary security gaps for alpha, with explicit ownership and follow-up triggers.

| ID | Gap | Accepted rationale (alpha) | Owner | Follow-up trigger date | Trigger event | Status |
|---|---|---|---|---|---|---|
| SG-001 | GitHub private vulnerability reporting not enabled | `SECURITY.md` provides temporary disclosure handoff path; private advisory flow is still preferred | Maintainers + org admin | 2026-05-15 | Before next planned alpha baseline tag | Open |
| SG-002 | Dependabot config and update automation absent | Was deferred during alpha; **closed in-repo** via `.github/dependabot.yml` (alerts still require repo settings) | Maintainers | — | BEN-10 | **Closed** (2026-06-04) |
| SG-003 | Code scanning workflow not configured | Was deferred; **closed in-repo** via `.github/workflows/codeql.yml` | Maintainers | — | BEN-10 | **Closed** (2026-06-04) |
| SG-004 | Secret scanning/push protection may be org-gated and not verifiable in-repo | Expectations documented; activation requires admin entitlement/settings outside repository files | Org/repo admin + maintainers | 2026-05-15 | Org security controls review window | Open |
| SG-005 | Scoped MCP auth tokens / action-level authZ | Required for v1 GA profile per ROADMAP R4; stdio adapter has no auth today | Maintainers | R4 GA cut | ADR / implementation story after BEN-10 | Open |
| SG-006 | GHSA / Dependabot alert triage routine | Dependabot file present; org must enable alerts and maintain triage SLA | Maintainers | 2026-07-01 | First weekly Dependabot PR cycle | Open (partial — config landed BEN-10) |

## Closure rules

- A gap may be closed only after evidence is added (workflow file, setting screenshot/log, or policy confirmation in maintainer notes).
- If a trigger date is reached without closure, set a new date and record the blocker in this file.

## BEN-10 evidence (2026-06-04)

- `.github/dependabot.yml`, `.github/workflows/codeql.yml`
- MCP transport validation: `packages/engine/src/adapters/mcp/transport-validation.mjs`
- Secret redaction: `packages/engine/src/persistence/secret-redaction.mjs`, `redacting-history-store.mjs`, tests
- Engine-direct allowlist: `mcp-stdio-activity-executor.mjs`, `docs/security/engine-direct-manifest-policy.md`
- Definition signing stub: `packages/engine/src/definition-signing.mjs`
- Baseline doc refresh: `docs/security/alpha-security-baseline.md`
