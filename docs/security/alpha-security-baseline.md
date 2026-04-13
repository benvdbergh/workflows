# Alpha Repository Security Baseline

**Last reviewed:** 2026-04-13  
**Review cadence:** every 30 days while alpha is active  
**Owner:** maintainers

This document states the minimum security posture for the public alpha and distinguishes what is currently enabled in-repo versus pending org/repository controls.

## 1) Disclosure readiness

- `SECURITY.md` is present at repository root for GitHub community health discovery.
- Public disclosure guidance is explicit and includes a temporary private handoff process.
- Private vulnerability reporting via GitHub Security Advisories is **pending enablement**.

Reference: [`SECURITY.md`](../../SECURITY.md)

## 2) Dependency and code scanning posture (enabled vs pending)

### Enabled now

- Workflow validation and conformance CI is active in `.github/workflows/validate-workflows.yml`.
- Manual governed release packaging path is active in `.github/workflows/release-packaging.yml` (no auto-publish, read-only permissions, package artifact only).
- `npm ci` is used in CI for lockfile-resolved dependency installs.

### Pending

- Dependabot alerts and automated dependency update PRs (requires `.github/dependabot.yml` and org/repo settings).
- Code scanning (CodeQL or equivalent) workflow and upload permissions.
- Security tab policy checks and alert triage routine.

## 3) Secret scanning and push protection expectations

### Baseline expectations for contributors

- Never commit secrets, tokens, private keys, or credentials to the repository.
- Use placeholder values in docs and examples.
- Treat any leaked token as compromised and rotate immediately.

### Organization/repository prerequisites

- Secret scanning must be enabled by repository administrators.
- Push protection should be enforced at org or repository level where plan/entitlements allow it.
- Admins should define bypass governance (who can bypass and with what audit trail).

Until these controls are active, maintainers rely on manual review and least-privilege token handling.

## 4) Accepted security gaps register

Accepted short-term gaps are tracked in `security-gap-register.md` with owner and trigger dates.

Link: [security-gap-register.md](security-gap-register.md)

## 5) Follow-up trigger model

Any of the following should trigger immediate re-review of this baseline:

- before each alpha baseline tag (`v0.y.z`)
- after enabling any org-level security control
- after any reported vulnerability or secret exposure event
