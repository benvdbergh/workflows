# wf-design escalation boundaries

## Owns

- Intake normalization for feature, bug, and request design work.
- Current-state discovery and evidence capture from roadmap and RFC context.
- Problem framing and option set definition (including trade-off summaries).
- Alignment check workflow against `ROADMAP.md` and `docs/RFC/`.
- Readiness handoff package using the design output contract.

## Does Not Own

- Deep architecture analysis or architecture decision documentation as a final deliverable.
- Product portfolio strategy, multi-release prioritization, or roadmap rebalancing as final authority.
- Backlog decomposition into full epics/stories and delivery sequencing as final planning artifact.
- Formal spec/PRD/technical plan authoring when governance requires formal documents.
- Code implementation, testing, or release operations.

## Escalation Paths

### Escalate to `software-architecture`

When:
- Option trade-offs are dominated by architecture or NFR concerns.
- API, data boundary, integration topology, or structural design choices are unresolved.
- Cross-cutting quality attributes (reliability, performance, operability, security) drive decision risk.

Expected return:
- Architecture recommendation set, rationale, and constraints to feed the design decision log.

### Escalate to `product-roadmap`

When:
- Candidate work affects release sequencing, prioritization, or horizon allocation.
- Design value depends on roadmap strategy, timing, or runway investments.
- Multiple viable options require product-level trade-off resolution.

Expected return:
- Recommended release positioning and prioritization rationale for confidence scoring.

### Escalate to `project-planning`

When:
- Design direction is accepted and implementation planning should begin.
- Dependencies, milestones, and story slicing need executable backlog artifacts.
- Team readiness and sequencing details must be produced for execution.

Expected return:
- Planning-ready decomposition and dependency-aware execution path.

### Escalate to `specification`

When:
- A formal specification, PRD, or technical plan is required.
- Stakeholder alignment or governance gates require explicit sign-off documents.
- Ambiguity remains high enough that execution without formal spec is unsafe.

Expected return:
- Formalized artifact(s) suitable for governance review and execution handoff.
