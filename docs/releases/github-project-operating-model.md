# GitHub Project Operating Model (agent-workflows)

This document describes how roadmap execution is managed in:

- Project: `https://github.com/users/benvdbergh/projects/4`
- Repository: `https://github.com/benvdbergh/workflows`

## What is already implemented

- Milestones created:
  - `R2 Beta - Full Core Orchestration`
  - `R3 RC - Delegation and Composition`
  - `R4 GA 1.0 - Protocol and Runtime Stabilization`
  - `R5 1.1 - Scale and Operations`
  - `Future Prospects`
- Labels for type, release, area, confidence, and risk dimensions.
- Seed roadmap issues:
  - 1 epic + 2 feature slices + 1 runway item per release (R2-R5)
  - 1 future prospects epic
- Project custom fields:
  - `Type`, `Release`, `Horizon`, `Commitment`, `Runway`, `Area`, `Risk`, `Target Quarter`, `WSJF`, `Blocked`, `Start Date`, `Target Date`
- Repository governance templates:
  - `.github/ISSUE_TEMPLATE/*`
  - `.github/pull_request_template.md`
  - `.github/CODEOWNERS`

## Project membership

Project #4 is configured and linked to this repository. **New issues and PRs are not auto-added by CI.** Add or move cards in the GitHub Project UI (or use `gh project` with appropriate scopes) during triage.

## Manual project views to configure

GitHub does not currently expose full project-view management in `gh`, so create these in the UI:

1. `Roadmap Timeline`
   - Group by: `Release`
   - Sort: `Target Date`
2. `Now / Next / Later`
   - Board grouped by: `Horizon`
3. `Architecture Runway`
   - Filter: `Runway = Yes`
   - Group by: `Release`
4. `Risk and Blockers`
   - Filter: `Blocked = Yes` or `Risk in (High, Medium)`
5. `GA Readiness (R4)`
   - Filter: `Release = R4`
   - Show: `Commitment`, `Area`, `Blocked`, `Risk`

## Operating cadence

1. Weekly triage:
   - Ensure new items have `Type`, `Release`, and `Commitment`.
   - Mark blockers with `Blocked = Yes`.
2. Release planning cycle:
   - Re-score forecast/option items.
   - Confirm at least one runway item per release.
3. Release close:
   - Move deferred work to next milestone.
   - Publish release notes linked to completed epic/issues.

## Relationship policy (source of truth)

Use native GitHub issue relationships as the canonical structure.

### Planning narrative (issue bodies)

- **Canonical epic/story content** (description, acceptance criteria, technical notes, links to `docs/RFC/`, `docs/poc-scope.md`, ADRs) lives in the **issue body** (and issue thread as needed). This replaces former per-epic and per-story markdown under `docs` for new work.
- Keep hierarchy **metadata** in GitHub relationships, not only in prose: parent/child links are authoritative for structure.

### Hierarchy

- Use **Parent/Sub-issue** relationships for epic-to-child decomposition.
- Do not treat markdown checklists in the body as authoritative hierarchy state when they conflict with parent/child metadata.

### Dependencies

- Use native **blocked by / blocking** relationships for sequencing.
- Keep dependency graph intentionally sparse:
  - release-epic chain for cross-release sequencing
  - additional blockers only where truly required
- Avoid attaching every child issue to a blocker by default.

### Project field sync

- `Blocked` in Project #4 mirrors native dependency state:
  - `Blocked=Yes` when issue has one or more `blocked by` dependencies.
  - `Blocked=No` otherwise.
- When relationship state changes, sync project field state in the same update pass.

### Operating rule

- If body text conflicts with native relationship metadata, native relationships win.
