# Alpha Security Gap Register

**Last reviewed:** 2026-04-13 

This register tracks accepted temporary security gaps for alpha, with explicit ownership and follow-up triggers.

| ID | Gap | Accepted rationale (alpha) | Owner | Follow-up trigger date | Trigger event |
|---|---|---|---|---|---|
| SG-001 | GitHub private vulnerability reporting not enabled | `SECURITY.md` provides temporary disclosure handoff path; private advisory flow is still preferred | Maintainers + org admin | 2026-05-15 | Before next planned alpha baseline tag |
| SG-002 | Dependabot config and update automation absent | Dependency set is small and reviewed manually during alpha; automation is deferred to CI/CD hardening story | Maintainers | 2026-05-15 | Start of STORY-7-4 implementation |
| SG-003 | Code scanning workflow not configured | Current focus is baseline docs readiness and release narrative; code scanning will be added with governed CI pipeline | Maintainers | 2026-05-15 | Start of STORY-7-4 implementation |
| SG-004 | Secret scanning/push protection may be org-gated and not verifiable in-repo | Expectations documented; activation requires admin entitlement/settings outside repository files | Org/repo admin + maintainers | 2026-05-15 | Org security controls review window |

## Closure rules

- A gap may be closed only after evidence is added (workflow file, setting screenshot/log, or policy confirmation in maintainer notes).
- If a trigger date is reached without closure, set a new date and record the blocker in this file.
