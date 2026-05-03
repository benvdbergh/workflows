---
name: wf-execute
description: >-
  Orchestrates execution workflow hygiene across GitHub issues, project fields,
  branch and PR linkage, progress reporting, and release-close carryover for the
  workflows repository. Reuses wf-plan GitHub mechanics (auth preflight, project
  field IDs, no repo-root scratch bodies) and execution-specific status comments.
  Use when work starts from an issue and needs consistent status transitions,
  field updates, acceptance-criteria traceability, and execution reporting through closure.
metadata:
  version: 1.3.0
---

# wf-execute

## Project override — GitHub canonical backlog

Execution threads are **GitHub issues** that carry story/epic narrative, acceptance criteria, and links to `docs/` contracts. Removed historical epic/story markdown is not authoritative. See `../wf-plan/references/workflows-github-backlog-override.md` and root `.project-planning.yaml` for `gh` patterns.

**Planning vs execution:** **`wf-plan`** owns title taxonomy, planning labels/milestones, and Project #4 setup for backlog items. **`wf-execute`** continues those conventions during implementation (do not strip `[FEATURE]` / `[RUNWAY]` / `[EPIC]` prefixes; keep milestone, `release:R*`, and Project **Release** aligned when execution changes release intent). Shared **GitHub mechanics** (auth preflight, `gh project field-list` before `item-edit`, stdin issue bodies—no repo-root scratch files, GraphQL/REST patterns): **`../wf-plan/references/github-tooling-guide.md`** (canonical). This skill’s `references/github-tooling-guide.md` adds **execution-only** sequence and comment templates.

## Purpose

Defines the project-level execution process after work items are ready for implementation. This skill coordinates issue-to-branch-to-PR flow, project board hygiene, status updates, and release-close reporting for:

- Project: `https://github.com/users/benvdbergh/projects/4`
- Repository: `https://github.com/benvdbergh/workflows`

This skill is orchestration-only. It does not replace deep planning, coding quality, release governance, or triage standards.

## Scope

### Owns

- Execution kickoff from an existing issue or accepted work item.
- Routing through branch and PR linkage conventions.
- Project field updates and status transitions during execution.
- Progress reporting cadence and release-close carryover hygiene.

### Does Not Own

- Story decomposition quality and dependency slicing.
- Code architecture, implementation standards, or refactoring strategy.
- Release version bump policy, changelog policy, or SemVer interpretation.
- Triage taxonomy design, SLA definition, or intake policy design.

Use `references/skill-escalation.md` for escalation criteria.

## Required Execution Conventions

### Core linking

- Every execution thread starts from a tracked issue in `benvdbergh/workflows`.
- Every PR must link the source issue with closing keywords in the PR body.
- Branch names should include the issue id for traceability (for example: `feat/123-short-topic`).
- Every feature/runway PR must complete the spec/architecture traceability section in `.github/pull_request_template.md`.

### Build-ready preconditions (before setting in-progress)

- Design evidence is present and aligned with `docs/governance/spec-architecture-governance.md` Gate B.
- Scope trace is explicit to relevant RFC and `docs/poc-scope.md` boundaries.
- ADR posture is explicit: link existing ADR(s) or state "ADR deferred" with rationale and follow-up owner.
- Architecture diagram evidence is current in `docs/architecture/as-built-views.drawio`; if target alignment is discussed, also reference `docs/architecture/rfc-target-views.drawio`.

### Project field concepts

Use and maintain these field concepts consistently on project `4`:

- `Type`
- `Release`
- `Horizon`
- `Commitment`
- `Runway`
- `Area`
- `Blocked`

Status and field updates should be applied at start, during active execution, when blocked/unblocked, and at close.

Before any `gh project …` mutation: **`gh auth status`**, then **`gh auth refresh -s read:project -s project`** (same preflight as `wf-plan`). Run **`gh project field-list 4 --owner benvdbergh`** before scripted **`item-edit`** so field IDs stay correct.

**Degraded mode:** If project scopes are unavailable, still post **Execution update** comments on the issue (and PR), keep **`Blocked`** narrative and native **blocked-by** relationships accurate, and leave an explicit follow-up to set Project #4 fields when auth allows—do not skip traceability.

