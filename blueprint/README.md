# Blueprint

The product's agreed intent: **what** we build and **why**. The code, tests and contracts show what we actually built. The instructions in [`workflows/`](workflows/) let an agent keep the two in line.

Normative protocol, engine profile, schema, arc42, and ADRs remain the technical SSOT under `docs/` and `schemas/` — this folder **links** to them; it does not replace them.

Architecture decisions currently live at [`docs/architecture/adr/`](../docs/architecture/adr/) (not under `blueprint/decisions/` yet).

| # | Document | Authority |
|---|---|---|
| 00 | [Product Core](00-product-core.md) | Product owner. Agents never edit it; they propose changes in an issue or PR description. |
| 01 | [Product](01-product.md) | Product management |
| 02 | [UX & Design](02-ux-design.md) | UX / Product |
| 03 | [Domain & Data](03-domain-data.md) | Architecture |
| 04 | [Architecture & Technology](04-architecture.md) | Architecture |
| 05 | [Interfaces & Integrations](05-interfaces.md) | API / Engineering |
| 06 | [Deployment & Operations](06-deployment.md) | Engineering / Operations |
| 07 | [Roadmap & Delivery](07-roadmap.md) | Product management |

Folders that appear when they're first needed:

| Folder | Contains | ID |
|---|---|---|
| `features/` | One spec per feature, with acceptance criteria ([format](workflows/define-feature.md)) | `FEAT-001`, criteria `AC-001.1` |
| `decisions/` | Architecture decision records | `ADR-0001` |
| `deviations/` | Known differences between blueprint and code that the team accepts for now | `DEV-001` |
| `prototypes/` | UX prototypes or links to them, named after the feature | `FEAT-001-…` |

## Which document covers what

Where to look when code changes in **this** repository.

| Code | Document |
|---|---|
| Workflow JSON Schema (`schemas/`), engine profile (`docs/engine-profile.md`), history/persistence (`packages/engine/src/persistence/`), domain glossary | 03 Domain & Data |
| Dependencies and packages (`package.json`, `packages/engine/`, `packages/sdk/`), orchestrator modules (`packages/engine/src/orchestrator/`), arc42 (`docs/architecture/arc42/`) | 04 Architecture |
| MCP/REST adapters (`packages/engine/src/mcp-stdio-server.mjs`, `rest-server.mjs`, `adapters/`), OpenAPI (`packages/engine/openapi/`), application port | 05 Interfaces |
| CI and release (`.github/workflows/`), governance (`docs/governance/`), operator runbooks (`docs/architecture/arc42-assets/runbooks/`) | 06 Deployment |
| Capability surface of the engine/protocol (node types, control plane, conformance) | 01 Product |
| UI routes / components | 02 UX & Design (thin — no first-party app UI) |
| A feature's behaviour | its spec in `features/`, and 07 Roadmap when it ships |
| RFC / whitepaper / published user docs | Normative or end-user SSOT outside blueprint (`docs/RFC/`, `docs/user/`, `website/`) — cite from 00/01, do not migrate |

## Conventions

1. **Front matter** on every document: `id`, `title`, `status`, `owner`, `last_reviewed`.
2. **Status:** `draft → proposed → approved` (`deprecated` when retired). Features also go `in-progress → implemented`. Agents propose; owners approve. A document or feature that is `approved` keeps its requirements until its owner changes them.
3. **IDs are permanent.** Never renumber or reuse them. Every ID you mention should exist.
4. **Describe intent, link to the truth.** Don't copy the schema, the OpenAPI spec or token values into prose. Link to the file and explain what it means.
5. **One term per concept.** Use the glossary in 03. Words in its *Avoid* column are synonyms to stay away from.
6. **Bump `last_reviewed`** when you've checked that a document still matches the code, even if you changed nothing.

ADR (`decisions/ADR-nnnn-<name>.md`) — optional future home; **current ADRs:** `docs/architecture/adr/`:

```markdown
---
id: ADR-nnnn
title: <decision in a few words>
status: proposed        # proposed → accepted | rejected; later superseded (set superseded_by) or deprecated
date: <yyyy-mm-dd>
---
## Context
## Decision
## Alternatives considered
## Consequences
```

Deviation (`deviations/DEV-nnn-<name>.md`), when the code is meant to differ from the blueprint for now:

```markdown
---
id: DEV-nnn
title: <what differs>
status: open            # open → accepted (intentional) → resolved (code or blueprint changed)
blueprint_ref: <document section or FEAT-nnn>
review_by: <date or milestone>
---
## What the blueprint says
## What the code does
## Why
## Resolution plan
```
