# Architecture documentation

This folder holds **as-is** and **target** architecture artifacts for the Agent Workflow Protocol reference implementation.

## Primary entry points
| Artifact | Purpose |
|----------|---------|
| [**arc42 baseline**](./arc42/README.md) | Full **[arc42](https://arc42.org/)** documentation structure (sections 1–12) describing the **current** system—use this when placing new features or onboarding. Runtime/deployment storyline: **Sections 3–7** (especially **§6 Runtime**). |
| [**arc42-linked assets**](./arc42-assets/README.md) | Supplementary diagrams, demos, operator runbooks, integration contracts (`contracts/`) — organized **by artifact type**, not twelve parallel section folders. |
| [ADR index](./adr/README.md) | Recorded architecture decisions (**ADR-0001** onward). |

## Where things live now

| Former path | New location (repo-relative from root) |
|-------------|----------------------------------------|
| `docs/architecture/as-is-system-overview.md` _(legacy)_ | Narrative folded into **`docs/architecture/arc42/`**. Start at **[arc42/README.md](./arc42/README.md)**; runtime-heavy content lives in **[06-runtime-view.md](./arc42/06-runtime-view.md)**. |
| `docs/architecture/as-built-views.drawio` | [`docs/architecture/arc42-assets/diagrams/as-built-views.drawio`](./arc42-assets/diagrams/as-built-views.drawio) |
| `docs/architecture/rfc-target-views.drawio` | [**Archived** `./arc42-assets/archive/target-state/`](./arc42-assets/archive/target-state/) (placeholder; see archive README) |
| Runbooks (`mcp-stdio-*`, …), lighthouse walkthroughs, operator manifest prose | [`arc42-assets/runbooks/`](./arc42-assets/README.md), [`arc42-assets/demos/`](./arc42-assets/README.md), [`arc42-assets/contracts/`](./arc42-assets/README.md) (see [`arc42-assets/README`](./arc42-assets/README.md)). |

## Diagrams (C4-style views)

| File | Contents |
|------|----------|
| [`arc42-assets/diagrams/as-built-views.drawio`](./arc42-assets/diagrams/as-built-views.drawio) | **As-is** context, deployment, building blocks (`AS-IS Context`, `AS-IS Deployment`, `AS-IS Building Block View`). |
| [`arc42-assets/archive/target-state/`](./arc42-assets/archive/target-state/) | **Target-state** sketches (placeholder — not as-is baseline; see archive README). |

Diagram pages map to arc42 roughly as follows: **context** → arc42 Section 3, **deployment** → Section 7, **building blocks/components** → Section 5.

## Runbooks / operator docs

- [`arc42-assets/runbooks/mcp-stdio-host-smoke.md`](./arc42-assets/runbooks/mcp-stdio-host-smoke.md)
- [`arc42-assets/contracts/mcp-operator-manifest.md`](./arc42-assets/contracts/mcp-operator-manifest.md)

**Improvement gap (documentation):** Keep **one** authoritative module-to-feature map maintained from `packages/engine/src/` (either expand arc42 Section 5 tables or generate from `packages/engine/README.md` + tests).