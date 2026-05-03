---
name: wf-plan
description: >-
  Orchestrates project-level planning, roadmap, and delivery-cadence workflows for the workflows repository by routing requests to the right specialist skills and enforcing commitment-vs-forecast clarity. Use when planning from vision, slicing releases, sequencing architectural runway, running roadmap/project cadence, or producing planning status reports.
license: MIT
metadata:
  author: workflows
  version: 1.2.0
---

# wf-plan

Process orchestration skill for planning and roadmapping in this repository. It coordinates specialized skills and keeps planning outputs consistent with repo cadence and release intent.

## Project override — GitHub canonical backlog

For **`benvdbergh/workflows`**, epics/stories, acceptance criteria, and planning narrative live in **GitHub issues** and **Project #4**, not in local planning markdown under `docs`. The global `project-planning` skill’s **file-based defaults do not apply**; its **decomposition and readiness practices** still apply when creating or editing issues. Authoritative policy: `references/workflows-github-backlog-override.md`. Example `gh` commands: root `.project-planning.yaml`.

## Scope and Positioning

- **Owns**
  - Planning intake and workflow routing for roadmap, release slices, runway, and cadence reporting.
  - Decision framing that distinguishes commitments from forecasts/options.
  - Planning synchronization across roadmap horizon, architecture runway, and execution cadence.
- **Does not own**
  - Product roadmap frameworks and prioritization methods (escalate to `product-roadmap`).
  - Epic/story decomposition and traceability mechanics (escalate to `project-planning`; **emit artifacts as GitHub issues** per `references/workflows-github-backlog-override.md`).
  - Deep technical architecture decisions and topology validation (escalate to `software-architecture`).
  - SemVer and release/version policy definition (escalate to `release-versioning`).

## Mandatory Behaviors

1. Start every planning run by clarifying objective, horizon, and decision type.
2. Mark each planned item as `commitment`, `forecast`, or `option`.
3. Surface architecture dependencies/runway before finalizing release commitments.
4. Verify commitment items have design evidence and ADR readiness (or explicit ADR deferral note).
5. Anchor planning decisions against the current architecture baseline in `docs/architecture/as-is-system-overview.md`.
6. Use `docs/architecture/as-built-views.drawio` and `docs/architecture/rfc-target-views.drawio` as canonical visual evidence for as-is vs target planning deltas.
7. End each run with a cadence-ready status view (changes, risks, next checkpoint).
8. Route to specialist skills instead of recreating their standards locally.

## Workflow Routing

| Workflow | Trigger | Route |
|----------|---------|-------|
| **RoadmapFromVision** | roadmap from vision, outcome roadmap, what should we build over horizons | Escalate to `product-roadmap` to produce outcome-oriented roadmap shape and sequencing |
| **ReleaseSliceAndConfidence** | slice release, what is committed vs forecast, release cut discussion | Use `product-roadmap` for slice options; escalate to `release-versioning` when version/release policy or bump semantics are required |
| **ArchitecturalRunwayPlan** | runway planning, enabler sequencing, technical prerequisite planning | Escalate to `software-architecture` for runway constraints and architecture trade-offs; feed results back into roadmap/release plan |
| **CadenceAndReporting** | roadmap cadence, planning review, monthly/quarterly plan status | Escalate to `project-planning` for execution-level decomposition and dependency tracking (backlog = GitHub per override doc); publish concise plan status with confidence and risk |

## GitHub Interaction Workflows

### ProjectBootstrapSync

Trigger phrases: "sync roadmap to project", "initialize roadmap project", "set up release milestones in GitHub"

Actions:
- Ensure roadmap releases map to milestones and project fields.
- Ensure release epics and runway items exist and are linked to the project.
- Verify labels reflect type/release/area/confidence dimensions.
- Validate planning artifacts are consistent with `docs/governance/spec-architecture-governance.md`.
- Publish a short "planning baseline" update comment or issue note.

### RoadmapRebalanceInProject

Trigger phrases: "move this to next release", "rebalance roadmap", "change commitment to forecast"

Actions:
- Update milestone/release assignment for impacted issues.
- Update project fields (`Release`, `Horizon`, `Commitment`, `Runway`, `Area`, `Blocked`) to match the new plan.
- Add a rationale note on the issue with risk/dependency implications.
- If a committed item lacks design artifacts or ADR posture, downgrade to forecast/option until resolved.
- Produce a delta report: what moved, why, and expected impact.

### PlanningCadenceReportFromProject

Trigger phrases: "weekly roadmap update", "planning status report", "release health snapshot"

Actions:
- Pull open items by release and commitment tier.
- Identify blockers and runway gaps by project fields/labels.
- Summarize done/in-flight/at-risk/carryover candidates.
- Publish a concise status artifact for planning review.

## Standard Orchestration Loop

1. **Intake**: capture vision/objective, timeframe, constraints, and stakeholders.
2. **Baseline check**: confirm delta against `docs/architecture/as-is-system-overview.md`, `docs/architecture/as-built-views.drawio`, `docs/architecture/rfc-target-views.drawio`, and relevant ADRs in `docs/architecture/adr/`.
3. **Classify**: select one routing workflow and identify required specialist skills.
4. **Escalate**: invoke relevant skills (`product-roadmap`, `project-planning`, `software-architecture`, `release-versioning` when needed). When `project-planning` is used, planning outputs target **GitHub issues**, not markdown under `docs` (see override doc).
5. **Consolidate**: unify outputs into one plan view with commitment/forecast labels and runway dependencies.
6. **Gate**: validate commitment items against design-first governance and ADR posture.
7. **Report**: produce cadence update (what changed, confidence trend, top risks, next decisions).

## Escalation Contract

Use `references/skill-escalation.md` for ownership boundaries and mandatory escalation paths.
Use `references/github-tooling-guide.md` for platform interaction tools, commands, and safety rules.

## Examples

**Example 1: Roadmap from vision**
User: "Turn our repo vision into a realistic 2-release roadmap."
→ Run **RoadmapFromVision**
→ Escalate to `product-roadmap`
→ Return roadmap with commitment vs forecast labels.

**Example 2: Release slicing**
User: "What can we confidently commit to in the next release?"
→ Run **ReleaseSliceAndConfidence**
→ Escalate to `product-roadmap`; if version policy questions appear, escalate to `release-versioning`
→ Return committed slice, forecast slice, and key risks.

**Example 3: Cadence report**
User: "Prepare this month's roadmap and project status."
→ Run **CadenceAndReporting**
→ Escalate to `project-planning` for execution status and dependencies (read/update GitHub backlog per override doc)
→ Include runway blockers from `software-architecture` if present.
