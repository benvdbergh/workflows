# 3. Context and Scope (C4 Level 1)

## 3.1 Business context

The system provides a **vendor-neutral declarative workflow** contract for AI agent tooling: workflows are data, execution progress is modeled as commands/events suitable for deterministic replay.

## 3.2 Technical context — external actors and systems

| Neighbor | Relationship |
|----------|----------------|
| **MCP host / IDE / agent runtime** | Spawns `workflows-engine-mcp`, calls `workflow_start`, `workflow_status`, `workflow_resume`, `workflow_submit_activity`. |
| **Operator** | Validates definitions (`workflows-engine`, repo `npm run validate-workflows`), configures optional engine-direct manifest (`WORKFLOW_ENGINE_MCP_CONFIG` / `--mcp-config`). |
| **SQLite file** *(optional)* | Durable execution history backing store (`SqliteExecutionHistoryStore`). |
| **Upstream MCP servers** *(optional engine-direct)* | Invoked via stdio MCP client during in-process/tool execution paths when manifest enables it. |

**Diagram:** [`../arc42-assets/diagrams/as-built-views.drawio`](../arc42-assets/diagrams/as-built-views.drawio), page **`AS-IS Context`** (maintain graphical system context alongside this section). Supplementary narratives and runbooks live under [`../arc42-assets/`](../arc42-assets/README.md) (`diagrams/`, `demos/`, `runbooks/`).

## 3.3 Scope of this codebase

### In scope (as-implemented baseline)

| Area | Repository location |
|------|---------------------|
| RFC text | `docs/RFC/` |
| Engine profile + schema | `docs/poc-scope.md`, `schemas/workflow-definition-poc.json`, synced `packages/engine/schemas/` |
| Reference engine package | `packages/engine/` (`src/index.mjs` public exports; bins `workflows-engine`, `workflows-engine-mcp`) |
| Golden examples | `examples/` |
| Deterministic conformance | `conformance/` (`run-conformance.mjs`, `runner.mjs`, `vectors/`) |
| Root validation tooling | `scripts/validate-workflows.mjs`, `npm run validate-workflows` |

### Explicitly deferred

- **`agent_delegate`** in engine walker (R3 #6; `subworkflow` shipped in #7).
- **Broad REST/SDK parity** (`ROADMAP.md` sequencing).
- **Full RFC-08 coverage** via conformance *(partial intentionally)*.

## 3.4 Repository role (baseline snapshot)

Treat the repo concurrently as:

1. **Protocol specification source** (`docs/RFC/`).
2. **Engine profile contract + fixtures** (`docs/poc-scope.md`, `schemas/`, `examples/`).
3. **Executable reference package** (`packages/engine/`, **`@agent-workflow/engine`** on npm).
4. **Regression gates**: deterministic conformance (`conformance/`) plus validation scripts and CI.

This layout is intentional: fast iteration where the POC profile permits, deterministic behavior backed by replay where it matters.

## 3.5 Logical layers (conceptual—not extra deployables)

1. **Contract layer** — RFC + profile + JSON Schema enforcing definition-time constraints.
2. **Execution core** — linear runner (`runLinearWorkflow`) and **graph walker** (`runGraphWorkflow` / `resumeGraphWorkflow`) producing command/event history; reducers/state validation during node completion.
3. **Persistence boundary** — `ExecutionHistoryStore` with memory and SQLite implementations.
4. **Integration adapter** — MCP stdio server mapping host calls onto `createWorkflowApplicationPort`.
5. **Quality** — conformance vectors and `npm run validate-workflows`.

See Section 5 for module-level decomposition.

### Validation & conformance (scope of coverage today)

Schema validation paths are aligned across the engine package, repo scripts, and CI. Conformance presently emphasizes **schema** vectors and **`replay`** prefix/tail checks for deterministic orchestration semantics. Areas implied by **`docs/RFC/rfc-08-reference-implementation.md`** can remain intentionally partial until explicitly scheduled—do not infer full RFC-08 coverage from the POC harness alone.

---

**Improvement candidate:** Annotate conformance `vectors/` subtree with **RFC section tags** for traceability in CI output or vector metadata.
