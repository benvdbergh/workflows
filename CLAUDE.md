# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A specification, contract, and **reference engine** repository for the **Agent Workflow Protocol** — a vendor-neutral declarative workflow protocol for AI agent systems. The current release line is `@agent-workflow/engine@1.0.0` (GA v1). Publish by pushing an annotated `v*` tag on green `master` to trigger `release.yml` (npm, docs, GitHub Release).

- `docs/user/` — **end-user documentation source** (published to GitHub Pages via `website/`)
- `docs/whitepaper/` — narrative protocol whitepaper (also on GitHub Pages)
- `docs/RFC/` — nine-section RFC defining the protocol (normative implementer reference)
- `docs/engine-profile.md` — **authoritative engine profile**: which node types, commands/events, and reducers the reference engine must support (read this before implementing anything)
- `schemas/workflow-definition.json` — JSON Schema Draft 2020-12 entry schema; validates workflow documents
- `examples/` — golden fixtures (workflow + happy-path and failure/retry trace companions) for the lighthouse demo, plus a prompt-improver fixture
- `conformance/` — conformance harness (`run-conformance.mjs`) with deterministic vector discovery under `conformance/vectors/` (`schema/` and `replay/` subtrees)
- `packages/engine/` — **`@agent-workflow/engine`** (npm org scope `@agent-workflow`): definition validation (CLI + library), append-only command/event history (SQLite or in-memory), linear runner, graph walker with `switch` and `interrupt` / resume, and MCP stdio adapter (see `packages/engine/README.md`)
- `scripts/validate-workflows.mjs` — repo-wide golden fixture validation via `@agent-workflow/engine` (schema + profile invariants); used by CI alongside conformance
- `scripts/sync-engine-schema.mjs` — syncs the root `schemas/workflow-definition.json` into `packages/engine/schemas/` (run automatically on `prepack`)
- **Linear** [workflows project](https://linear.app/ben-van-den-bergh/project/workflows-a5eb475ff80e/overview) — canonical epics/stories (milestones/issues), acceptance criteria, and planning narrative (see `.project-planning.yaml` and `.claude/skills/wf-plan/references/workflows-linear-backlog-override.md`). **GitHub issues** on `benvdbergh/workflows` remain for community intake (bugs, security, questions), not the planning backlog.
- `docs/releases/` — alpha changelog (`alpha-release-notes.md`; feeds GitHub Releases)
- `docs/governance/` — release process, versioning policy, CI/CD governance
- `docs/architecture/` — arc42 baseline (`docs/architecture/arc42/`), linked assets under `docs/architecture/arc42-assets/` (diagrams, demos, operator runbooks); ADRs in `docs/architecture/adr/`
- `ROADMAP.md` — post-alpha release plan (R2 Beta through GA and beyond)

## Validation and engine commands

From the repository root (after `npm install`):

| Command | Purpose |
|--------|---------|
| `npm run validate-workflows` | Validate every `*.workflow.json` under `examples/`, schema smoke, and all `fixtures.invalid/` rejection (engine validator; same as CI) |
| `npm run check-docs-nav-sync` | Verify `website/mkdocs.yml` nav matches `scripts/docs-user-manifest.mjs` |
| `npm run conformance` | Run deterministic conformance harness vectors; emits JSON summary on stdout and readable diagnostics on stderr |
| `npm run engine:validate -- path/to/workflow.json` | Validate a single file with the engine CLI (stderr lists AJV errors) |
| `npm run engine:mcp:stdio` | Start the MCP stdio adapter (in-memory store; for development/testing) |
| `npm run check-engine-schema-sync` | Verify the bundled engine schema is in sync with the root schema (run in CI) |
| `npm run docs:serve` | Build and preview end-user docs site locally (requires Python + `website/requirements.txt`) |
| `npm run docs:build` | Production build of end-user docs site |
| `npm test` | Run engine package tests |

One-off validation with **ajv-cli** (no `npm install` required):

```bash
npx --yes ajv-cli@5 validate -s schemas/workflow-definition.json -d path/to/workflow.json --spec=draft2020
```

Lighthouse fixture:

```bash
npx --yes ajv-cli@5 validate -s schemas/workflow-definition.json -d examples/lighthouse-customer-routing.workflow.json --spec=draft2020
```

**CI:** `.github/workflows/validate-workflows.yml` runs the reusable `reusable-validate-and-test.yml` workflow (validate + conformance + test) on pushes and pull requests to `main` and `master`. **Tag push** (`v*`) triggers `.github/workflows/release.yml` (gates → pack → npm publish → docs → GitHub Release). Break-glass manual `release-packaging.yml`, `release-npm-publish.yml`, and `docs-publish.yml` remain for recovery. All workflows run Node.js 24.

## MCP stdio adapter (no-install)

The engine ships two bins: `workflows-engine` (validation CLI) and `workflows-engine-mcp` (MCP stdio server).

**Operator setup** — consume the published package without cloning the repo:

```json
{
  "mcpServers": {
    "workflow-engine": {
      "command": "npx",
      "args": ["-y", "-p", "@agent-workflow/engine@alpha", "workflows-engine-mcp"]
    }
  }
}
```

**Development setup** — run from the monorepo:

```bash
npm run engine:mcp:stdio
```

MCP tools exposed: `workflow_start`, `workflow_status`, `workflow_resume`, `workflow_submit_activity`. Operator smoke runbook: `docs/architecture/arc42-assets/runbooks/mcp-stdio-host-smoke.md`.

## Key architectural decisions

**Engine profile.** `docs/engine-profile.md` freezes the surface the reference engine must honor. Supported node types: `start`, `end`, `step`, `llm_call`, `tool_call`, `switch`, `interrupt`, `parallel`, `wait`, `set_state`, `agent_delegate`, and `subworkflow`. The schema enforces allowed `type` values via a `oneOf` discriminated union that rejects unknown `type` values.

**JSON Schema `additionalProperties: false`** on the workflow root means adding top-level fields (e.g. `extensions`) will fail validation by design.

**Trace companions are not validated by the schema.** `*.trace.*.json` files in `examples/` are informative RFC-04 command/event prefix narratives, not executable or schema-validated artifacts.

**Workflow documents are canonical JSON** (YAML for human authoring is fine, but must be normalized to JSON before validation per RFC-03 §3.1).

**Schema sync is enforced at pack time.** `scripts/sync-engine-schema.mjs` runs as `prepack` to copy the root schema into `packages/engine/schemas/`. Use `npm run check-engine-schema-sync` to verify they are in sync without modifying files.

**MCP adapter is layered over a stable application port.** `createWorkflowApplicationPort` is the internal boundary. The MCP stdio server (`mcp-stdio-server.mjs`) maps MCP request DTOs to that port and translates engine failures into structured tool errors with stable error codes (`VALIDATION_ERROR`, `EXECUTION_NOT_FOUND`, `INVALID_RESUME_PAYLOAD`, activity-submit codes `ACTIVITY_SUBMIT_NOT_AWAITING`, `ACTIVITY_SUBMIT_NODE_MISMATCH`, `ACTIVITY_SUBMIT_PARALLEL_MISMATCH`, `SUBMIT_VALIDATION_ERROR`, `ENGINE_FAILURE`, `INTERNAL_ERROR`).

**Release pipeline is tag-triggered with a human gate.** Maintainers push annotated `v*` tags on green `master` commits; `release.yml` runs quality gates, packaging, OIDC npm publish (`--provenance`), docs deploy, and GitHub Release creation. Use the **`wf-release`** skill for preflight/postflight; break-glass manual workflows remain. See `docs/governance/alpha-ci-cd-packaging-governance.md` for permissions and gate design.

## Work item conventions

**Canonical backlog:** Linear milestones and issues on the workflows project hold epic/story intent, acceptance criteria, status, and links to RFC/`docs/engine-profile.md`/ADRs. Use the `wf-plan`, `wf-design`, `wf-execute`, and `wf-release` skills and `.project-planning.yaml` (`delivery_tracker: linear`) for Linear MCP conventions. The global `project-planning` skill still applies to **process** (decomposition, dependencies, readiness); this repository **overrides the artifact location** to Linear per `workflows-linear-backlog-override.md`.

**Legacy:** Historical per-epic and per-story markdown under `docs` was removed after earlier backlog migrations; GitHub Project #4 is legacy for planning. Do not recreate planning markdown or duplicate backlog in GitHub issues.

When changing the engine profile contract (scope note, schema, or fixtures), update all three together and bump `document.schema` in workflow instances.

## Post-alpha roadmap

`ROADMAP.md` defines the post-POC release plan: R2 Beta (full core orchestration: `parallel`, `wait`, `set_state`), R3 RC (delegation and composition: `agent_delegate`, `subworkflow`, REST + SDK parity), R4 GA (v1 contract freeze), and R5+ (scale and ecosystem). Read `ROADMAP.md` before scoping new epics or stories.
