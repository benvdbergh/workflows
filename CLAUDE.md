# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A specification, contract, and **POC engine** repository for the **Agent Workflow Protocol** — a vendor-neutral declarative workflow protocol for AI agent systems. The POC alpha (`@agent-workflow/engine@0.1.0-alpha.3`) has been released to npm under the `alpha` dist-tag.

- `docs/RFC/` — nine-section RFC defining the protocol (workflow definition schema, execution model, MCP/REST/SDK integration, security, governance)
- `docs/poc-scope.md` — **authoritative POC subset**: which node types, commands/events, and reducers the first engine milestone must support (read this before implementing anything)
- `schemas/workflow-definition-poc.json` — JSON Schema Draft 2020-12 entry schema; validates POC workflow documents
- `examples/` — golden fixtures (workflow + happy-path and failure/retry trace companions) for the lighthouse demo, plus a prompt-improver fixture
- `conformance/` — conformance harness (`run-conformance.mjs`) with deterministic vector discovery under `conformance/vectors/` (`schema/` and `replay/` subtrees)
- `packages/engine/` — **`@agent-workflow/engine`** (npm org scope `@agent-workflow`): POC validation (CLI + library), append-only command/event history (SQLite or in-memory), linear runner, full POC walker with `switch` and `interrupt` / resume, and MCP stdio adapter (see `packages/engine/README.md`)
- `scripts/validate-workflows.mjs` — repo-wide AJV validation used by CI and aligned with the engine's schema options
- `scripts/sync-engine-poc-schema.mjs` — syncs the root `schemas/workflow-definition-poc.json` into `packages/engine/schemas/` (run automatically on `prepack`)
- **GitHub issues** in `benvdbergh/workflows` (+ [Project #4](https://github.com/users/benvdbergh/projects/4)) — canonical epics/stories, acceptance criteria, and planning narrative (see `.project-planning.yaml` and `.claude/skills/wf-plan/references/workflows-github-backlog-override.md`)
- `docs/releases/` — release notes and versioning/CI governance docs for the alpha
- `docs/architecture/` — operator runbooks and architecture diagrams (MCP stdio smoke runbook, demo walkthroughs)
- `ROADMAP.md` — post-alpha release plan (R2 Beta through GA and beyond)

## Validation and engine commands

From the repository root (after `npm install`):

| Command | Purpose |
|--------|---------|
| `npm run validate-workflows` | Validate every `*.workflow.json` under `examples/`, schema smoke, and invalid fixture rejection (same as CI) |
| `npm run conformance` | Run deterministic conformance harness vectors; emits JSON summary on stdout and readable diagnostics on stderr |
| `npm run engine:validate -- path/to/workflow.json` | Validate a single file with the engine CLI (stderr lists AJV errors) |
| `npm run engine:mcp:stdio` | Start the MCP stdio adapter (in-memory store; for development/testing) |
| `npm run check-engine-poc-schema-sync` | Verify the bundled engine schema is in sync with the root schema (run in CI) |
| `npm test` | Run engine package tests |

One-off validation with **ajv-cli** (no `npm install` required):

```bash
npx --yes ajv-cli@5 validate -s schemas/workflow-definition-poc.json -d path/to/workflow.json --spec=draft2020
```

Lighthouse fixture:

```bash
npx --yes ajv-cli@5 validate -s schemas/workflow-definition-poc.json -d examples/lighthouse-customer-routing.workflow.json --spec=draft2020
```

**CI:** `.github/workflows/validate-workflows.yml` runs the reusable `reusable-validate-and-test.yml` workflow (validate + conformance + test) on pushes and pull requests to `main` and `master`. Manual `release-packaging.yml` and `release-npm-publish.yml` workflows gate release artifacts and trusted npm publishes behind the same quality-gate reusable. All workflows run Node.js 24.

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

MCP tools exposed: `workflow_start`, `workflow_status`, `workflow_resume`, `workflow_submit_activity`. Operator smoke runbook: `docs/architecture/mcp-stdio-host-smoke.md`.

## Key architectural decisions

**Engine profile (POC + R2).** `docs/poc-scope.md` freezes the surface the reference engine must honor. Supported node types: `start`, `end`, `step`, `llm_call`, `tool_call`, `switch`, `interrupt`, plus R2 `parallel`, `wait`, and `set_state`. Explicitly out of scope for this profile: `agent_delegate`, `subworkflow`. The schema enforces allowed `type` values via a `oneOf` discriminated union that rejects unknown `type` values.

**JSON Schema `additionalProperties: false`** on the workflow root means adding top-level fields (e.g. `extensions`) will fail validation by design.

**Trace companions are not validated by the schema.** `*.trace.*.json` files in `examples/` are informative RFC-04 command/event prefix narratives, not executable or schema-validated artifacts.

**Workflow documents are canonical JSON** (YAML for human authoring is fine, but must be normalized to JSON before validation per RFC-03 §3.1).

**Schema sync is enforced at pack time.** `scripts/sync-engine-poc-schema.mjs` runs as `prepack` to copy the root schema into `packages/engine/schemas/`. Use `npm run check-engine-poc-schema-sync` to verify they are in sync without modifying files.

**MCP adapter is layered over a stable application port.** `createWorkflowApplicationPort` is the internal boundary. The MCP stdio server (`mcp-stdio-server.mjs`) maps MCP request DTOs to that port and translates engine failures into structured tool errors with stable error codes (`VALIDATION_ERROR`, `EXECUTION_NOT_FOUND`, `INVALID_RESUME_PAYLOAD`, activity-submit codes `ACTIVITY_SUBMIT_NOT_AWAITING`, `ACTIVITY_SUBMIT_NODE_MISMATCH`, `ACTIVITY_SUBMIT_PARALLEL_MISMATCH`, `SUBMIT_VALIDATION_ERROR`, `ENGINE_FAILURE`, `INTERNAL_ERROR`).

**Release pipeline is fully manual and trusted-publish-based.** npm publish uses OIDC provenance (`--provenance`); no secrets stored in the repo. Release ops require `id-token: write` on the publish job only. See `docs/releases/alpha-ci-cd-packaging-governance.md` for the full permissions map and gate design.

## Work item conventions

**Canonical backlog:** GitHub issues (and parent/sub-issue relationships) hold epic/story intent, acceptance criteria, status, and links to RFC/`docs/poc-scope.md`/ADRs. Use the `wf-plan`, `wf-design`, and `wf-execute` skills and `.project-planning.yaml` for `gh`/Project conventions. The global `project-planning` skill still applies to **process** (decomposition, dependencies, readiness); this repository **overrides the artifact location** to GitHub per `workflows-github-backlog-override.md`.

**Legacy:** Historical per-epic and per-story markdown under `docs` was removed after GitHub became the planning store; do not recreate it.

When changing the POC contract (scope note, schema, or fixtures), update all three together and bump `document.schema` in workflow instances.

## Post-alpha roadmap

`ROADMAP.md` defines the post-POC release plan: R2 Beta (full core orchestration: `parallel`, `wait`, `set_state`), R3 RC (delegation and composition: `agent_delegate`, `subworkflow`, REST + SDK parity), R4 GA (v1 contract freeze), and R5+ (scale and ecosystem). Read `ROADMAP.md` before scoping new epics or stories.
