# ADR Index and Lifecycle

This directory stores Architecture Decision Records (ADRs) for the `workflows` repository.

## Purpose

ADRs capture architecture-significant decisions with context, alternatives, and consequences so future work can reason from explicit history rather than implicit assumptions.

## Naming and numbering

- File format: `ADR-XXXX-short-kebab-title.md`
- Numbering: zero-padded and monotonic (for example `ADR-0001`, `ADR-0002`)
- Never reuse numbers, even if an ADR is later superseded.

## Status lifecycle

Allowed status values:

- `Proposed`: under discussion, not yet accepted.
- `Accepted`: approved and current.
- `Superseded`: replaced by one or more later ADRs.
- `Deprecated` (optional): still informative but no longer recommended for new work.

When superseding:

- Keep the old ADR file.
- Update old ADR status to `Superseded`.
- Link to replacement ADR(s).

## Minimum ADR template

Each ADR should include:

1. Status, date, deciders, tags.
2. Context and problem statement.
3. Decision.
4. Considered options and trade-offs (brief).
5. Consequences (positive and negative).
6. Follow-up actions and validation impacts.
7. References to RFC, scope, roadmap, and relevant implementation artifacts.

## Repository-specific guidance

- Anchor decisions to:
  - `docs/RFC/`
  - `docs/poc-scope.md`
  - `ROADMAP.md`
  - `docs/governance/spec-architecture-governance.md`
  - `docs/architecture/as-is-system-overview.md`
- For contract-impacting decisions, include required conformance/schema/test updates.
- Use ADRs to document meaningful decisions; avoid creating ADRs for trivial edits.

## Current ADRs

- `ADR-0001-poc-foundation-decisions.md`
- `ADR-0002-host-mediated-activity-execution.md`
- `ADR-0003-engine-direct-mcp-activity-execution.md`
