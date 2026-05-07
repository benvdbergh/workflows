# 12. Glossary

| Term | Definition |
|------|------------|
| **Agent Workflow Protocol** | Specification family under `docs/RFC/` defining declarative workflows for agent systems |
| **POC profile / engine profile** | Authoritative runtime subset documented in [`docs/poc-scope.md`](../../poc-scope.md) |
| **Workflow definition** | JSON document complying with POC schema describing nodes, edges, state schema |
| **Execution** | A single invocation of orchestration keyed by **`executionId`** |
| **`workflows-engine`** | CLI bin for workflow validation/manifest tooling (`packages/engine/src/cli.mjs`) |
| **`workflows-engine-mcp`** | MCP stdio adapter bin (`packages/engine/src/mcp-stdio-server.mjs`) |
| **Application port** | `createWorkflowApplicationPort(deps)`—stable façade over graph operations |
| **Host-mediated execution** | Engine yields `awaiting_activity`; host completes externally and calls submit |
| **Engine-direct execution** | In-process MCP tool invocation orchestrated via operator manifest (**ADR-0003**) |
| **History store** | `MemoryExecutionHistoryStore` or `SqliteExecutionHistoryStore` |
| **Conformance vector** | JSON file under `conformance/vectors/**` declaring `schema` or `replay` harness case |
| **parallelSpan** | Correlation payload for parallel-branch activity submits |
| **arc42** | Architecture documentation template structuring sections 1–12 |
| **C4 model** | Context / Container / Component / Code hierarchy often mapped to diagrams here |

---

**Improvement candidates**

1. Align glossary terms with **canonical RFC glossary** headings when authoring cross-links (`docs/RFC/`).
2. Add translation notes if external docs localize terms.
