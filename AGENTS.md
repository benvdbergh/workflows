# AGENTS.md

Shared instructions for everyone who works in this repository: Claude Code, Cursor, Copilot, Lovable, other agents, and people. Tool-specific files (`CLAUDE.md`, `.cursor/rules/`, `.github/copilot-instructions.md`, Lovable's project knowledge) point here.

## How this repository works

`blueprint/` holds the agreed intent: what the product is for, what it does, how it's built and why. The code, migrations, API specs and tests show what it actually does. The two should tell the same story. When they don't, one of them needs to change, and the team should know which.

Start each task by reading `blueprint/00-product-core.md`, then only the blueprint documents that relate to the task. `blueprint/README.md` → *Which document covers what* maps code paths to documents.

If the documents are still empty templates (`status: draft`, placeholders like `<Term>`) in a repository that already has code, the blueprint hasn't been onboarded yet. To set it up, follow `blueprint/workflows/onboard.md`. For any other task, mention that onboarding is pending and carry on.

## Rules

1. **Keep the blueprint true in the same change.** When your change makes a blueprint statement wrong (a table, an endpoint, a screen, a term), update that statement in the same PR. If you can't, say in the PR description which document needs a follow-up.
2. **Propose, don't override.** Never edit `blueprint/00-product-core.md`. Don't change the requirements of anything with `status: approved`; describe the change you'd propose instead. Factual updates (a new screen in the inventory, a delivery-log line) are fine.
3. **New behaviour starts with a spec.** A new feature gets a spec in `blueprint/features/` before it's built (`blueprint/workflows/define-feature.md`). Small fixes and refactors don't.
4. **Use the domain's words.** Use the terms from the glossary in `blueprint/03-domain-data.md`, not the ones in its *Avoid* column.
5. **Make deviations explicit.** If the code deliberately differs from the blueprint, add `blueprint/deviations/DEV-nnn-<name>.md` (format in `blueprint/README.md`) instead of bending either side to look consistent.
6. **Link acceptance criteria to tests.** When a test covers `AC-nnn.n`, put the ID in the test name or a `// covers: AC-nnn.n` comment.
7. **Report drift you didn't cause.** If you notice a mismatch outside your task, mention it in your PR or an issue. Don't fix it in passing.

## Workflows

Plain instructions an agent can follow, on demand or as a scheduled task (for example a Claude Code scheduled task whose prompt is "Follow `blueprint/workflows/sync.md`").

| File | What it does | When |
|---|---|---|
| `blueprint/workflows/sync.md` | Updates the blueprint to match recent code changes; opens a PR | daily, or after merges |
| `blueprint/workflows/audit.md` | Reports where blueprint and code disagree; changes nothing | weekly |
| `blueprint/workflows/review.md` | Checks a branch or PR against the blueprint | on demand, or on open PRs |
| `blueprint/workflows/define-feature.md` | Turns a request into a feature spec | on demand |
| `blueprint/workflows/onboard.md` | Drafts the blueprint from an existing codebase | once |

<!-- Project-specific additions (stack, commands, conventions) go below this line. Keep them short and in this one file. -->
## Project specifics

- Stack: Node.js ≥ 22.5.0 ESM monorepo — `@agent-workflow/engine`, `@agent-workflow/sdk`; see `blueprint/04-architecture.md`
- Install: `npm ci`
- Validate / test: `npm run validate-workflows`; `npm run conformance`; `npm test`
- MCP stdio (dev): `npm run engine:mcp:stdio`
- REST (dev): `npm run engine:rest:serve`
- Docs site (maintainers): `npm run docs:serve` (Python + `website/requirements.txt`)
- Planning backlog: Linear workflows project (not GitHub issues)
- ADRs: `docs/architecture/adr/` (not `blueprint/decisions/` yet)
- Normative SSOT: `docs/RFC/`, `docs/engine-profile.md`, `schemas/` — blueprint links only
