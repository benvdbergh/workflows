# Alpha Community Launch Playbook

**Last reviewed:** 2026-04-13  
**Review cadence:** every 30 days during alpha

Purpose: launch alpha publicly with focused channels, clear calls-to-action, and bounded maintainer operations so incoming feedback remains actionable.

## Launch goals

- Drive high-quality feedback on protocol clarity, POC scope, and engine usability.
- Convert early external interest into structured issues and docs improvements.
- Avoid maintainer overload via explicit intake rules, support boundaries, and SLA targets.

## Priority channel rollout

Use a phased rollout; do not post to all channels at once.

1. **Primary: GitHub repository release/readme update**
   - Audience: users already evaluating the repository.
   - CTA: read alpha release notes and submit structured issues.
2. **Secondary: LinkedIn announcement**
   - Audience: architecture/AI engineering professionals.
   - CTA: review quickstart and share implementation feedback.
3. **Secondary: X (Twitter) short launch thread**
   - Audience: broader OSS and agent ecosystem.
   - CTA: point to docs plus one concrete feedback prompt.
4. **Targeted community forums (curated, low-volume)**
   - Audience: workflow/orchestration and standards communities.
   - CTA: ask for critique on interoperability and execution semantics.

## Message variants and templates

### Variant A: Problem/solution launch post

Template:

> We are sharing an alpha of the Agent Workflow Protocol: a vendor-neutral way to define and run stateful agent workflows with deterministic replay and MCP-compatible tool integration.  
>  
> Start here: `README.md` + `docs/releases/alpha-release-notes.md`  
>  
> Looking for feedback on:  
> 1) workflow definition clarity, 2) replay semantics, 3) conformance usability.  
>  
> Please file feedback using the contributor intake path in `CONTRIBUTING.md`.

### Variant B: Technical deep-dive prompt

Template:

> Alpha deep-dive request: we are validating the POC execution contract and conformance harness for multi-step agent orchestration.  
>  
> If you evaluate it, please share:  
> - one area that is underspecified,  
> - one compatibility risk with your stack,  
> - one high-value next improvement.  
>  
> Routing and support boundaries: `SUPPORT.md`.

### Variant C: Contributor-focused onboarding prompt

Template:

> We are opening alpha feedback for the Agent Workflow Protocol repository.  
>  
> Best contributions right now:  
> - docs clarity fixes,  
> - reproducible bug reports,  
> - conformance fixture proposals aligned to `docs/poc-scope.md`.  
>  
> Use `CONTRIBUTING.md` for issue labels, SLAs, and escalation rules.

## Call-to-action (CTA) standards

Every launch message should include:

- One clear destination URL (repo root or release notes)
- One explicit ask (bug report, docs feedback, interoperability critique)
- One routing instruction (`CONTRIBUTING.md` and `SUPPORT.md`)
- One scope boundary reminder (alpha, best-effort support)

## Feedback triage loop

### Label taxonomy

- Type: `type:bug`, `type:feature`, `type:docs`, `type:question`, `type:chore`
- Priority: `priority:p0`, `priority:p1`, `priority:p2`, `priority:p3`
- Status: `status:triage-needed`, `status:needs-info`, `status:accepted`, `status:blocked`, `status:in-progress`

### Response expectations

- Initial acknowledgment:
  - `priority:p0`: within 24 hours
  - `priority:p1`: within 2 business days
  - `priority:p2`/`priority:p3`: within 5 business days
- `status:needs-info` auto-close expectation: 14 days without reporter reply.

### Escalation path for critical findings

1. Maintainer tags issue `priority:p0` and `status:triage-needed`.
2. If security-related, redirect to `SECURITY.md` and remove sensitive public details.
3. Open/track a mitigation task in the current epic/story backlog.
4. Post an ETA/status note within 24 hours, then provide daily updates until risk is contained or downgraded.

## Maintainer capacity boundaries (alpha)

- Maintainers prioritize correctness, reproducibility, and documentation quality over feature breadth.
- Only reproducible issues with clear steps are guaranteed triage within SLA targets.
- Out-of-scope and duplicate requests are closed with rationale and references.
- No commitment to private support, synchronous support, or custom consulting during alpha.

## Operational checklist for launch day

- Ensure `README.md`, `CONTRIBUTING.md`, `SUPPORT.md`, and `SECURITY.md` links are valid.
- Confirm label set exists in GitHub repository settings.
- Confirm issue forms/templates and Discussion settings (if used) are configured.
- Publish channel posts in priority order and monitor feedback intake for the first 72 hours.
