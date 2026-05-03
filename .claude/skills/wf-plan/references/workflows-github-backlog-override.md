# Workflows repository — GitHub backlog override (project-planning extension)

This file is the **repository-specific override** for the global `project-planning` skill and related planning habits. It does not replace INVEST-style decomposition, dependency thinking, or readiness checks from `project-planning`; it **redefines where those artifacts live**.

## Canonical store

| Artifact | Canonical location | Notes |
|----------|-------------------|--------|
| Epics, stories, acceptance criteria, planning narrative | **GitHub issues** in `benvdbergh/workflows` | Issue body holds description, acceptance criteria, links to RFC/`docs/poc-scope.md`/ADRs. |
| Hierarchy (epic → child work) | **Parent / Sub-issue** relationships | Issue body must not contradict parent/child metadata; if it does, relationships win per `docs/releases/github-project-operating-model.md`. |
| Sequencing blockers | **blocked by / blocking** relationships + Project `Blocked` | Keep the graph sparse. |
| Project fields (`Release`, `Horizon`, `Commitment`, …) | **GitHub Project #4** | See `wf-*` GitHub tooling guides. |
| Protocol, POC contract, as-built/target architecture | **`docs/`** (RFC, `poc-scope`, architecture drawio, ADRs) | Unchanged; issues **link** here, they do not duplicate the contract. |

## Non-canonical (legacy)

- Per-epic and per-story markdown trees that previously lived under the repository `docs` folder were **removed** after backlog migration to GitHub. Do **not** recreate them; planning content belongs in issues.
- The root `.project-planning.yaml` documents GitHub as the planning store and example `gh` patterns; it does **not** instruct agents to add parallel epic or story markdown under `docs`.

## Using `project-planning` with this override

When an agent escalates to or follows **`project-planning`** for decomposition, sequencing, or readiness:

1. Apply the **same process** (dependencies, sizing, acceptance clarity).
2. Emit results as **GitHub issues** (create/edit bodies, parent/child links, labels, project fields)—not as new planning markdown files under `docs`.
3. For traceability, include in the issue body (or a single pinned comment) explicit links to RFC sections, `docs/poc-scope.md` anchors, and ADRs as needed.

## `wf-plan`, `wf-design`, `wf-execute`

These skills **layer on top of** this override: they assume backlog inspection and updates go through **GitHub** (`gh`, Project UI, issue APIs). They remain the preferred entry points for repo-specific planning, design-on-issue, and execution hygiene.
