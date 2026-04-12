# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A specification and artifact repository for the **Agent Workflow Protocol** — a vendor-neutral declarative workflow protocol for AI agent systems. There is no application code yet; current content is:

- `docs/RFC/` — nine-section RFC defining the protocol (workflow definition schema, execution model, MCP/REST/SDK integration, security, governance)
- `docs/poc-scope.md` — **authoritative POC subset**: which node types, commands/events, and reducers the first engine milestone must support (read this before implementing anything)
- `schemas/workflow-definition-poc.json` — JSON Schema Draft 2020-12 entry schema; validates POC workflow documents
- `examples/` — golden fixtures (workflow + happy-path and failure/retry trace companions) for the lighthouse demo
- `docs/epics/` and `docs/stories/` — agile work items with YAML frontmatter (managed by the `project-planning` skill)

## Schema validation command

```bash
npx --yes ajv-cli@5 validate -s schemas/workflow-definition-poc.json -d path/to/workflow.json --spec=draft2020
```

To validate the lighthouse fixture specifically:

```bash
npx --yes ajv-cli@5 validate -s schemas/workflow-definition-poc.json -d examples/lighthouse-customer-routing.workflow.json --spec=draft2020
```

No CI pipeline exists yet; validation is manual (STORY-1-4 tracks wiring this into CI).

## Key architectural decisions

**POC scope is intentionally narrow.** `docs/poc-scope.md` freezes the surface the first engine must honor. Supported node types: `start`, `end`, `step`, `llm_call`, `tool_call`, `switch`, `interrupt`. Explicitly out of scope: `parallel`, `agent_delegate`, `subworkflow`, `wait`, `set_state`. The schema enforces this via a `oneOf` discriminated union that rejects unknown `type` values.

**JSON Schema `additionalProperties: false`** on the workflow root means adding top-level fields (e.g. `extensions`) will fail validation by design.

**Trace companions are not validated by the schema.** `*.trace.*.json` files in `examples/` are informative RFC-04 command/event prefix narratives, not executable or schema-validated artifacts.

**Workflow documents are canonical JSON** (YAML for human authoring is fine, but must be normalized to JSON before validation per RFC-03 §3.1).

## Work item conventions

Epic and story files carry YAML frontmatter with `kind`, `id`, `status`, `depends_on`, `traces_to`, and `acceptance_criteria`. The `.project-planning.yaml` manifest at the repo root configures the planning skill (epics in `docs/epics/`, stories in `docs/stories/`).

When changing the POC contract (scope note, schema, or fixtures), update all three together and bump `document.schema` in workflow instances.
