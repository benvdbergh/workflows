# wf-design GitHub tooling guide

## Scope

Design interactions for:

- Project: `https://github.com/users/benvdbergh/projects/4`
- Repo: `https://github.com/benvdbergh/workflows`

This guide focuses on issue-centric design discovery, decision logging, and handoff readiness.

## Primary tools

- `gh issue view`, `gh issue comment`, `gh issue edit`
  - Read request context, log design decisions, and tune labels/milestones when design changes target scope.
- `gh project item-list`, `gh project item-edit`
  - Read/update `Release`, `Commitment`, `Area`, `Runway`, `Blocked` based on design outcomes.
- `gh api`
  - Scripted lookups/updates when bulk or field-specific operations are needed.

## Workflow-to-tool mapping

| Design step | Tooling pattern | Notes |
|---|---|---|
| Intake from issue | `gh issue view` + `gh project item-list` | Confirm current state before proposing options. |
| Decision capture | `gh issue comment` | Log options, trade-offs, selected direction, and confidence. |
| Alignment update | `gh project item-edit` | Reflect recommended release/confidence changes. |
| Planning handoff | `gh issue comment` + label/milestone update | Mark design readiness and handoff request. |

## Relationship policy in design

- Design decomposition should be reflected as native **Parent/Sub-issue** links.
- Proposed design blockers must be added as native `blocked by` relationships when accepted.
- Issue body design notes summarize rationale; relationships encode structure and dependency truth.
- After dependency updates, ensure project `Blocked` state is aligned.

## Safe operating rules

1. Never propose release/commitment changes without rationale on the issue.
2. Keep design notes traceable to `ROADMAP.md` and `docs/RFC/` constraints.
3. If confidence is low, record unknowns and required escalations explicitly.
4. Update project fields only after decision log is posted.
5. Escalate to specialist skills for deep architecture, planning, or formal spec work.

## Minimum GitHub update contract

Use this comment structure for design updates on issues:

```md
Design update
- Problem framing: <1-2 lines>
- Options considered: <count + short summary>
- Selected direction: <summary or pending>
- Release recommendation: <R2|R3|R4|R5|Future + confidence>
- Risks/dependencies: <none|summary>
- Handoff readiness: <ready for planning|needs escalation>
```

Required fields before closing a design update:

- Decision rationale is logged on the issue.
- Release/confidence recommendation is explicit.
- Required escalations and open questions are listed.
