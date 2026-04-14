---
name: wf-execute
description: >-
  Orchestrates execution workflow hygiene across GitHub issues, project fields,
  branch and PR linkage, progress reporting, and release-close carryover for the
  workflows repository. Use when work starts from an issue and needs consistent
  status transitions, field updates, and execution reporting through closure.
metadata:
  version: 1.0.0
---

# wf-execute

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

## Workflow Routing

## 1) Start Execution From Issue

1. Confirm issue has clear scope and acceptance intent.
2. Confirm project card exists in project `4`; create or link if missing.
3. Set/update fields (`Type`, `Release`, `Horizon`, `Commitment`, `Runway`, `Area`, `Blocked`) to the current execution baseline.
4. Move status to active execution state in the project workflow.
5. Create branch linked to issue id and start implementation.

Escalate to `project-planning` if issue scope is ambiguous, oversized, or missing dependency clarity.

### Triggered interaction
- "start work on issue #"
- "kick off implementation"
- "set this item in progress"

## 2) Branch and PR Linkage + Status Transitions

1. Keep branch singularly mapped to the issue objective.
2. Open PR early once implementation direction is stable.
3. Link issue in PR body and include closing intent.
4. Transition project status from in-progress to review when PR is ready.
5. If review requests rework, return status to in-progress and continue updates.
6. On merge, ensure issue closes and project item transitions to done.

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

- `project-planning`: decomposition, sequencing, dependency mapping, acceptance shaping.
- `minimalist-coding`: implementation quality, clean layering, YAGNI, maintainable change design.
- `release-versioning`: release semantics, version bump rationale, release notes/changelog policy.
- `repo-triage-pr-ops`: issue/PR ops model, routing, labels, board triage conventions.

See `references/skill-escalation.md` for ownership boundaries and handoff triggers.
Use `references/github-tooling-guide.md` for repository and project interaction commands and update sequence.

## Examples

- "Start execution for issue #123 and set project fields before coding."
- "Link this PR to the issue, move status to review, and post progress."
- "Prepare release-close summary and identify carryover for next release."
- "Mark this item blocked and report impact on release commitment."