### Acceptance criteria during execution

- Treat **acceptance criteria in the issue body** as the completion contract; link PR evidence (paths, commands, conformance output) in comments or brief body edits.
- When scope changes, update the issue body **or** record the change in an **Execution update** comment and align **labels / milestone / Project fields** with `wf-plan` release intent.
- Before requesting final review or merge, confirm each AC line is satisfied or explicitly waived with rationale on the issue thread.

## Workflow Routing

## 1) Start Execution From Issue

1. Confirm issue has clear scope and acceptance intent.
2. Confirm build-ready preconditions are satisfied (design evidence, scope trace, ADR posture).
3. Confirm project card exists in project `4`; create or link if missing.
4. Set/update fields (`Type`, `Release`, `Horizon`, `Commitment`, `Runway`, `Area`, `Blocked`) to the current execution baseline.
5. Move status to active execution state in the project workflow.
6. Create branch linked to issue id and start implementation.

Escalate to `project-planning` if issue scope is ambiguous, oversized, or missing dependency clarity; refine the **GitHub issue** (body, sub-issues, blockers)—do not add parallel planning markdown under `docs`.

### Triggered interaction
- "start work on issue #"
- "kick off implementation"
- "set this item in progress"

## 2) Branch and PR Linkage + Status Transitions

1. Keep branch singularly mapped to the issue objective.
2. Open PR early once implementation direction is stable.
3. Link issue in PR body and include closing intent.
4. Complete spec/architecture traceability details in the PR template before requesting review.
5. Transition project status from in-progress to review when PR is ready.
6. If review requests rework, return status to in-progress and continue updates.
7. On merge, ensure issue closes and project item transitions to done.

Escalate to `repo-triage-pr-ops` when review routing, labels, ownership, or PR ops conventions are unclear.

### Triggered interaction
- "open PR for issue #"
- "link this branch/PR to issue"
- "move item to review"

## 3) Project Fields + Progress Reporting

1. Update project fields whenever scope, target release, risk, or ownership changes.
2. Maintain `Blocked` as an explicit signal; do not hide blockers in comments only.
3. Post concise progress updates tied to evidence (PR, commit, test milestone, decision).
4. Report deviation early (scope growth, dependency delays, release impact).
5. Keep issue, PR, and project item narratives synchronized.

Escalate to `minimalist-coding` when implementation quality or architectural simplicity needs guidance.

### Triggered interaction
- "update project progress"
- "mark this blocked"
- "report status for this issue"

## 4) Release-Close Reporting and Carryover

1. At release cut or close window, summarize completed vs carryover work by issue.
2. Confirm each merged issue has correct `Release` and final status.
3. Move carryover items to next release context and refresh `Commitment` and `Horizon`.
4. Document blockers and runway dependencies that affected delivery.
5. Publish a short close report with done/carryover/risks/next actions.

Escalate to `release-versioning` for release policy, SemVer decisions, and changelog governance.

### Triggered interaction
- "close release execution report"
- "what carries over to next release"
- "summarize completed vs deferred"

## Escalation Rules

Always escalate by intent:

- `project-planning`: decomposition, sequencing, dependency mapping, acceptance shaping (artifacts = GitHub issues per `../wf-plan/references/workflows-github-backlog-override.md`).
- `minimalist-coding`: implementation quality, clean layering, YAGNI, maintainable change design.
- `release-versioning`: release semantics, version bump rationale, release notes/changelog policy.
- `repo-triage-pr-ops`: issue/PR ops model, routing, labels, board triage conventions.

See `references/skill-escalation.md` for ownership boundaries and handoff triggers.

Use **`../wf-plan/references/github-tooling-guide.md`** for repository/project **command order**, auth, stdin bodies, and sub-issue / `blocked_by` patterns. Use **`references/github-tooling-guide.md`** for the **execution** sequence and **Execution update** comment contract.

## Examples

- "Start execution for issue #123 and set project fields before coding."
- "Link this PR to the issue, move status to review, and post progress."
- "Prepare release-close summary and identify carryover for next release."
- "Mark this item blocked and report impact on release commitment."
