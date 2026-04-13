# Security Policy

**Last reviewed:** 2026-04-13  
**Review cadence:** every 30 days during alpha

This repository is in public alpha. Security controls are intentionally minimal but explicit so external users can report issues responsibly.

## Supported versions

- `0.y.z` alpha baselines (current active alpha line)
- `0.y.z-alpha.N` iteration tags while they are pre-release candidates

Older pre-alpha commits and branches may not receive security fixes.

## Reporting a vulnerability

### Preferred channel (when enabled)

Use GitHub private vulnerability reporting in the repository Security tab.

Status for this repository: **pending org/repo enablement**. See `docs/security/alpha-security-baseline.md`.

### Temporary alpha disclosure path (current)

Until private vulnerability reporting is enabled:

1. Do **not** publish exploit details in a public issue or discussion.
2. Open a GitHub issue titled `security: private disclosure request` with:
   - high-level impact only
   - affected area (for example `packages/engine` or CI)
   - safe contact handle for follow-up
3. A maintainer will acknowledge within 3 business days and move discussion to a private channel.

If there is evidence of active exploitation, include `URGENT` in the issue title.

## What to include in a report

- Affected version/tag or commit
- Reproduction steps or proof-of-concept
- Impact and threat scenario
- Any known mitigations

## Disclosure process goals

- Acknowledge report within 3 business days
- Provide periodic status updates until triage is complete
- Credit reporters in release notes unless anonymous disclosure is requested

## Scope notes for alpha

Current priority is repository and release-surface risk reduction:

- source integrity
- dependency and code scanning posture
- secret handling hygiene in repository and CI

Infrastructure outside this repository may be governed at the organization level and tracked as prerequisites.
