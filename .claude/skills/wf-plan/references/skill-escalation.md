# wf-plan skill escalation

## Owns

- Project-level planning orchestration for the `workflows` repository.
- Routing intake to the correct specialist planning/architecture/versioning skills.
- Commitment-vs-forecast labeling and consolidation across roadmap/release/cadence views.
- Cadence-ready reporting format (status, risk, confidence trend, next decisions).
- **GitHub planning hygiene** for this repo: issue titles/labels/milestones, Project #4 planning fields, parent/sub-issue and blocked-by relationships when creating or updating backlog items (see `github-tooling-guide.md`).

## Does Not Own

- Product strategy frameworks, prioritization formulas, and roadmap design mechanics.
- INVEST-style decomposition mechanics and readiness **process** (escalate to **`project-planning`**); `wf-plan` adds **where** artifacts go in GitHub and **how** to touch the API safely.
- Branch/PR linkage, execution status, merge hygiene, and release-close carryover (escalate to **`wf-execute`**).
- Parallel planning markdown trees under `docs` (canonical narrative is GitHub issues per override).
- Deep architecture design, trade-off analysis, and technical topology selection.
- SemVer policy, changelog rules, version bump governance, and release automation policy.

## Escalation Paths

| Situation | Escalate To | Expected Return |
|-----------|-------------|-----------------|
| Vision must become a structured roadmap | `product-roadmap` | Outcome-oriented roadmap and sequencing rationale |
| Release content must be sliced and confidence-ranked | `product-roadmap` | Committed vs forecast slices with rationale |
| Release/version policy, bump semantics, or governance is needed | `release-versioning` | Version/release policy decision and release governance artifacts |
| Architecture enablers or runway constraints affect plan timing | `software-architecture` | Runway dependencies, risks, and architecture constraints |
| Roadmap items must map into executable epics/stories/dependencies | `project-planning` | Decomposed work as **GitHub issues** (bodies + relationships) with traceability and dependency ordering; see `workflows-github-backlog-override.md` |

## Routing Rules

1. Escalate when best-practice depth is requested for roadmap, planning, architecture, or release policy.
2. Do not rewrite standards owned by specialist skills; reference and compose their outputs.
3. If multiple domains are active, sequence escalation as:
   `product-roadmap` -> `software-architecture` -> `project-planning` -> `release-versioning` (when policy is in scope).
4. Return one unified planning view after escalations with explicit `commitment`, `forecast`, and `option` labels.
