# 1. Introduction and Goals

## 1.1 Requirements overview

This repository implements the **Agent Workflow Protocol** as:

1. A **normative specification** (`docs/RFC/`).
2. A **frozen POC engine profile** (`docs/poc-scope.md`) with JSON Schema (`schemas/workflow-definition-poc.json`).
3. A **reference Node.js engine** (`@agent-workflow/engine`, `packages/engine/`) with validation CLI, MCP stdio integration, deterministic graph execution with replay semantics, and optional SQLite persistence.

These arc42 sections (1–12) are the **as-is baseline** for future design increments, structured ADRs, release planning (`ROADMAP.md`), and onboarding. Normative protocol semantics remain in the RFC texts; **`docs/poc-scope.md`** is authoritative for **which** semantics the reference engine implements.

Primary **C4-style** diagram sources: [`../arc42-assets/diagrams/as-built-views.drawio`](../arc42-assets/diagrams/as-built-views.drawio) (context, deployment, building blocks); target sketches (not baseline evidence): [`../arc42-assets/archive/target-state/rfc-target-views.drawio`](../arc42-assets/archive/target-state/rfc-target-views.drawio).

Current architecture favors **deterministic replay** and a **narrow POC profile** over full RFC surface-area coverage everywhere at once.

**Primary stakeholder goals:**

| Stakeholder | Goal |
|-------------|------|
| **Protocol authors / maintainers** | Single source of truth for semantics and conformance expectations. |
| **Engine integrators** (MCP hosts, tooling) | Stable integration boundary (application port, MCP tools, error codes) and predictable replay behavior. |
| **Operators / automation** | Optional engine-directed MCP tool invocation for unattended profiles (see ADR-0003). |
| **CI / QA** | Deterministic validation and conformance vectors as release gates. |

## 1.2 Quality goals

| Priority | Goal | Notes |
|----------|------|-------|
| 1 | **Determinism / replay fidelity** | Command/event progression must reconstruct next steps from history + definition. |
| 2 | **Contract clarity** | Profile boundary in `docs/poc-scope.md`; schema rejects undefined node types (`additionalProperties: false` at workflow root—no undocumented extensions field). |
| 3 | **Integration clarity** | `createWorkflowApplicationPort` separates orchestration from transport; MCP adapter maps typed failures to stable codes. |
| 4 | **Regression safety** | Conformance harness (`conformance/`) + engine tests (`packages/engine/test/`). |

## 1.3 Out of scope for this baseline (documented explicitly elsewhere)

Deferred or non-goals **for current profile**: `agent_delegate` (R3 #6); full multi-surface SDK/REST parity; full RFC-08 breadth in conformance. **`subworkflow`** is in profile (R3 #7). Details: `docs/poc-scope.md`, `ROADMAP.md`.

## 1.4 Next-phase documentation viewpoints (evolution)

When extending the baseline, revisit C4-aligned views deliberately:

| View | Aim |
|------|-----|
| **Context** | Protocol contract, reference engine, host integrations, operator boundary |
| **Component** | Orchestrator internals versus adapter surfaces (bounded responsibilities) |
| **Runtime** | Normal execution, replay recovery, interrupt/resume |
| **Evolution** | Gap-to-roadmap mapping from shipped profile → later releases (`ROADMAP.md`) |

---

**Improvement candidate:** Maintain a single **capabilities matrix** linking goals above to conformance vectors and test files—reduces onboarding time when expanding coverage.
