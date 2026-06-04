# wf-plan Linear tooling guide

## Scope

Use this guide when `wf-plan` needs to read or update the **planning backlog** for `benvdbergh/workflows`:

- **Linear project:** [workflows](https://linear.app/ben-van-den-bergh/project/workflows-a5eb475ff80e/overview) (`project_id` in root `.project-planning.yaml`)
- **MCP server (Cursor):** `plugin-linear-linear` — authenticate with `mcp_auth` if tools are unavailable
- **Repo (code + contracts):** `https://github.com/benvdbergh/workflows`

Community **bugs**, **security**, and **contributor intake** still use GitHub issues per `CONTRIBUTING.md`; this guide is for **epics, stories, runway, and release planning** only.

## Concept mapping (project-planning)

| Planning concept | Linear | Notes |
|------------------|--------|--------|
| Epic | **Project milestone** | One milestone per epic / release umbrella |
| Story | **Issue** | Assigned to a milestone |
| Task | **Sub-issue** | Optional under a story |
| `depends_on` | **blocks** / **blocked by** relations | Sparse graph |
| Requirements SSOT | Repo `docs/`, RFC, ADRs | Link in descriptions |

Global reference: `project-planning` skill → `references/linear-adoption.md`.

## MCP preflight

1. Confirm Linear MCP is connected (`plugin-linear-linear` in Cursor).
2. If tools fail with auth errors, run **`mcp_auth`** for that server, then retry.
3. **Read tool schemas** under the MCP descriptors before mutating (field names vary by tool version).
4. Prefer **inspect before edit**: `get_project`, `list_milestones`, `list_issues`, `get_issue` before `save_issue` / `save_milestone`.

## Ordered tooling ladder

| Step | Tool intent | When |
|------|-------------|------|
| 1 | `get_project`, `list_milestones`, `list_issues` | Roadmap health, cadence reports |
| 2 | `get_issue`, `get_milestone` | Read acceptance criteria and posture |
| 3 | `save_milestone` | Create or update epic-level milestone narrative |
| 4 | `save_issue` | Create or update stories (description, milestone, labels, state) |
| 5 | Issue relations via `save_issue` / relation APIs in schema | Blocking dependencies after issues exist |

Use the **Linear UI** for bulk view edits or when MCP parameters are unclear.

## Workflow-to-tool mapping

| Planning step | Tooling pattern | Notes |
|---------------|-----------------|-------|
| Inspect roadmap health | `list_issues` filtered by project; group by milestone | Cadence and rebalance |
| Rebalance release scope | `save_issue` milestone + description update | Keep milestone narrative aligned with moved stories |
| Add planning artifacts | `save_milestone` / `save_issue` | Put AC and doc links in description |
| Publish cadence update | `save_comment` on key issues or project update | Changes, risks, next checkpoint |

## Canonical backlog (issues)

- Epic/story **narrative, acceptance criteria, and doc trace links** live in **Linear descriptions** (see `workflows-linear-backlog-override.md`).
- Manifest and project URL: repository root `.project-planning.yaml`.
- Operating model (milestones, labels, cadence): `docs/releases/linear-project-operating-model.md`.

## Descriptions without repo-root scratch files

Avoid saving draft planning bodies as untracked files **under the repository root**. Prefer:

- Editing directly in Linear UI, or
- MCP `save_issue` / `save_milestone` with description text composed in the agent session, or
- A temp path **outside the clone** if a file draft is needed before paste.

## Dependencies and hierarchy

- **Epic → story:** assign the issue to the correct **milestone** (and project).
- **Story → task:** optional **sub-issue** under the parent story.
- **Sequencing:** `blocks` / `blocked by` between issues—do not rely on prose alone.
- If description text conflicts with relation metadata, **relations win** (same rule as the former GitHub operating model).

## Safe operating rules

1. Always inspect current milestone/issue state before mutating.
2. Keep release intent consistent: milestone assignment, issue labels, and description “Release impact” sections.
3. Include a short rationale comment when commitment or release assignment changes.
4. Prefer additive updates; do not delete planning history.
5. Escalate to `product-roadmap` or `project-planning` for decomposition process; **emit** backlog changes in Linear for this repo.

## Minimum planning update contract

Post a **Planning update** as a Linear comment (or structured description append) when rebasing scope:

```md
Planning update
- Scope change: <none|summary>
- Release impact: <R4|R5|Future|…>
- Commitment: <Committed|Forecast|Option>
- Runway impact: <none|summary>
- Risks/blockers: <none|summary>
- Next checkpoint: <date or milestone event>
```

Required before closing a planning rebalance:

- Stories sit on the intended **milestone**.
- **Commitment** language in description matches actual posture.
- Cross-release moves include rationale in a comment.

## GitHub (code only)

- **PRs and branches** still use `gh` against `benvdbergh/workflows`.
- Link PRs in Linear issue descriptions or comments; use `Closes` / `Fixes` in PR body when a GitHub issue exists for community intake—not as a substitute for Linear story state.
