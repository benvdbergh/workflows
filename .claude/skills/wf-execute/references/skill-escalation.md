# wf-execute Escalation Reference

## Ownership Model

### Owns

- Execution orchestration from issue kickoff to merged/closed state.
- Cross-artifact linkage hygiene between issue, branch, PR, and project item.
- Project field maintenance for `Type`, `Release`, `Horizon`, `Commitment`, `Runway`, `Area`, `Blocked`.
- Progress and blocker reporting cadence during active execution.
- Release-close execution reporting and carryover handoff.

### Does Not Own

- Deep decomposition strategy, slicing framework, and planning dependency trees.
- Code quality framework selection, architecture decisions, and implementation style policy.
- SemVer governance, release train policy, and changelog policy design.
- Repository-level triage operating model, SLA policy, and label taxonomy governance.

## Escalation Paths

### Escalate to `project-planning`

Use when work item decomposition is not execution-ready:

- Scope is too broad or ambiguous.
- Dependencies are unclear or sequencing is missing.
- Acceptance criteria do not define executable completion.

Refine the **GitHub issue** (and sub-issues / relationships) as the planning output; do not author new per-story markdown under `docs`. See `../wf-plan/references/workflows-github-backlog-override.md`.

### Escalate to `minimalist-coding`

Use when implementation quality guidance is required:

- Proposed change is large and needs simplification.
- Layer boundaries are unclear.
- Refactor scope or architecture fit is uncertain.

### Escalate to `release-versioning`

Use when release governance decisions are required:

- Version bump type is unclear.
- Release notes/changelog policy needs interpretation.
- Carryover affects planned release semantics.

### Escalate to `repo-triage-pr-ops`

Use when issue/PR operating conventions are unclear:

- Label or milestone conventions are ambiguous.
- Review routing and ownership rules are missing.
- Intake/triage workflow conflicts with current execution path.

## Handoff Checklist

When escalating, provide:

1. Current issue and PR links.
2. Current project status and field values.
3. Specific decision needed.
4. Blocking impact on release or commitment.
