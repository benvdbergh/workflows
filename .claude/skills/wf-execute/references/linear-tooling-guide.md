# wf-execute Linear tooling guide

## Scope

Execution hygiene for work tracked in **Linear** with code in **GitHub**:

- **Linear project:** [workflows](https://linear.app/ben-van-den-bergh/project/workflows-a5eb475ff80e/overview)
- **Repo:** `https://github.com/benvdbergh/workflows`

## Canonical mechanics (do not duplicate)

**MCP preflight**, milestone/issue reads, description updates, blocking relations, and planning comment contracts: use **[`../wf-plan/references/linear-tooling-guide.md`](../wf-plan/references/linear-tooling-guide.md)** first.

Story/epic **acceptance criteria and scope** are authoritative on the **Linear issue** (see [`../wf-plan/references/workflows-linear-backlog-override.md`](../wf-plan/references/workflows-linear-backlog-override.md)). Do not treat removed per-story markdown under `docs/` as live requirements.

## Primary tools

| Layer | Tools |
|-------|--------|
| Backlog state | Linear MCP (`get_issue`, `save_issue`, `save_comment`) or Linear UI |
| Code | `gh pr create`, `gh pr view`, `gh pr checks`, branch workflow |
| Linkage | PR URL in Linear comment; `Closes` in PR when a GitHub intake issue exists |

## Standard execution sequence

1. **Start** — `get_issue`; confirm acceptance criteria and milestone; move issue to in-progress in Linear.
2. **Implement + link** — branch naming may include Linear identifier; open PR on GitHub; paste PR URL into Linear.
3. **Review** — move Linear state to review; sync validation summary in Linear comment.
4. **Merge/close** — complete Linear issue; note release/milestone carryover if scope slipped.

## Minimum execution update contract

Use **`Execution update`** on the **Linear issue** (not the same template as **Planning update** in wf-plan).

```md
Execution update
- Current status: <in-progress|review|blocked|done>
- Linked PR: <url or pending>
- Validation status: <tests/conformance summary>
- Release impact: <none|summary>
- Blockers/dependencies: <none|summary>
- Next action: <single concrete step>
```

Required before closing an execution cycle:

- Linear issue references the merged PR when applicable.
- Blocker relations match stated status.
- Linear workflow state matches the comment.
