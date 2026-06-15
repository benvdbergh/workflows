---
name: wf-plan
description: >-
  Orchestrates project-level planning, roadmap, and delivery-cadence workflows for the workflows repository by routing requests to the right specialist skills and enforcing commitment-vs-forecast clarity. Covers Linear backlog hygiene (milestones, issues, relations) on the workflows Linear project when creating or updating planning items. Use when planning from vision, slicing releases, sequencing architectural runway, running roadmap/project cadence, or producing planning status reports.
license: MIT
metadata:
  author: workflows
  version: 1.4.0
---

# wf-plan

**Workflows-specific planning layer** for this repository: it coordinates specialist skills, keeps commitment vs forecast explicit, and adds **Linear** guardrails (milestones, issue descriptions, labels, blocking relations). It does **not** replace the global **`project-planning`** process (decomposition, INVEST, readiness)—load that for how to think; use **`wf-plan`** for where artifacts go and how to touch Linear here. For branch/PR/execution hygiene after planning hands off, defer to **`wf-execute`**.

## Project override — Linear canonical backlog

For **`benvdbergh/workflows`**, epics/stories, acceptance criteria, and planning narrative live in the **[Linear workflows project](https://linear.app/ben-van-den-bergh/project/workflows-a5eb475ff80e/overview)**, not in local planning markdown under `docs`. The global `project-planning` skill’s **file-based defaults do not apply**; with `delivery_tracker: linear` its **decomposition and readiness practices** still apply when creating or editing milestones and issues. Authoritative policy: `references/workflows-linear-backlog-override.md`. Manifest: root `.project-planning.yaml`. MCP patterns: `references/linear-tooling-guide.md`.

## Scope and Positioning

- **Owns**
  - Planning intake and workflow routing for roadmap, release slices, runway, and cadence reporting.
  - Decision framing that distinguishes commitments from forecasts/options.
  - Planning synchronization across roadmap horizon, architecture runway, and execution cadence.
- **Does not own**
  - Product roadmap frameworks and prioritization methods (escalate to `product-roadmap`).
  - Epic/story decomposition and traceability mechanics (escalate to `project-planning`; **emit artifacts as Linear milestones/issues** per `references/workflows-linear-backlog-override.md`).
  - Branch/PR linkage, CI gates, and execution-close hygiene (defer to `wf-execute`).
  - Deep technical architecture decisions and topology validation (escalate to `software-architecture`).
  - SemVer and release/version policy definition (escalate to `release-versioning`; release cut execution to `wf-release`).

## Mandatory Behaviors

1. Start every planning run by clarifying objective, horizon, and decision type.
2. Mark each planned item as `commitment`, `forecast`, or `option`.
3. Surface architecture dependencies/runway before finalizing release commitments.
4. Verify commitment items have design evidence and ADR readiness (or explicit ADR deferral note).
5. Anchor planning decisions against the current architecture baseline under `docs/architecture/arc42/` (**README**: index + evidence anchors; **Sections 3–7** story; **§6** runtime flows).
6. Use `docs/architecture/arc42-assets/diagrams/as-built-views.drawio` and `docs/architecture/arc42-assets/archive/target-state/` (target; see archive README) as canonical visual evidence for as-is vs target planning deltas.
7. End each run with a cadence-ready status view (changes, risks, next checkpoint).
8. Route to specialist skills instead of recreating their standards locally.

## Linear guardrails (benvdbergh/workflows)

### Skill layering

- **`project-planning`** (user/global): decomposition, INVEST-style shaping, dependency and readiness **process**—apply it; for this repo, **emit** to Linear milestones/issues, not to new planning trees under `docs`.
- **`wf-plan`** (this skill): **Linear project** governance—MCP preflight, milestone vs story mapping, release alignment in descriptions and labels, relation hygiene, degraded mode when Linear MCP is unavailable.
- **`wf-execute`**: branch naming, PR linkage, progress reporting, and release-close execution—**defer** there instead of duplicating execution rules.

### Preflight

- Confirm **`plugin-linear-linear`** MCP is available; run **`mcp_auth`** if tools fail with auth errors.
- **Inspect before edit:** `get_project`, `list_milestones`, `get_issue` / `list_issues` before `save_issue` or `save_milestone`.

### Title and release taxonomy

Use clear issue **titles** and express target **release** via **milestone assignment**, labels, and description sections (not a bare `[R4]` as the only signal). Align with `ROADMAP.md` release names (e.g. R4 GA, R5 scale).

| Title prefix (convention) | Role |
|---------------------------|------|
| `[EPIC]` | Release umbrella narrative (often milestone-level) |
| `[FEATURE]` | Feature slice / story |
| `[RUNWAY]` | Architecture runway enabler |
| `[RISK]` | Risk or dependency |

### Degraded mode (Linear MCP unavailable)

Still **complete** the planning record in Linear UI when possible: description, **milestone**, blocking relations, and a **Planning update** comment. If MCP is down, leave an explicit user follow-up to sync fields in Linear later. Never silently skip milestone or relation alignment when rebasing release intent.

### Expanded patterns

MCP ladder, description hygiene (no repo-root scratch files), dependencies and sub-issues: **`references/linear-tooling-guide.md`**.

## Workflow Routing

| Workflow | Trigger | Route |
|----------|---------|-------|
| **RoadmapFromVision** | roadmap from vision, outcome roadmap, what should we build over horizons | Escalate to `product-roadmap` to produce outcome-oriented roadmap shape and sequencing |
| **ReleaseSliceAndConfidence** | slice release, what is committed vs forecast, release cut discussion | Use `product-roadmap` for slice options; escalate to `release-versioning` when version/release policy or bump semantics are required |
| **ArchitecturalRunwayPlan** | runway planning, enabler sequencing, technical prerequisite planning | Escalate to `software-architecture` for runway constraints and architecture trade-offs; feed results back into roadmap/release plan |
| **CadenceAndReporting** | roadmap cadence, planning review, monthly/quarterly plan status | Escalate to `project-planning` for execution-level decomposition and dependency tracking (backlog = Linear per override doc); publish concise plan status with confidence and risk |

## Linear interaction workflows

### ProjectBootstrapSync

Trigger phrases: "sync roadmap to project", "initialize roadmap project", "set up release milestones in Linear"

Actions:
- Ensure roadmap releases map to Linear milestones and issue groupings.
- Ensure release epics and runway items exist and are linked to the workflows project.
- Verify labels reflect type/release/area/confidence dimensions where used.
- Validate planning artifacts are consistent with `docs/governance/spec-architecture-governance.md`.
- Publish a short "planning baseline" update comment on key issues or milestone descriptions.

### RoadmapRebalanceInProject

Trigger phrases: "move this to next release", "rebalance roadmap", "change commitment to forecast"

Actions:
- Update milestone assignment for impacted issues.
- Update labels and description commitment/horizon language to match the new plan.
- Add a rationale note with risk/dependency implications.
- If a committed item lacks design artifacts or ADR posture, downgrade to forecast/option until resolved.
- Produce a delta report: what moved, why, and expected impact.

### PlanningCadenceReportFromProject

Trigger phrases: "weekly roadmap update", "planning status report", "release health snapshot"

Actions:
- Pull open items by milestone and commitment tier.
- Identify blockers and runway gaps via relations and labels.
- Summarize done/in-flight/at-risk/carryover candidates.
- Publish a concise status artifact for planning review.

## Standard Orchestration Loop

1. **Intake**: capture vision/objective, timeframe, constraints, and stakeholders.
2. **Baseline check**: confirm delta against `docs/architecture/arc42/README.md` (and Sections **3–11** where relevant — especially **§6 Runtime**), `docs/architecture/arc42-assets/diagrams/as-built-views.drawio`, `docs/architecture/arc42-assets/archive/target-state/` (when target views exist), and relevant ADRs in `docs/architecture/adr/`.
3. **Classify**: select one routing workflow and identify required specialist skills.
4. **Escalate**: invoke relevant skills (`product-roadmap`, `project-planning`, `software-architecture`, `release-versioning` when needed). When `project-planning` is used, planning outputs target **Linear**, not markdown under `docs` (see override doc).
5. **Consolidate**: unify outputs into one plan view with commitment/forecast labels and runway dependencies.
6. **Gate**: validate commitment items against design-first governance and ADR posture.
7. **Report**: produce cadence update (what changed, confidence trend, top risks, next decisions).

## Escalation Contract

Use `references/skill-escalation.md` for ownership boundaries and mandatory escalation paths.
Use `references/linear-tooling-guide.md` for platform interaction tools, commands, and safety rules.

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
→ Escalate to `project-planning` for execution status and dependencies (read/update Linear backlog per override doc)
→ Include runway blockers from `software-architecture` if present.
