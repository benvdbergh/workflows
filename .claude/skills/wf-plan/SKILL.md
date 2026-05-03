---
name: wf-plan
description: >-
  Orchestrates project-level planning, roadmap, and delivery-cadence workflows for the workflows repository by routing requests to the right specialist skills and enforcing commitment-vs-forecast clarity. Covers GitHub issue and Project #4 hygiene when creating or updating benvdbergh/workflows backlog items. Use when planning from vision, slicing releases, sequencing architectural runway, running roadmap/project cadence, or producing planning status reports.
license: MIT
metadata:
  author: workflows
  version: 1.3.0
---

# wf-plan

**Workflows-specific planning layer** for this repository: it coordinates specialist skills, keeps commitment vs forecast explicit, and adds **GitHub + Project #4** guardrails (titles, labels, milestones, relationships, project fields). It does **not** replace the global **`project-planning`** process (decomposition, INVEST, readiness)—load that for how to think; use **`wf-plan`** for where artifacts go and how to touch GitHub here. For branch/PR/execution hygiene after planning hands off, defer to **`wf-execute`**.

## Project override — GitHub canonical backlog

For **`benvdbergh/workflows`**, epics/stories, acceptance criteria, and planning narrative live in **GitHub issues** and **Project #4**, not in local planning markdown under `docs`. The global `project-planning` skill’s **file-based defaults do not apply**; its **decomposition and readiness practices** still apply when creating or editing issues. Authoritative policy: `references/workflows-github-backlog-override.md`. Example `gh` commands: root `.project-planning.yaml`. Expanded command patterns: `references/github-tooling-guide.md`.

## Scope and Positioning

- **Owns**
  - Planning intake and workflow routing for roadmap, release slices, runway, and cadence reporting.
  - Decision framing that distinguishes commitments from forecasts/options.
  - Planning synchronization across roadmap horizon, architecture runway, and execution cadence.
- **Does not own**
  - Product roadmap frameworks and prioritization methods (escalate to `product-roadmap`).
  - Epic/story decomposition and traceability mechanics (escalate to `project-planning`; **emit artifacts as GitHub issues** per `references/workflows-github-backlog-override.md`).
  - Branch/PR linkage, CI gates, and execution-close hygiene (defer to `wf-execute`).
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

## GitHub guardrails (benvdbergh/workflows)

### Skill layering

- **`project-planning`** (user/global): decomposition, INVEST-style shaping, dependency and readiness **process**—apply it; for this repo, **emit** to GitHub issues/relationships, not to new planning trees under `docs`.
- **`wf-plan`** (this skill): **GitHub + Project #4** governance for `benvdbergh/workflows`—auth/tooling order, title taxonomy, milestone vs project `Release` alignment, relationship hygiene, degraded mode when the board is unreachable.
- **`wf-execute`**: branch naming, PR linkage, progress reporting, and release-close execution—**defer** there instead of duplicating execution rules.

### Preflight

- Run **`gh auth status`** before scripted or multi-step GitHub work.
- Before **any** `gh project …` command, run **`gh auth refresh -s read:project -s project`** so project reads/writes do not fail mid-session.

### Title and release taxonomy

Align issue **titles** with `.github/ISSUE_TEMPLATE` prefixes. Do **not** use a bare **`[R2]`** (or similar) as the **title type**; express target **release** with **milestone**, label **`release:R*`** (e.g. `release:R2`), and the Project **Release** field.

| Title prefix | Template / role | Typical type labels |
|--------------|-----------------|---------------------|
| `[EPIC]` | Epic | `type:epic` |
| `[FEATURE]` | Feature slice | `type:feature` |
| `[RUNWAY]` | Architecture runway enabler | `type:enabler`, `type:runway` |
| `[RISK]` | Risk or dependency | `type:risk` |

### Degraded mode (Project #4 or scopes unavailable)

Still **complete** the issue track: body, labels, **milestone**, parent/sub-issue and **blocked-by** relationships, and a short rationale **comment**. **Defer** Project board field updates with an **explicit** user follow-up (which fields to set on Project #4 and why). Never silently skip milestone/relationship alignment when rebasing release intent.

### Expanded patterns

Command ladder, stdin/here-string issue bodies (no repo-root scratch files), **`gh project field-list` before `item-edit`**, and REST/GraphQL notes for dependencies and sub-issues: **`references/github-tooling-guide.md`**.

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
