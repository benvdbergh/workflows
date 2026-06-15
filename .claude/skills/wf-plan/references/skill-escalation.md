# wf-plan skill escalation

## wf-plan owns

- Planning intake routing (roadmap, release slice, runway, cadence).
- Commitment vs forecast vs option labeling in planning outputs.
- **Linear planning hygiene** for this repo: milestone assignment, issue descriptions, labels, blocking relations when creating or updating backlog items (see `linear-tooling-guide.md`).

## wf-plan does not own

- Product roadmap frameworks (escalate to **`product-roadmap`**).
- INVEST-style decomposition mechanics and readiness **process** (escalate to **`project-planning`**); `wf-plan` adds **where** artifacts go in Linear and **how** to touch MCP safely.
- Branch/PR/execution close (defer to **`wf-execute`**).
- Parallel planning markdown trees under `docs` (canonical narrative is Linear per override).

## Mandatory escalation matrix

| Trigger | Escalate to | Output contract |
|---------|-------------|-----------------|
| Vision → multi-horizon roadmap shape | `product-roadmap` | Outcome-oriented roadmap with commitment tiers |
| Release slice needs version policy | `release-versioning` | SemVer / release semantics aligned to `ROADMAP.md` |
| Release slice ready to ship | `wf-release` | Preflight, tag push, postflight per governed automation |
| Runway constraints, NFR trade-offs, topology | `software-architecture` | Architecture constraints fed back into plan |
| Roadmap items must map into executable epics/stories/dependencies | `project-planning` | Decomposed work as **Linear milestones/issues** with traceability; see `workflows-linear-backlog-override.md` |

## Typical chain

`product-roadmap` → `software-architecture` → `project-planning` → `release-versioning` (when policy is in scope).
