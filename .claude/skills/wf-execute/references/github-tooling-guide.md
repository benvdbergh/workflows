# wf-execute GitHub tooling guide

## Scope

Execution interactions for:

- Project: `https://github.com/users/benvdbergh/projects/4`
- Repo: `https://github.com/benvdbergh/workflows`

This guide covers the issue → branch → PR → project status lifecycle.

## Canonical mechanics (do not duplicate)

**Auth preflight**, **ordered tooling ladder** (`gh` → REST `gh api` → GraphQL), **stdin / here-doc issue bodies** (no `--body-file` scratch under the repo root), **`gh project field-list` before `item-edit`**, and **Appendix A/B** (sub-issues, `blocked_by`): use **`../wf-plan/references/github-tooling-guide.md`** as the single source of truth. Follow that document first; then apply the execution sequence below.

There is **no** repository Actions workflow that auto-adds issues or PRs to Project #4; triage adds cards and updates fields (UI or `gh project` with the right scopes).

Story/epic **acceptance criteria and scope** are authoritative on the **GitHub issue** (see `../wf-plan/references/workflows-github-backlog-override.md`). Do not treat removed per-story markdown as live requirements.

## Primary tools

- `gh issue view`, `gh issue edit`, `gh issue comment`
  - Inspect/update execution source issue and status notes.
- `gh pr create`, `gh pr view`, `gh pr edit`, `gh pr checks`
  - Create and track PRs linked to issue execution.
- `gh project item-list`, `gh project item-edit`
  - Update project status and execution fields.
- `gh api`
  - Bulk updates or field operations not covered by shorthand commands.

## Standard execution sequence

0. **Preflight** — Per wf-plan guide: `gh auth status`; before `gh project …`, `gh auth refresh -s read:project -s project`; resolve project field IDs with `gh project field-list 4 --owner benvdbergh` before `item-edit`.

1. **Start**
   - Verify issue scope and acceptance intent.
   - Set project status to in-progress and `Blocked=No`.
2. **Implement + link**
   - Create branch containing issue id.
   - Open PR with closing keyword (`Closes #<id>`).
3. **Review transition**
   - Move project status to review state.
   - Keep progress comment synced between issue and PR.
4. **Merge/close**
   - Confirm issue closure and project status done.
   - Update `Release`/`Commitment` if execution changed original plan.

## Workflow-to-tool mapping

| Execution step | Tooling pattern | Notes |
|---|---|---|
| Begin issue execution | `gh issue view` + `gh project item-edit` | Validate baseline fields before coding. |
| Link PR to issue | `gh pr create` with `Closes #id` | Keep one main issue objective per PR. |
| Report progress | `gh issue comment` / `gh pr comment` | Add evidence-based updates, not generic notes. |
| Handle blockers | `gh project item-edit` + issue comment | Set `Blocked=Yes` and explain dependency/risk. |
| Close and carryover | `gh project item-edit` + milestone update | Move deferred items explicitly to next release. |

## Relationship policy in execution

- Do not model hierarchy in execution comments; use native **Parent/Sub-issue**.
- When execution discovers a new upstream dependency, add native `blocked by` relationship.
- Set project `Blocked` to match relationship state, not narrative text.
- Keep blocker graph minimal and explicit; remove obsolete blocker links when resolved.

## Safe operating rules

1. Never change execution fields without checking current project item state.
2. Keep issue labels, milestone, and project fields coherent.
3. Use explicit blocker state instead of hidden/implicit delays.
4. Always leave an auditable note for major status or release changes.
5. Escalate to specialist skills when outside ownership boundaries.

## Minimum GitHub update contract

Use **`Execution update`** on issues or PRs during implementation. Planners use **`Planning update`** (see wf-plan `github-tooling-guide.md`); do not conflate the two—execution threads need evidence and next actions, not release slicing debates.

Use this comment structure for execution updates on issues or PRs:

```md
Execution update
- Current status: <in-progress|review|blocked|done>
- Linked PR: <url or pending>
- Validation status: <tests/conformance summary>
- Release impact: <none|summary>
- Blockers/dependencies: <none|summary>
- Next action: <single concrete step>
```

Required fields before closing an execution update:

- Issue and PR remain cross-linked.
- Project `Blocked` field matches stated blocker status.
- Status transition is reflected in project workflow state.
