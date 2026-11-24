# Onboard: fill the blueprint from an existing codebase

**Run:** once, right after the blueprint is added to a repository that already has code. Interactive is best: ask the person a few questions first.
**Changes:** `blueprint/01`–`07`, proposed ADRs in `blueprint/decisions/`, the *Project specifics* in `AGENTS.md`, the *Which document covers what* table in `blueprint/README.md`. Never `00-product-core.md`, never code.
**Ends with:** one pull request with a first draft of the blueprint for the owners to review.

## Goal

The blueprint starts as empty templates. Turn what the code already shows into a first, honest draft, so the other workflows have something to keep in line. A short, true document beats a complete-looking guess.

## Ground rules

- **Evidence over imagination.** Every statement is either seen in the code (name the path) or inferred (say so). Leave a section's template comment in place when there's nothing to say yet.
- **Proposals, not decisions.** Set `status: proposed` on every document you fill and `last_reviewed` to today. Approval is the owner's step.
- **00 belongs to the owner.** Don't edit it. Draft what you'd suggest in the PR description instead.
- **Describe, don't copy.** Link to migrations, OpenAPI files, token files and config instead of pasting them.
- **Keep the structure.** Fill the existing headings and tables. Replace placeholder rows (`<Entity>`, `<Term>`) once real rows exist.

## Steps

1. **Ask** (if someone is there): what the product is for, who uses it, which environments exist. Skip what the README already answers.
2. **Survey** before writing: README and docs; the manifest (`package.json`, `pyproject.toml`, …) and framework config; migrations, schema and generated types; API routes and server functions; router, pages, components and design tokens; CI, deploy and hosting config, `.env.example` (never `.env`); `git log --oneline -50`.
3. **Fill the documents**, most factual first:

   | Doc | From | Fill |
   |---|---|---|
   | 04 Architecture | manifest, config, folders | system context, stack with versions, modules and boundaries as they are, cross-cutting concerns. An ADR (`status: proposed`) only for a plainly visible, load-bearing decision. |
   | 03 Domain & Data | migrations, schema, domain code | entities, a Mermaid domain model, data access rules, the glossary. Put a synonym in *Avoid* only if the code really uses it for the same concept. |
   | 05 Interfaces | routes, functions, SDK clients | API overview (link the spec if there is one), internal interfaces, external integrations. |
   | 06 Deployment | CI, hosting config, `.env.example` | environments, release process, config and secrets by name only. |
   | 02 UX & Design | router, pages, components | screen inventory (one row per route), design system as it exists. Leave principles as questions. |
   | 01 Product | README, screens, roles | capability map of what the product does today, roles, key journeys. Don't create feature specs for existing capabilities. |
   | 07 Roadmap | history, issues, TODOs | delivery log from recent history; leave Now / Next / Later to the owner. |

4. **Point the map at this repo.** In `blueprint/README.md` → *Which document covers what*, replace the example paths with where this repository keeps migrations, functions, screens and so on. In `AGENTS.md` → *Project specifics*, fill in stack, install and dev-server commands.
5. **Open the pull request** on branch `blueprint/onboarding`, message `docs(blueprint): onboarding draft from existing code`. Description: a suggested Product Core (00) for the owner to rewrite, what you filled (document · sections · main sources), open questions per owner, possible drift you noticed, and next steps (owner writes 00, reviews and approves the rest, sets up `sync` and `audit` as scheduled tasks).
