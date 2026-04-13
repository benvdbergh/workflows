# Contributing

**Last reviewed:** 2026-04-13

Thanks for helping improve the Agent Workflow Protocol project.

## Before you open an issue or PR

- Read `README.md` for project scope and quickstart.
- Check `docs/poc-scope.md` to confirm if a request is in or out of current POC scope.
- Search existing issues/PRs first to avoid duplicates.

## Contributor intake path

Use the correct channel so maintainers can triage quickly:

- **Bug reports:** open a GitHub issue with reproducible steps and expected/actual behavior.
- **Feature requests:** open a GitHub issue describing the use case, not only a solution.
- **Documentation improvements:** open a GitHub issue or PR directly for small, clear edits.
- **Questions/support:** use `SUPPORT.md` channels.
- **Security reports:** use `SECURITY.md` private reporting only.

## Triage labels and response expectations

Maintainers apply a lightweight taxonomy:

- Type: `type:bug`, `type:feature`, `type:docs`, `type:question`, `type:chore`
- Priority: `priority:p0`, `priority:p1`, `priority:p2`, `priority:p3`
- Status: `status:triage-needed`, `status:needs-info`, `status:accepted`, `status:blocked`, `status:in-progress`

Target first-response SLA:

- `priority:p0` (critical correctness/security risk): within 24 hours
- `priority:p1` (high impact): within 2 business days
- `priority:p2`/`priority:p3`: within 5 business days

If more information is requested (`status:needs-info`) and no reply arrives within 14 days, maintainers may close the issue until new details are provided.

Escalation for critical findings is defined in `docs/community-launch-playbook.md`.

## Pull request expectations

- Link related issues when possible.
- Keep scope focused; prefer small, reviewable PRs.
- Include tests/docs updates when behavior changes.
- Ensure required CI checks pass before requesting review.

## Alpha support boundaries

During alpha, maintainers prioritize:

- Protocol/specification correctness
- POC schema and engine behavior
- Documentation clarity and onboarding quality

Maintainers may defer:

- Broad ecosystem integrations outside current epics
- Custom environment debugging without a reproducible repo case
- Feature requests that expand beyond the current alpha scope
