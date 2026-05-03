# wf-plan GitHub tooling guide

## Scope

Use this guide when `wf-plan` needs to interact with:

- Project: `https://github.com/users/benvdbergh/projects/4`
- Repo: `https://github.com/benvdbergh/workflows`

Planning interactions are update-safe, traceable, and release-centric.

## Primary tools

- `gh project view`, `gh project field-list`, `gh project item-list`
  - Inspect project state, fields, and planning workload.
- `gh project item-edit`
  - Update planning fields (`Release`, `Horizon`, `Commitment`, `Runway`, `Area`, `Blocked`).
- `gh issue list`, `gh issue view`, `gh issue create`, `gh issue edit`, `gh issue comment`
  - Manage roadmap epics/features/runway items and publish planning rationale.
- `gh api`
  - Bulk and scripted milestone/issue/label operations when CLI shorthand is insufficient.

## Workflow-to-tool mapping

| Planning step | Tooling pattern | Notes |
|---|---|---|
| Inspect roadmap health | `gh project item-list` + filters | Group by release and commitment. |
| Rebalance release scope | `gh issue edit` + `gh project item-edit` | Keep milestone and project fields consistent. |
| Add planning artifacts | `gh issue create` | Use labels for type/release/area/confidence. |
| Publish cadence update | `gh issue comment` | Include changes, risks, and next checkpoint. |

## Canonical backlog (issues)

- Epic/story **narrative, acceptance criteria, and doc trace links** live in **issue bodies** (see `workflows-github-backlog-override.md`). Use `gh issue view` / `gh issue edit` / JSON export for planning reads and updates.
- Example command patterns: repository root `.project-planning.yaml`.

## Relationship policy in planning

- Use native **Parent/Sub-issue** to represent epic hierarchy.
- Use native **blocked by / blocking** for sequencing across releases.
- Treat native relationships as source of truth when they conflict with prose in the body.
- During roadmap rebalance, update both relationships and project `Blocked` state.

## Safe operating rules

1. Always inspect current issue/project state before mutating fields.
2. Keep issue milestone and project `Release` field aligned.
3. Include a short rationale note whenever commitment or release changes.
4. Prefer additive updates; do not delete planning history.
5. If uncertain about policy, escalate to `product-roadmap` or `project-planning` (planning outputs = GitHub issues for this repo).

## Minimum GitHub update contract

Use this comment structure for roadmap/planning updates on issues:

```md
Planning update
- Scope change: <none|summary>
- Release impact: <R2|R3|R4|R5|Future>
- Commitment: <Committed|Forecast|Option>
- Runway impact: <none|summary>
- Risks/blockers: <none|summary>
- Next checkpoint: <date or milestone event>
```

Required fields before closing a planning update:

- `Release` and milestone remain aligned.
- `Commitment` reflects current confidence.
- Any movement across releases includes rationale in issue comments.
