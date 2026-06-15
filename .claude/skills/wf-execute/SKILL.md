---
name: wf-execute
description: >-
  Orchestrates execution workflow hygiene across Linear backlog items, GitHub PRs,
  branch linkage, progress reporting, and release-close carryover for the workflows
  repository. Reuses wf-plan Linear mechanics and execution-specific status comments.
  Use when work starts from a Linear story and needs consistent status transitions,
  acceptance-criteria traceability, and execution reporting through closure.
metadata:
  version: 1.4.0
---

# wf-execute

## Project override — Linear canonical backlog

Execution threads are **Linear issues** that carry story/epic narrative, acceptance criteria, and links to `docs/` contracts. Removed historical epic/story markdown is not authoritative. See `../wf-plan/references/workflows-linear-backlog-override.md` and root `.project-planning.yaml`.

**Planning vs execution:** **`wf-plan`** owns milestone taxonomy, planning labels, and release alignment on the Linear project. **`wf-execute`** continues those conventions during implementation (keep milestone and release language aligned when execution changes release intent). Shared **Linear mechanics**: **`../wf-plan/references/linear-tooling-guide.md`** (canonical). This skill’s `references/linear-tooling-guide.md` adds **execution-only** sequence and comment templates. **Code** still flows through **GitHub** (`gh` for PRs).

## Purpose

Defines the project-level execution process after work items are ready for implementation. This skill coordinates Linear-issue-to-branch-to-PR flow, backlog status hygiene, progress updates, and release-close reporting for:

- **Linear project:** [workflows](https://linear.app/ben-van-den-bergh/project/workflows-a5eb475ff80e/overview)
- **Repository:** `https://github.com/benvdbergh/workflows`

This skill is orchestration-only. It does not replace deep planning, coding quality, release governance, or triage standards.

## Scope

### Owns

- Execution kickoff from an existing Linear issue or accepted work item.
- Routing through branch and PR linkage conventions on GitHub.
- Linear status updates and progress reporting during execution.
- Release-close carryover hygiene.

### Does Not Own

- Story decomposition quality and dependency slicing.
- Code architecture, implementation standards, or refactoring strategy.
- Release version bump policy, changelog policy, or SemVer interpretation.
- Triage taxonomy design, SLA definition, or intake policy design.

Use `references/skill-escalation.md` for escalation criteria.

## Required Execution Conventions

### Core linking

- Every execution thread starts from a tracked **Linear issue** on the workflows project.
- Every PR must be opened on `benvdbergh/workflows` and linked from the Linear issue (URL in comment or description).
- Use closing keywords in the PR body when a **GitHub community intake issue** exists; that does not replace completing the Linear story.
- Branch names should include the Linear identifier for traceability (for example: `feat/BEN-123-short-topic`).
- Every feature/runway PR must complete the spec/architecture traceability section in `.github/pull_request_template.md`.

### Build-ready preconditions (before setting in-progress)

- Design evidence is present and aligned with `docs/governance/spec-architecture-governance.md` Gate B.
- Scope trace is explicit to relevant RFC and `docs/engine-profile.md` boundaries.
- ADR posture is explicit: link existing ADR(s) or state "ADR deferred" with rationale and follow-up owner.
- Architecture diagram evidence is current in `docs/architecture/arc42-assets/diagrams/as-built-views.drawio`; if target alignment is discussed, also reference `docs/architecture/arc42-assets/archive/target-state/` (see archive README).

### Linear state during execution

Update Linear issue state and blocking relations at start, during active execution, when blocked/unblocked, and at close. Use **`save_issue`** / UI per `linear-tooling-guide.md`.

**Degraded mode:** If Linear MCP is unavailable, still post **Execution update** comments in the Linear UI when possible, keep blocker relations accurate, and leave an explicit follow-up to sync state when MCP returns.

### Acceptance criteria during execution

- Treat **acceptance criteria in the Linear issue description** as the completion contract; link PR evidence (paths, commands, conformance output) in Linear comments.
- When scope changes, update the description **or** record the change in an **Execution update** comment and align **milestone / labels** with `wf-plan` release intent.
- Before requesting final review or merge, confirm each AC line is satisfied or explicitly waived with rationale on the Linear thread.

## Workflow Routing

## 1) Start Execution From Issue

1. Confirm Linear issue has clear scope and acceptance intent.
2. Confirm build-ready preconditions are satisfied (design evidence, scope trace, ADR posture).
3. Move Linear issue to active execution state.
4. Create branch linked to Linear identifier and start implementation.

Escalate to `project-planning` if scope is ambiguous, oversized, or missing dependency clarity; refine the **Linear issue**—do not add parallel planning markdown under `docs`.

### Triggered interaction
- "start work on Linear issue"
- "kick off implementation"
- "set this item in progress"

## 2) Branch and PR Linkage + Status Transitions

1. Keep branch singularly mapped to the issue objective.
2. Open PR early once implementation direction is stable.
3. Link PR URL in Linear; include closing intent for any linked GitHub intake issue.
4. Complete spec/architecture traceability details in the PR template before requesting review.
5. Transition Linear status from in-progress to review when PR is ready.
6. If review requests rework, return status to in-progress and continue updates.
7. On merge, complete the Linear issue and record validation evidence.

Escalate to `repo-triage-pr-ops` when review routing, labels, ownership, or PR ops conventions are unclear.

### Triggered interaction
- "open PR for this story"
- "link this branch/PR to Linear"
- "move item to review"

## 3) Progress Reporting

1. Update Linear fields whenever scope, target release, risk, or ownership changes.
2. Maintain blocking relations as an explicit signal; do not hide blockers in comments only.
3. Post concise **Execution update** comments tied to evidence (PR, commit, test milestone, decision).
4. Report deviation early (scope growth, dependency delays, release impact).
5. Keep Linear issue and PR narratives synchronized.

Escalate to `minimalist-coding` when implementation quality or architectural simplicity needs guidance.

### Triggered interaction
- "update execution progress"
- "mark this blocked"
- "report status for this issue"

## 4) Release-Close Reporting and Carryover

1. At release cut or close window, summarize completed vs carryover work by Linear issue.
2. Confirm each merged item has correct milestone and final status.
3. Move carryover items to next milestone and refresh commitment language.
4. Document blockers and runway dependencies that affected delivery.
5. Publish a short close report with done/carryover/risks/next actions.

Escalate to `release-versioning` for release policy, SemVer decisions, and changelog governance.

### Triggered interaction
- "close release execution report"
- "what carries over to next release"
- "summarize completed vs deferred"

## Escalation Rules

Always escalate by intent:

- `project-planning`: decomposition, sequencing, dependency mapping, acceptance shaping (artifacts = Linear per `../wf-plan/references/workflows-linear-backlog-override.md`).
- `minimalist-coding`: implementation quality, clean layering, YAGNI, maintainable change design.
- `release-versioning`: release semantics, version bump rationale, release notes/changelog policy.
- `repo-triage-pr-ops`: GitHub issue/PR ops model, routing, labels (community intake).

See `references/skill-escalation.md` for ownership boundaries and handoff triggers.

Use **`../wf-plan/references/linear-tooling-guide.md`** for Linear MCP patterns. Use **`references/linear-tooling-guide.md`** for the **execution** sequence and **Execution update** comment contract.

## Examples

- "Start execution for Linear issue BEN-123 and set in-progress before coding."
- "Link this PR to the Linear issue, move status to review, and post progress."
- "Prepare release-close summary and identify carryover for next release."
- "Mark this item blocked and report impact on release commitment."
