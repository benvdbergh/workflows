# 10. Quality Requirements

## 10.1 Quality tree (as-is prioritization)

| Category | Requirement | Verification today |
|----------|-------------|-------------------|
| **Correctness — replay** | History + definition determines progression | Replay vectors under `conformance/vectors/replay/`; walker tests |
| **Correctness — schema** | Invalid definitions rejected | `*.vector.json` (`kind: "schema"`) + `npm run validate-workflows` |
| **Maintainability — boundary clarity** | MCP isolated behind application port | Adapter tests (`packages/engine/test/mcp-stdio-adapter.test.mjs` and related) |
| **Compliance — profile fidelity** | Node type surface matches scope | AJV enums + poc-scope assertions in documentation |
| **Operability — smoke reproducibility** | Operator can exercise MCP lifecycle | [`../arc42-assets/runbooks/mcp-stdio-host-smoke.md`](../arc42-assets/runbooks/mcp-stdio-host-smoke.md) |

## 10.2 Non-functional backlog (stretch vs GA)

Themes from **`ROADMAP.md`** not fully realized in reference-engine tooling:

| NFR bucket | Desired future state *(not AS-IS completeness)* |
|------------|--------------------------------------------------|
| **Security baseline** | Harden MCP operator manifest handling beyond local trust assumptions |
| **Multi-surface parity** | REST/SDK mirrors of lifecycle operations |
| **Scale-out / HA** | Queue/worker model for stateless execution tiers |
| **Observability** | Structured telemetry with execution correlation |

## 10.3 Quality gates

| Gate | Trigger |
|------|---------|
| `npm run validate-workflows` | CI + local |
| `npm run conformance` | CI |
| `npm test` (engine workspace) | CI |
| `npm run check-engine-poc-schema-sync` | Ensures bundled schema fidelity |

## 10.4 Architecture strengths (as-is reinforcement)

Together these properties keep the reference engine auditable despite limited surface parity:

| Strength | Meaning |
|---------|---------|
| **Profile boundary clarity** | `docs/poc-scope.md` cleanly narrows runnable semantics beneath the RFC family. |
| **Deterministic command/event lineage** | History + schema-valid definition drives **replay-shaped** advancement (`workflow-graph-walker.mjs`). |
| **Hexagonal MCP boundary** | `createWorkflowApplicationPort` shields orchestration logic from MCP transport quirks. |
| **Conformance harness** | Vectors institutionalize regressions beside golden examples. |
| **Operator ergonomics split** | Host-mediated defaults for assistants vs opt-in engine-direct MCP per **ADR-0003**. |
| **Parallel-aware checkpoints** | `parallelSpan` payloads plus checkpoint boundaries keep correlated pending activities explainable (**Section 6.6**). |

---

**Improvement candidate:** Define **minimal RFC-08 conformance bar** milestones with explicit backlog issues—avoid implying full coverage prematurely.
