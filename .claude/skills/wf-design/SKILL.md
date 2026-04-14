---
name: wf-design
description: >-
  Guides feature, bug, and request design from intake through readiness handoff,
  using current product status and project vision alignment. Use when work needs
  design framing, options, roadmap fit checks, or a clear handoff package before
  planning and execution.
metadata:
  author: workflows project
  version: 1.0.0
---

# wf-design

Process-first design router for work entering the repository.

## Scope

- Owns design process flow and decision packaging for features, bugs, and requests.
- Uses existing project artifacts as source of truth for current state and strategic direction.
- Stays process-only and escalates deep method work to specialized user-level skills.

## Process Guardrails

- Do not implement code, author final architecture artifacts, or create delivery plans directly in this skill.
- Keep decisions traceable to repository evidence and explicit assumptions.
- Treat `ROADMAP.md` and `docs/RFC/` as primary vision and protocol constraints.
- Escalate when confidence is low, uncertainty is structural, or formal planning/specification is required.

## Workflow Routing

### 1) Intake and Current-State Discovery

Trigger phrases: "new feature request", "bug request design", "scope this ask", "what should we do next"

Actions:
- Clarify request type: feature, bug, or general request.
- Capture current behavior, affected surface, urgency, and desired outcome.
- Gather current-state signals from:
  - `ROADMAP.md` for release intent and sequencing context.
  - `docs/RFC/` for protocol constraints and non-negotiable design boundaries.
  - Relevant docs under `docs/` for existing decisions and operational context.
- Produce an intake snapshot with knowns, unknowns, assumptions, and evidence links.

### Triggered interaction
- "design this issue"
- "analyze this bug request"
- "what is current-state impact"

### 2) Problem Framing and Option Design

Trigger phrases: "frame the problem", "design options", "what approaches do we have"

Actions:
- Define problem statement with user/system impact and success criteria.
- Generate a small option set (default: 2-3 options) with trade-offs.
- Capture constraints: technical, product, governance, conformance, release timing.
- Mark each option with confidence and key open questions.
- Escalate for deep architecture method to `software-architecture` when solution structure or quality attributes dominate.

### Triggered interaction
- "propose design options"
- "what are trade-offs"
- "which option is best"

### 3) Vision and Roadmap Alignment Check

Trigger phrases: "is this aligned", "does this fit roadmap", "vision check"

Actions:
- Validate fit against `ROADMAP.md` horizons and target release intent.
- Validate compatibility with protocol scope and behavior described in `docs/RFC/`.
- Flag conflicts, sequencing gaps, and required architectural runway.
- Escalate to `product-roadmap` when prioritization, sequencing, or release placement needs deeper product strategy.

### Triggered interaction
- "is this aligned with roadmap"
- "which release should this target"
- "does this conflict with current vision"

### 4) Readiness Handoff to Planning and Execution

Trigger phrases: "ready for stories", "handoff for implementation", "plan this work"

Actions:
- Produce a complete design output contract (defined below).
- Route to `project-planning` for decomposition into epics/stories, dependency ordering, and readiness checks.
- Escalate to `specification` when a formal spec/PRD/technical plan is required for governance, cross-team alignment, or execution safety.

### Triggered interaction
- "prepare this for planning"
- "ready this for implementation"
- "create design handoff package"

## GitHub Interaction Workflows

### DesignFromIssueThread

Trigger phrases: "design from issue #", "turn this issue into design options"

Actions:
- Read issue context, labels, milestone, and project fields.
- Capture design intent and constraints in an issue comment.
- Add recommended target `Release` and `Commitment` confidence.

### DesignDecisionLogOnIssue

Trigger phrases: "log design decision", "document option rationale"

Actions:
- Post concise option comparison and selected direction on the issue.
- Record dependencies, risks, and unresolved questions.
- Link to relevant roadmap/RFC references.

### DesignReadyHandoffToPlanning

Trigger phrases: "handoff design to planning", "convert design to executable planning"

Actions:
- Confirm design output contract completeness.
- Update issue status/labels for planning readiness.
- Hand off to `project-planning` with explicit decomposition request.

## Escalation Rules

- `software-architecture`: Use when architecture alternatives, NFR trade-offs, data/API boundaries, or platform fit require deep design method.
- `product-roadmap`: Use when release intent, sequencing, business value trade-offs, or roadmap reshaping are central.
- `project-planning`: Use when design is accepted and work must be decomposed into executable backlog artifacts.
- `specification`: Use when formal specification artifacts are needed (PRD, formal spec, technical plan) before execution starts.

Detailed ownership boundaries and escalation matrix: `references/skill-escalation.md`.
Tool-level repository/project interaction rules: `references/github-tooling-guide.md`.

## Design Output Contract

Each run must hand off a structured package containing:

1. Decision log
- Problem statement, considered options, selected direction, and rationale.
- Evidence sources used (docs, roadmap, RFC references).
- Explicit assumptions and unresolved questions.

2. Acceptance constraints
- What must remain true for solution acceptance.
- In-scope and out-of-scope boundaries.
- Compliance constraints from roadmap/RFC context.

3. Dependency and risk notes
- Upstream/downstream dependencies.
- Delivery and technical risks with mitigation candidates.
- Any blocker requiring external decision or artifact.

4. Recommended target release confidence
- Suggested target release window/horizon.
- Confidence level: High, Medium, or Low.
- Confidence rationale and conditions to increase confidence.

## Minimal Execution Checklist

- Intake captured with evidence-backed current state.
- Problem framed with 2-3 options and trade-offs.
- Vision/roadmap alignment checked against `ROADMAP.md` and `docs/RFC/`.
- Required escalations identified and routed.
- Design output contract completed for planning/execution handoff.
