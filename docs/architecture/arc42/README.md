# arc42 — architecture baseline (as-is)

This directory contains the **[arc42](https://arc42.org/)** template applied to **this repository's current implementation**. It is optimized for:

- onboarding (where code and responsibilities live),
- baseline before new features (**where to extend**),
- alignment with **[C4 model](https://c4model.com/)** diagrams in [`../arc42-assets/diagrams/as-built-views.drawio`](../arc42-assets/diagrams/as-built-views.drawio).

**Status:** As-is baseline. Normative protocol intent remains in [`docs/RFC/`](../../RFC/); engine profile subset in [`docs/engine-profile.md`](../../engine-profile.md).

## Section index

| # | Topic | Typical C4 mapping |
|---|--------|-------------------|
| [1](./01-introduction-and-goals.md) | Introduction and Goals | *(motivation)* |
| [2](./02-constraints.md) | Constraints | *(context drivers)* |
| [3](./03-context-and-scope.md) | Context and Scope | **Level 1 — System Context** |
| [4](./04-solution-strategy.md) | Solution Strategy | *(patterns, key mechanisms)* |
| [5](./05-building-block-view.md) | Building Block View | **Level 2–3 — Containers / Components** |
| [6](./06-runtime-view.md) | Runtime View | **Behavior / dynamics** |
| [7](./07-deployment-view.md) | Deployment View | **Deployment / infra** |
| [8](./08-cross-cutting-concepts.md) | Cross-cutting Concepts | *(cross-cutting concerns)* |
| [9](./09-architecture-decisions.md) | Architecture Decisions | → [`../adr/`](../adr/) |
| [10](./10-quality-requirements.md) | Quality Requirements | *(QC, NFRs)* |
| [11](./11-risks-and-technical-debt.md) | Risks and Technical Debt | *(risk register)* |
| [12](./12-glossary.md) | Glossary | *(terms)* |

## Supporting documents

- [`../adr/README.md`](../adr/README.md) — decisions catalog.
- [`../../../ROADMAP.md`](../../../ROADMAP.md) — post-alpha release sequencing.
- **`arc42-linked assets`** (diagrams, runbooks, contracts, demos): [`../arc42-assets/README.md`](../arc42-assets/README.md)

### Evidence anchors (engineering)

| Topic | Path |
|-------|------|
| Host-mediated versus engine-direct | [`../adr/ADR-0002-host-mediated-activity-execution.md`](../adr/ADR-0002-host-mediated-activity-execution.md), [`../adr/ADR-0003-engine-direct-mcp-activity-execution.md`](../adr/ADR-0003-engine-direct-mcp-activity-execution.md) |
| Engine package surface | [`../../../packages/engine/README.md`](../../../packages/engine/README.md) |
| Profile & schema authority | [`../../engine-profile.md`](../../engine-profile.md) |
| Replay / conformance harness | [`../../../conformance/README.md`](../../../conformance/README.md) |
| RFC execution model & reference impl narratives | [`../../RFC/rfc-04-execution-model.md`](../../RFC/rfc-04-execution-model.md), [`../../RFC/rfc-08-reference-implementation.md`](../../RFC/rfc-08-reference-implementation.md) |

## Conventions used here

- **Evidence paths** are repo-relative from the repository root unless stated otherwise.
- **“Improvement candidates”** are explicit documentation or implementation gaps—not blockers unless noted under Section 11.
