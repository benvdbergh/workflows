# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A specification, contract, and **POC engine** repository for the **Agent Workflow Protocol** — a vendor-neutral declarative workflow protocol for AI agent systems. Besides the RFCs and schemas, it ships a Node.js workspace package that validates POC definitions and runs durable orchestration against the EPIC-1 subset.

- `docs/RFC/` — nine-section RFC defining the protocol (workflow definition schema, execution model, MCP/REST/SDK integration, security, governance)
- `docs/poc-scope.md` — **authoritative POC subset**: which node types, commands/events, and reducers the first engine milestone must support (read this before implementing anything)
- `schemas/workflow-definition-poc.json` — JSON Schema Draft 2020-12 entry schema; validates POC workflow documents
- `examples/` — golden fixtures (workflow + happy-path and failure/retry trace companions) for the lighthouse demo
- `conformance/` — conformance harness (`run-conformance.mjs`) with deterministic vector discovery under `conformance/vectors/`
- `packages/engine/` — **`@agent-workflow/engine`** (npm org scope `@agent-workflow`): POC validation (CLI + library), append-only command/event history (SQLite or in-memory), linear runner, and full POC walker with `switch` and `interrupt` / resume (see `packages/engine/README.md`)
- `scripts/validate-workflows.mjs` — repo-wide AJV validation used by CI and aligned with the engine’s schema options
- `docs/epics/` and `docs/stories/` — agile work items with YAML frontmatter (managed by the `project-planning` skill)

## Validation and engine commands

From the repository root (after `npm install`):

| Command | Purpose |
|--------|---------|
| `npm run validate-workflows` | Validate every `*.workflow.json` under `examples/`, schema smoke, and invalid fixture rejection (same as CI) |
| `npm run conformance` | Run deterministic conformance harness vectors; emits JSON summary on stdout and readable diagnostics on stderr |
| `npm run engine:validate -- path/to/workflow.json` | Validate a single file with the engine CLI (stderr lists AJV errors) |
| `npm test` | Run engine package tests |

One-off validation with **ajv-cli** (no `npm install` required):

```bash
npx --yes ajv-cli@5 validate -s schemas/workflow-definition-poc.json -d path/to/workflow.json --spec=draft2020
```

Lighthouse fixture:

```bash
npx --yes ajv-cli@5 validate -s schemas/workflow-definition-poc.json -d examples/lighthouse-customer-routing.workflow.json --spec=draft2020
```

**CI:** `.github/workflows/validate-workflows.yml` runs `npm ci` and `npm run validate-workflows` on pushes and pull requests to `main` and `master` (Node.js 24 on the runner).

## Key architectural decisions

**POC scope is intentionally narrow.** `docs/poc-scope.md` freezes the surface the first engine must honor. Supported node types: `start`, `end`, `step`, `llm_call`, `tool_call`, `switch`, `interrupt`. Explicitly out of scope: `parallel`, `agent_delegate`, `subworkflow`, `wait`, `set_state`. The schema enforces this via a `oneOf` discriminated union that rejects unknown `type` values.

**JSON Schema `additionalProperties: false`** on the workflow root means adding top-level fields (e.g. `extensions`) will fail validation by design.

**Trace companions are not validated by the schema.** `*.trace.*.json` files in `examples/` are informative RFC-04 command/event prefix narratives, not executable or schema-validated artifacts.

**Workflow documents are canonical JSON** (YAML for human authoring is fine, but must be normalized to JSON before validation per RFC-03 §3.1).

## Work item conventions

Epic and story files carry YAML frontmatter with `kind`, `id`, `status`, `depends_on`, `traces_to`, and `acceptance_criteria`. The `.project-planning.yaml` manifest at the repo root configures the planning skill (epics in `docs/epics/`, stories in `docs/stories/`).

When changing the POC contract (scope note, schema, or fixtures), update all three together and bump `document.schema` in workflow instances.
