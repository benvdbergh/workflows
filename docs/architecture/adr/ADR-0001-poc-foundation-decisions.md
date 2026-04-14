# ADR-0001: POC foundation decisions and delivery posture

- Status: Accepted
- Date: 2026-04-14
- Deciders: Maintainers of `workflows`
- Tags: POC, scope, delivery-model, governance

## Context

The repository started in a start-up/POC phase with two simultaneous goals:

1. Prove practical value of a vendor-neutral workflow protocol quickly.
2. Produce runnable artifacts (schema, fixtures, engine behavior, MCP adapter, conformance) that ground the RFC in executable reality.

At this stage, uncertainty was high and architecture choices needed rapid feedback from working code, not long upfront design cycles.

Primary reference constraints:

- Normative target contract: `docs/RFC/`
- Active implementation boundary: `docs/poc-scope.md`
- Release evolution path: `ROADMAP.md`

## Decision

For the POC alpha phase, the project adopts the following decision set:

1. **Ship fast with a constrained POC profile.**
   - Implement only the node and execution subsets required for demonstrable value.
   - Defer broader RFC surface areas until post-POC releases.
2. **Prefer code-first validation over design-first completeness.**
   - Use executable artifacts to validate assumptions early.
   - Capture learnings through scope notes, conformance vectors, and release notes.
3. **Anchor behavior in deterministic, testable contracts.**
   - Keep command/event history append-only.
   - Use replay/conformance as acceptance gates for behavior stability.
4. **Bias for practical interoperability over broad platform breadth.**
   - Prioritize MCP stdio path for operator and host integration.
   - Defer broader interface parity until roadmap phases (`R2+`).

## Assumptions and reasoning

### Assumptions

- Early protocol utility is better proven by a narrow but runnable profile than by broad unimplemented design.
- Interoperability credibility depends on deterministic behavior and repeatable tests, not only descriptive docs.
- Team capacity and risk posture favor incremental expansion with explicit runway rather than full-surface first delivery.

### Reasoning

- A narrow POC reduces delivery risk while preserving strategic direction.
- Code-first during high uncertainty exposes edge cases earlier (replay, resume, reducer behavior, adapter boundaries).
- Conformance and schema gates provide objective quality controls that prevent ad hoc behavior drift.

## Scope implications (as-is)

In-scope profile includes:

- `start`, `end`, `step`, `llm_call`, `tool_call`, `switch`, `interrupt`

Deferred from active runtime profile:

- `parallel`, `agent_delegate`, `subworkflow`, `wait`, `set_state`

The POC boundary is intentional and not a contradiction of RFC intent; it is a staged delivery strategy.

## Consequences

### Positive

- Faster learning loop and delivery cadence during bootstrap.
- Concrete executable baseline for future architecture and ADR work.
- Lower initial complexity while preserving forward compatibility direction.

### Negative / trade-offs

- Partial RFC coverage can be misread as target-state architecture.
- Some design debt accumulates when explicit architecture artifacts lag code.
- Additional effort is required later to formalize decisions for GA-ready governance.

## Guardrails and compensating controls

- Keep `docs/poc-scope.md` authoritative and explicit about out-of-scope elements.
- Use conformance harness and CI as non-optional quality gates.
- Require roadmap/RFC traceability in issue and PR templates.
- Maintain an as-is architecture baseline (`docs/architecture/as-is-system-overview.md`) for shared understanding.

## Exit criteria for this decision posture

This POC-first/code-first posture should be incrementally reduced when:

1. Work targets `R2+` features that expand core execution semantics.
2. Contract compatibility risk increases (schema evolution, versioning, broader adapters).
3. New feature work cannot be safely reasoned about without explicit upfront architecture decisions.

At that point, design-first governance and structured ADR sequencing become the default mode.

## Follow-up ADR candidates

- ADR for expansion strategy of deferred node types (`parallel`, `wait`, `set_state`).
- ADR for replay/checkpoint guarantees and performance boundaries.
- ADR for adapter parity strategy (MCP, REST, SDK evolution).
- ADR for compatibility and versioning policy toward GA stabilization.

## References

- `docs/poc-scope.md`
- `docs/RFC/rfc-00-overview.md`
- `docs/RFC/rfc-04-execution-model.md`
- `docs/RFC/rfc-08-reference-implementation.md`
- `ROADMAP.md`
- `docs/governance/spec-architecture-governance.md`
- `docs/architecture/as-is-system-overview.md`
