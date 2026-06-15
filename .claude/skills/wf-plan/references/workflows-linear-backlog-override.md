# Workflows repository — Linear backlog override (project-planning extension)

This file is the **repository-specific override** for the global `project-planning` skill and related planning habits. It does not replace INVEST-style decomposition, dependency thinking, or readiness checks from `project-planning`; it **redefines where those artifacts live**.

Do **not** draft long planning narratives as untracked files under the repository root (accidental-commit risk). Compose acceptance criteria and trace links in **Linear issue descriptions** (via MCP `save_issue` or the Linear UI).

## Canonical store

| Artifact | Canonical location | Notes |
|----------|-------------------|--------|
| **Epics** (release umbrellas, runway themes) | **Linear project milestones** on [workflows](https://linear.app/ben-van-den-bergh/project/workflows-a5eb475ff80e/overview) | Milestone description holds outcome, scope, runway, exit criteria, planning posture. |
| **Stories** (feature slices, executable work) | **Linear issues** on that project | Issue description holds acceptance criteria, technical notes, links to `docs/RFC/`, `docs/engine-profile.md`, ADRs. |
| **Optional tasks** | **Linear sub-issues** | Under the parent story issue when needed. |
| **Sequencing blockers** | Issue relations (`blocks` / `blocked by`) | Keep the graph sparse—real blockers only. |
| **Release / horizon / commitment** | Milestone assignment + issue labels / project fields | See `.claude/skills/wf-plan/references/linear-project-operating-model.md`. |
| **Protocol, engine profile contract, architecture** | **`docs/`** (RFC, `engine-profile`, arc42, ADRs) | Unchanged; Linear items **link** here—they do not duplicate the contract. |
| **Community bugs / security / small intake** | **GitHub issues** on `benvdbergh/workflows` | Not the planning backlog; see `CONTRIBUTING.md` / `SUPPORT.md`. |

### Traceability from GitHub migration

Migrated issues may include **GitHub source links** in the Linear description. Treat those as historical pointers; **update and close work in Linear**. New planning items are created in Linear only—no parallel GitHub epic/story issues for the same work.

## Non-canonical (legacy)

- Per-epic and per-story markdown trees under `docs/` were **removed** after earlier backlog migrations. Do **not** recreate them.
- [GitHub Project #4](https://github.com/users/benvdbergh/projects/4) is **legacy** for planning; do not add new roadmap epics/stories there.
- Root `.project-planning.yaml` documents Linear as the planning store; it does **not** instruct agents to add parallel epic/story markdown under `docs`.

## Using `project-planning` with this override

When an agent escalates to or follows **`project-planning`** for decomposition, sequencing, or readiness:

1. Apply the **same process** (dependencies, sizing, acceptance clarity).
2. Emit results as **Linear milestones and issues** (MCP `plugin-linear-linear` per `references/linear-tooling-guide.md` and the global `project-planning` skill’s `references/linear-adoption.md`)—not as markdown under `docs` and not as new GitHub planning issues.
3. For traceability, include in the issue description explicit links to RFC sections, `docs/engine-profile.md` anchors, ADRs, and `ROADMAP.md` release intent as needed.

## `wf-plan`, `wf-design`, `wf-execute`

These skills **layer on top of** this override: they assume backlog inspection and updates go through **Linear** (MCP or UI). They remain the preferred entry points for repo-specific planning, design-on-issue, and execution hygiene (branch/PR linkage still uses GitHub for code).
