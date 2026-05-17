# 5. Building Block View (C4 Level 2–3)

## 5.1 Level 2 — Containers (logical deployables / major packages)

| Container | Responsibility | Evidence |
|-----------|-----------------|----------|
| **`@agent-workflow/engine`** | Validation, orchestration, persistence adapters, MCP server composition, exported library API | `packages/engine/` |
| **Conformance harness** | Deterministic `schema` and `replay` vectors | `conformance/run-conformance.mjs`, `conformance/runner.mjs`, `conformance/vectors/` |
| **Repo validation toolchain** | CI-scale AJV sweep over fixtures | `scripts/validate-workflows.mjs`, `npm run validate-workflows` |
| **Contract artifacts** | Normative prose + schema | `docs/RFC/`, `schemas/workflow-definition-poc.json`, `docs/poc-scope.md` |

**Diagram:** [`../arc42-assets/diagrams/as-built-views.drawio`](../arc42-assets/diagrams/as-built-views.drawio) — **`AS-IS Building Block View`**. See [`../arc42-assets/README.md`](../arc42-assets/README.md) for other asset kinds.

## 5.2 Level 3 — Components inside `@agent-workflow/engine`

| Component | Responsibility | Primary modules |
|-----------|----------------|-----------------|
| **Validation** | AJV compile + workflow definition validation | `src/validate.mjs`, `schemas/` (bundled) |
| **Application port** | Stable facade: start / status / resume / submit activity | `src/application/workflow-application-port.mjs` |
| **Graph orchestration** | POC profile node matrix: **`runGraphWorkflow`**, **`resumeGraphWorkflow`**, **`submitActivityOutcome`**; parallel join runtime; deterministic checkpoints; graph invariants | `src/orchestrator/workflow-graph-walker.mjs`, `workflow-graph-walker-support.mjs`, `workflow-graph-invariants.mjs`, `workflow-node-execution.mjs`, `parallel-join-runtime.mjs` |
| **Linear path** | Linear execution, reducers, node path computation | `src/orchestrator/linear-runner.mjs` |
| **Activity execution** | Executors, stubs, engine-direct MCP stdio activity execution | `src/orchestrator/activity-executor.mjs`, `mcp-stdio-activity-executor.mjs` |
| **Replay support** | Hydrate replay context from history | `src/orchestrator/replay-loader.mjs` |
| **Persistence** | Memory + SQLite history stores, record version assertions | `src/persistence/*.mjs` |
| **MCP adapter** | Stdio server, tool handlers, contracts, error mapping, config | `src/adapters/mcp/*.mjs`, `src/mcp-stdio-server.mjs` |
| **Operator manifest** | Read/validate/normalize engine-direct operator config | `src/config/mcp-operator-manifest.mjs` |
| **CLI** | Validation + manifest subcommands | `src/cli.mjs` |

## 5.3 Published binary / library surface

| Surface | Entry | Notes |
|---------|-------|-------|
| **npm package default export** | `packages/engine/src/index.mjs` | Only export path in `package.json` `exports` |
| **CLI** | `workflows-engine` → `src/cli.mjs` | e.g. `npm run engine:validate` |
| **MCP server** | `workflows-engine-mcp` → `src/mcp-stdio-server.mjs` | Local `npm run engine:mcp:stdio` |

### MCP tools (integration API)

Implemented via `createMcpWorkflowToolHandlers`:

- `workflow_start`
- `workflow_status`
- `workflow_resume`
- `workflow_submit_activity`

Structured errors via `src/adapters/mcp/errors.mjs` (codes include `VALIDATION_ERROR`, execution-not-found variants, resume/activity-submit mismatch codes).

## 5.4 Key dependencies between components

- **MCP stdio bin** constructs `MemoryExecutionHistoryStore` (or SQLite if configured downstream), **`createWorkflowApplicationPort`**, then **`createMcpWorkflowStdioServer`**.
- **Application port** delegates to **`runGraphWorkflow`**, **`resumeGraphWorkflow`**, **`submitActivityOutcome`** (`workflow-graph-walker.mjs`), which encapsulate POC replay stepping.
- **Conformance runner** imports engine from `packages/engine/src/index.mjs` and exercises validation + replay scenarios.

## 5.5 POC execution profile (building block rationale)

Implemented node categories (representative—not duplicating schema tables here):

**Control / structure:** `start`, `end`, `switch`, `parallel`, `wait`, `set_state`

**Activities:** `step`, `llm_call`, `tool_call`, `interrupt`

**Composition (R3):** `subworkflow` (nested child `executionId`, `subworkflow-runtime.mjs`, `workflow-ref-resolver.mjs`)

**Out of profile (until #6):** `agent_delegate`

---

**Improvement candidates**

1. **Single generated module graph** from `src/` imports to catch drift vs this table during PRs (optional scripted).
2. **Clarify public vs internal orchestrator APIs**: today everything is reachable via `index.mjs`; consider documenting **tier-1 stable** imports only.
