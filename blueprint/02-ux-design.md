---
id: "02"
title: UX & Design
status: proposed
owner: UX / Product
last_reviewed: 2026-11-24
---

# 02 · UX & Design

> **Authority:** UX / Product. **AI policy:** agents propose updates via PR (`workflows/sync.md`, `workflows/review.md`). Intentional visual changes are recorded here; unintentional ones are fixed in code.
> **Changes when:** screens, interactions or the design system change.
>
> **Note:** This repository is a **protocol + reference engine**, not a UI product. There is no application router, component library, or design-token system in-repo. Operator-facing UX is documentation and CLI/MCP tool surfaces. End-user docs live under `docs/user/` and the published site (`website/`) — out of scope for this blueprint migration.

Prototypes live in `blueprint/prototypes/`. Implemented components are the visual source of truth once they exist. Storybook, or an equivalent, is introduced when the component library is big enough to need it.

## Design principles

<!-- Leave as questions until a real UI product exists. -->
- What visual language should a future workflow designer or ops console use?
- How should interrupt/HITL prompts be presented across host UIs (IDE vs automation)?
- Should docs site theming be considered product UX or publishing chrome only?

## Design system

### Tokens

| Token group | Source file | Intent |
|---|---|---|
| Colour | — | No shared UI token file in this repo |
| Typography | — | No shared UI token file in this repo |
| Spacing / radius | — | No shared UI token file in this repo |

*(MkDocs site styling under `website/` is publishing chrome, not a product design system — left alone per migration scope.)*

### Components

| Component | Location | Use for | Don't use for |
|---|---|---|---|
| — | — | No shared UI component library | — |

## Screen inventory

| Screen | Route | Feature(s) | Prototype | Status |
|---|---|---|---|---|
| — | — | — | — | No in-repo application screens |

**Related non-screen surfaces** *(not routes; documented for drift awareness)*:

| Surface | Entry | Notes |
|---|---|---|
| Validation CLI | `workflows-engine` | Terminal UX |
| MCP tools | `workflows-engine-mcp` | Host-rendered tool UI |
| REST API | `workflows-engine-rest` | HTTP clients / OpenAPI |
| Docs site | GitHub Pages via `website/` | End-user docs — out of blueprint migration scope |

## Interaction patterns

- **Empty states:** <!-- no product UI -->
- **Errors:** Structured tool/API error codes for hosts to render (`VALIDATION_ERROR`, `EXECUTION_NOT_FOUND`, activity-submit mismatches, etc.) — see [packages/engine](../packages/engine/) and arc42 building blocks
- **Destructive actions:** Cooperative cancel via control-plane APIs when configured *(seen in engine control-plane work)*

## Accessibility

- Target: WCAG 2.2 AA — **applies if/when** a first-party UI ships; not enforceable on MCP host UIs we do not own
- Docs site a11y follows MkDocs Material defaults *(inferred; not audited in this draft)*

## Visual regression

No baseline screenshots or visual regression suite for a product UI. Docs/diagram exports are governed separately (`npm run check-arc42-export-drift`).
