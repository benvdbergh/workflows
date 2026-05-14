# wf-plan GitHub tooling guide

## Scope

Use this guide when `wf-plan` needs to interact with:

- Project: `https://github.com/users/benvdbergh/projects/4`
- Repo: `https://github.com/benvdbergh/workflows`

Planning interactions are update-safe, traceable, and release-centric.

There is **no** repository Actions workflow that auto-adds issues or PRs to Project #4; triage adds cards and updates fields (UI or `gh project` with the right scopes).

## Auth preflight

1. Run `gh auth status` before any mutating or read-heavy `gh` session. Fix login or token gaps before scripting.
2. **Before any `gh project` command** (view, field-list, item-list, item-add, item-edit), refresh project scopes so item mutations do not fail mid-run:

   ```bash
   gh auth refresh -s read:project -s project
   ```

## Ordered tooling ladder (prefer `gh` first)

Use tools in this order unless a step explicitly requires a lower layer:

| Step | Tool | When to escalate |
|------|------|-------------------|
| 1 | `gh issue …`, `gh project …` | Default for listing, viewing, creating, editing issues and project items. |
| 2 | `gh api` with REST paths | Issue **dependencies** (`blocked_by`), bulk JSON, or endpoints without stable `gh issue`/`gh project` shorthands. |
| 3 | `gh api graphql` | **Sub-issues** (parent/child) and other operations only exposed on GraphQL (e.g. `addSubIssue`). |

**Prefer `gh` subcommands** for day-to-day planning: they track API shape and reduce foot-guns. Use **`gh api`** when the REST contract is documented but not wrapped (dependencies, custom filters), or **`gh api graphql`** when there is no REST equivalent.

## Project fields: inspect before edit

Project #4 field **IDs differ by project**. Before `gh project item-edit`:

1. `gh project field-list 4 --owner benvdbergh` — capture `ID` (and allowed values for single-select fields).
2. `gh project item-list 4 --owner benvdbergh --format json` (or `view`) — locate the item `id` for the issue you are updating.
3. Run `gh project item-edit` with those IDs.

Skipping `field-list` often causes wrong field references or failed edits.

## Primary tools

- `gh project view`, `gh project field-list`, `gh project item-list`
  - Inspect project state, fields, and planning workload.
- `gh project item-edit`
  - Update planning fields (`Release`, `Horizon`, `Commitment`, `Runway`, `Area`, `Blocked`).
- `gh issue list`, `gh issue view`, `gh issue create`, `gh issue edit`, `gh issue comment`
  - Manage roadmap epics/features/runway items and publish planning rationale.
- `gh api`
  - REST issue dependencies, scripted milestone/label/issue operations, and other cases from the ladder above.

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

## Issue bodies without repo-root scratch files

Avoid `--body-file body.md` (or any scratch path) **under the repository root**: agents and watchers may pick up untracked files as noise or commit hazards. Prefer:

- **stdin** (no temp file), **here-doc / here-string** (bash / PowerShell), **`--body`** for short text, or a path **outside the repo** (e.g. user temp) if a file is required.
- Optional: unfilled placeholders in tracked templates under `.claude/skills/wf-plan/` (if the skill ships them) — copy content into stdin or a temp path outside the repo before substituting secrets or final text.

**Bash — create issue from stdin**

```bash
gh issue create --repo benvdbergh/workflows --title "[FEATURE] Example" --body-file - <<'EOF'
## Summary
…
EOF
```

**Bash — here-doc as variable then pipe**

```bash
body=$(cat <<'EOF'
## Acceptance criteria
- …
EOF
)
printf '%s' "$body" | gh issue edit 123 --repo benvdbergh/workflows --body-file -
```

**PowerShell — here-string piped to stdin**

```powershell
$body = @'
## Summary
…
'@
$body | gh issue create --repo benvdbergh/workflows --title "[EPIC] Example" --body-file -
```

**PowerShell — temp file outside repo**

```powershell
$p = Join-Path $env:TEMP "wf-issue-body.md"
Set-Content -Path $p -Value $body -Encoding utf8
gh issue edit 123 --repo benvdbergh/workflows --body-file $p
Remove-Item $p
```

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

## Appendix A: Sub-issues (GraphQL `addSubIssue`)

Native parent/child links are not always available as a stable `gh issue` subcommand on every `gh` version. When automation is required, use **GraphQL** `addSubIssue` (see GitHub GraphQL reference for the current `AddSubIssueInput` fields).

Typical flow:

1. Resolve **global node IDs** for parent and child issues (GraphQL `id`, not the public issue number). `gh issue view N --json id` often exposes the node id suitable for GraphQL; confirm with your `gh` version.
2. Call `gh api graphql` with mutation `addSubIssue` and variables matching the schema.

Prefer the GitHub UI for one-off hierarchy if GraphQL variables are error-prone.

## Appendix B: `blocked_by` (REST)

Add a **blocked-by** dependency with the REST API (body parameter **`issue_id`** = database id of the **blocking** issue). Resolve that id from the **issue number** of the blocker:

```bash
REPO=benvdbergh/workflows
PARENT=100   # issue that is blocked
BLOCKER=42   # issue that blocks PARENT
BLOCKER_ID=$(gh api "repos/${REPO}/issues/${BLOCKER}" --jq .id)
gh api --method POST "repos/${REPO}/issues/${PARENT}/dependencies/blocked_by" \
  -f issue_id="$BLOCKER_ID"
```

Official reference: [REST API endpoints for issue dependencies](https://docs.github.com/en/rest/issues/issue-dependencies).

Use **`gh api`** here; `gh issue` does not replace this endpoint.
