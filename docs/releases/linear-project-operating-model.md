# Linear project operating model (agent-workflows)

Planning backlog for roadmap execution:

- **Linear project:** [workflows](https://linear.app/ben-van-den-bergh/project/workflows-a5eb475ff80e/overview)
- **Repository (code, RFC, conformance):** [benvdbergh/workflows](https://github.com/benvdbergh/workflows)
- **Manifest:** [`.project-planning.yaml`](../../.project-planning.yaml) (`delivery_tracker: linear`)

## Model

| Layer | Linear artifact | Planning role |
|-------|-----------------|---------------|
| Release / epic umbrella | **Project milestone** | Outcome, scope, architectural runway, exit criteria, planning posture |
| Feature / story | **Issue** under the project | Acceptance criteria, execution links, doc traceability |
| Optional task | **Sub-issue** | Finer-grained work under a story |

Issues are grouped **by milestone** (flat list per release). **GitHub source links** on migrated issues are for traceability only—Linear is the live backlog.

## What is in place

- Linear project **workflows** on team **BEN** (see project overview for status).
- Milestones (examples; list live set via MCP `list_milestones` or UI):
  - **R4 GA 1.0 - Protocol and Runtime Stabilization**
  - **R5 1.1 - Scale and Operations**
- R4–R5 open GitHub planning issues migrated into Linear with GitHub URLs preserved in descriptions.
- Repository governance for **code** unchanged:
  - `.github/ISSUE_TEMPLATE/*` — community intake (bugs, features, docs), not epic/story backlog
  - `.github/pull_request_template.md`
  - `.github/CODEOWNERS`

## Legacy GitHub Project

[GitHub Project #4](https://github.com/users/benvdbergh/projects/4) is **no longer the planning SSOT**. Do not create new roadmap epics or stories there. Historical cards may remain for reference until archived.

## Recommended Linear views

Configure in the Linear UI (names are suggestive):

1. **Roadmap by milestone** — group or filter by milestone / target date
2. **Now / Next / Later** — cycle or label-based horizon
3. **Architecture runway** — filter labels or description markers for runway items
4. **Blocked** — filter issues with blocking relations or blocked state
5. **GA readiness (R4)** — milestone = R4 GA; show commitment and blocker fields

## Operating cadence

1. **Weekly triage**
   - New stories have milestone, clear acceptance criteria, and doc links.
   - Blockers use **blocked by** relations, not prose alone.
2. **Release planning**
   - Re-score forecast/option items in milestone descriptions.
   - Confirm runway narrative per milestone (see `ROADMAP.md`).
3. **Release close**
   - Move deferred stories to the next milestone.
   - Publish release notes; link completed Linear issues and merged PRs.

## Relationship policy (source of truth)

### Planning narrative (issue descriptions)

- **Canonical epic/story content** (description, acceptance criteria, links to `docs/RFC/`, `docs/poc-scope.md`, ADRs) lives in the **Linear issue or milestone description**.
- Keep **structural** sequencing in Linear **relations**, not only in markdown checklists.

### Hierarchy

- **Milestone → issue** assignment represents epic-to-story grouping.
- **Sub-issues** represent optional tasks under a story.
- Do not treat description checklists as authoritative hierarchy when they conflict with milestone/sub-issue structure.

### Dependencies

- Use **blocks** / **blocked by** between issues for sequencing.
- Keep the graph sparse: cross-release chains and true technical blockers only.

### Operating rule

- If description text conflicts with relation or milestone metadata, **relations and milestone assignment win**.

## Agent and skill pointers

- Override policy: [`.claude/skills/wf-plan/references/workflows-linear-backlog-override.md`](../../.claude/skills/wf-plan/references/workflows-linear-backlog-override.md)
- MCP patterns: [`.claude/skills/wf-plan/references/linear-tooling-guide.md`](../../.claude/skills/wf-plan/references/linear-tooling-guide.md)
- Skills: `wf-plan`, `wf-design`, `wf-execute` under `.claude/skills/`
