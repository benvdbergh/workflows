# Spec and Architecture Governance (Design-First Shift)

Last updated: 2026-04-14

## Purpose

Move from POC-era code-first execution to release-ready design-first delivery, while keeping the current repository velocity and practical constraints.

This governance defines:

- The minimum specification and architecture artifacts required before implementation.
- Decision gates for issue intake, implementation start, and merge readiness.
- Ownership and cadence so documentation stays accurate as releases advance from `R2` to `R5`.

## Why now

The POC/start-up phase intentionally optimized for speed and executable learning. For the next releases, scope breadth and compatibility risks increase (`parallel`, `wait`, `set_state`, delegation, GA contract freeze), so design clarity must be first-class.

Primary constraints and anchors:

- `docs/RFC/` is the protocol source of truth.
- `docs/poc-scope.md` is the current implementation contract boundary.
- `ROADMAP.md` defines release sequencing and runway expectations.
- Conformance and schema evolution are release gates, not optional post-work.

## Governance model

### Artifact hierarchy

1. **Vision and contract (stable anchor):**
   - `docs/RFC/`
   - `docs/poc-scope.md`
   - `ROADMAP.md`
2. **Release and planning intent (delivery anchor):**
   - GitHub issues and [Project #4](https://github.com/users/benvdbergh/projects/4) in `benvdbergh/workflows` (canonical epic/story and acceptance content)
   - `docs/releases/github-project-operating-model.md`
   - Historical epic/story markdown under `docs` (removed; not authoritative)
3. **Feature-level design decisions (execution anchor):**
   - Issue template fields + PR template traceability section.
   - ADR/design notes (location can evolve; links must be present in issue/PR).

### Lifecycle gates

- **Gate A - Intake Ready (before prioritization):**
  - Problem and value hypothesis are explicit.
  - RFC and POC-scope trace links are recorded.
  - Risk/dependency path is identified.
- **Gate B - Build Ready (before coding starts):**
  - Design artifacts linked (spec delta + architecture decision when needed).
  - Affected contract surfaces listed (schema, command/event model, API/SDK, conformance vectors).
  - Runway dependencies are linked with native GitHub relationships.
- **Gate C - Merge Ready (before PR merge):**
  - PR includes spec/architecture traceability section.
  - Doc updates exist in same PR when behavior or contract changed.
  - Validation checks pass (`validate-workflows`, `conformance`, tests).

**Engine-direct profile (R2 reference engine):** Issues that add or materially change **engine-direct** MCP execution (engine-owned MCP clients, manifest-aligned operator config, or bounded local handlers) **SHOULD** link [RFC-06 §6.1](../RFC/rfc-06-interoperability.md#61-composing-mcp) and [ADR-0003](../architecture/adr/ADR-0003-engine-direct-mcp-activity-execution.md) at Gate B, and cite concrete conformance or replay evidence at Gate C when behavior affects history or resumption. Gate mapping table: see ADR-0003 “Governance alignment.”

### Architecture view artifacts governance

Canonical diagram artifacts:

- `docs/architecture/as-built-views.drawio` - current implementation viewpoints (as-is).
- `docs/architecture/rfc-target-views.drawio` - target-state viewpoints aligned with RFC/roadmap intent.

Operating rules:

- `as-built-views.drawio` must describe only implemented behavior; deferred capabilities must be marked explicitly as deferred.
- `rfc-target-views.drawio` captures target intent and must not be used as evidence of implemented runtime behavior.
- When architecture-impacting behavior changes, update both relevant diagram file(s) and `docs/architecture/as-is-system-overview.md` in the same change set.
- If as-built and target views diverge materially, record rationale in an ADR or issue-linked decision note.

## Phase plan

### Phase 0 (now): baseline and guardrails

Objective: establish a single governance contract and minimum traceability requirements with minimal process overhead.

Implemented in this phase:

- This governance document.
- Feature and runway issue templates requiring spec/architecture inputs.
- PR template section for design-stage and spec/architecture traceability.

Expected outcome:

- Every new feature/runway item contains design references before implementation.
- Every PR can be reviewed against explicit contract intent, not inferred context.

### Phase 1 (now): operationalize in current workflow

Objective: run design-first behavior through existing GitHub operating model without adding new tooling burden.

Operating rules:

- Weekly triage verifies Gate A completeness.
- "In progress" should start only after Gate B evidence is present.
- PR review enforces Gate C for feature/runway changes.
- If scope conflicts with RFC/POC boundaries, issue is marked blocked until design update is recorded.

Implementation notes:

- Use current project fields and relationships (no additional project migration needed).
- Keep documentation lightweight; links and decisions matter more than long prose.

### Phase 2 (next): automation and quality gates

Objective: reduce manual enforcement drift.

Recommended additions:

- CI check for required PR template fields when `type:feature` or `type:runway`.
- Doc-drift checks (contract-affecting code changes require matching docs touch).
- Structured ADR index and status lifecycle (`proposed`, `accepted`, `superseded`).

## Roles and accountability

- **Maintainers/reviewers:** enforce Gate C and release compatibility posture.
- **Issue owners/authors:** provide Gate A/B evidence and keep links current.
- **Runway owners:** ensure enabling work lands before dependent slices.

If disagreement occurs, RFC + scope contract wins over implementation convenience.

## Minimal quality checklist

Use this as a quick review rubric for feature/runway work:

- Is the problem and value clear?
- Is the contract impact explicit?
- Is the architecture decision captured (when needed)?
- Are dependencies and risks linked with native relationships?
- Are docs/tests/conformance updated in the same change set?

## Non-goals

- This governance does not freeze architecture decisions permanently.
- This governance does not require heavy upfront design documents for small, low-risk changes.
- This governance does not replace RFCs, roadmap, or release governance documents.
