# 2. Architecture Constraints

## 2.1 Technical constraints

| Constraint | Rationale |
|------------|-----------|
| **Node.js** runtime (see CI `@node 24` in repo workflows) | Engine package ships as npm module with ESM-first layout. |
| **JSON Canonical documents** per RFC authoring rules | Validator and schema target JSON; authoring may use YAML but must normalize for validation. |
| **SQLite via `node:sqlite`** (`packages/engine/` persistence) | Lightweight durable local persistence without external service deps for reference profile. |
| **MCP over stdio** for primary integration demo | Mirrors common IDE/host deployment; minimizes wire protocol surface for the reference engine. |

## 2.2 Organizational / process constraints

| Constraint | Rationale |
|------------|-----------|
| **Schema sync at pack (`prepack`)** | Bundled schema under `packages/engine/schemas/` must track root `schemas/workflow-definition.json`; `npm run check-engine-schema-sync` guards drift. |
| **ADRs for significant deviations** | `docs/architecture/adr/` anchors decisions with RFC / profile references. |

## 2.3 Conventions enforcing the profile (`docs/engine-profile.md`)

- **Workflow document shape**: `document`, `state_schema`, `nodes`, `edges`; optional `checkpointing`; **no top-level `extensions`** in the engine profile.
- **Node type set**: in-scope types include `parallel`, `wait`, `set_state`, `subworkflow`, `agent_delegate` ([ADR-0004](../adr/ADR-0004-r3-delegation-and-subworkflow.md)).
- **Edge / routing rules**: e.g. `switch` resolves via `config.cases` / `config.default`; `parallel` joins as documented in profile—not every RFC edge shape is interchangeable.
- **jq and reducers**: `switch.when` / `end.output_mapping` jq strings; reducers `overwrite`/`append`/`merge` only (**`custom` rejected** in the engine profile).
- **Interrupt placement**: profile calls out **`interrupt` inside `parallel`** as not resume-safe.

## 2.4 Legal / compliance posture (explicitly limited reference engine)

STDIO MCP and local SQLite assume **trusted operator contexts**. Security hardening breadth is intentionally limited for the alpha reference engine; revisit before GA narratives (`ROADMAP.md`, ADRs).

**Improvement candidate:** Add a concise **trust-boundary appendix** listing data that leaves process boundaries in engine-direct MCP mode versus host-mediated mode.
