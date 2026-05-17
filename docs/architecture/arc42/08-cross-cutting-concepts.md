# 8. Cross-cutting Concepts

## 8.1 Domain model (conceptual)

| Concept | Meaning |
|---------|---------|
| **Workflow definition** | JSON document: nodes, edges, schemas, jq expressions per profile rules |
| **Execution** | A single run keyed by execution id |
| **Command / Event** | Append-only history primitives modeling progression (`RFC`-aligned semantics) |
| **State** | JSON object evolved by reducers; validated against `state_schema` when enabled |
| **Activity** | `step`, `llm_call`, `tool_call` execution boundary **`in_process`** vs **`host_mediated`** (plus optional engine-direct MCP in **`in_process`**) — see **Section 4.4**. |

## 8.2 Consistency / replay discipline

Deterministic branching requires:

- reproducible reducer/jq evaluations on recorded inputs,
- no hidden side channels influencing branch choice,
- nondeterminism surfaced as typed failures (`NONDETERMINISM_DETECTED` family in graph walker implementation).

## 8.3 Error handling strategy

| Layer | Behavior |
|-------|----------|
| **Validator** | AJV errors → CLI stderr / structured validation failures |
| **Orchestration** | Machine-oriented codes for resume/adaptation (`INVALID_RESUME_PAYLOAD`, …) |
| **MCP adapter** | Stable tool error taxonomy for hosts (`packages/engine/src/adapters/mcp/errors.mjs`) |

## 8.4 Logging / observability (reference engine stance)

Stdout/stderr narratives for conformance and MCP smoke; structured logging not yet a first-class product surface.

## 8.5 Testing strategy linkage

| Level | Coverage |
|-------|----------|
| **Unit/integration** | `packages/engine/test/*.test.mjs` |
| **Contract-level** | `conformance/vectors/schema/**`, `replay/**` |
| **Golden fixtures** | `examples/*.workflow.json` via `npm run validate-workflows` |

## 8.6 Checkpointing *(optional capability)*

Profile allows `checkpointing` configuration; the graph walker emits deterministic checkpoint events aligned with walker boundaries—consumers derive recovery semantics per RFC + profile narratives.

## 8.7 Integration contract (operator manifest)

Engine-direct wiring is documented as a **transport-facing** operator JSON contract: [`../arc42-assets/contracts/mcp-operator-manifest.md`](../arc42-assets/contracts/mcp-operator-manifest.md).

## 8.8 Workflow reference resolution (subworkflow)

Workflows that call a nested definition via **`subworkflow`** use `config.workflow_ref` (URI or registry id). The reference engine resolves refs through an **in-process registry** (`registerWorkflowRef` / `clearWorkflowRefs` in `workflow-ref-resolver.mjs`).

| Deployment | Behavior |
|------------|----------|
| **Full repository checkout** | A small set of built-in URNs may load JSON from `examples/` when the monorepo root is found (e.g. conformance/demo child fixtures). |
| **Published `@agent-workflow/engine` npm package** | `examples/` is **not** in the publish payload; built-in file-backed URNs are unavailable. Embedders must register child definitions before run (or supply definitions only through explicit registration). |

Product detail and API notes: [`packages/engine/README.md`](../../../packages/engine/README.md#workflow-references).

---

**Improvement candidates**

1. **Unified observability** story before GA (`ROADMAP.md`)—correlation IDs across host + engine logs.
2. **jq subset documentation** surfaced as standalone developer guide (referenced from reducer/switch semantics).
3. **Security concept page** aligning threat model sketch with MCP operator manifest scopes.
