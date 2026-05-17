# 9. Architecture Decisions

Significant architectural decisions live as **architecture decision records (ADRs)** to keep this section concise and auditable.

| ADR | Title | Topic |
|-----|-------|-------|
| [ADR-0001](../adr/ADR-0001-poc-foundation-decisions.md) | POC foundation | Runtime scope anchored in `docs/poc-scope.md` |
| [ADR-0002](../adr/ADR-0002-host-mediated-activity-execution.md) | Host-mediated activity execution | MCP host submits activity outcomes (`workflow_submit_activity`) |
| [ADR-0003](../adr/ADR-0003-engine-direct-mcp-activity-execution.md) | Engine-direct MCP activity execution | Optional operator manifests for unattended profiles |
| [ADR-0004](../adr/ADR-0004-r3-delegation-and-subworkflow.md) | R3 delegation and subworkflow | Native `agent_delegate` + `subworkflow`, replay invariants |

Lifecycle and conventions: [`../adr/README.md`](../adr/README.md).

**When proposing a change that crosses profiles, replay guarantees, MCP contracts, or security posture**, add or amend an ADR before expanding code—then link conformance vectors/tests proving the invariant.

### ADR bootstrap (themes from the current baseline)

Fertile tension clusters for future ADRs—each record should cite **RFC** sections impacted, deltas to **`docs/poc-scope.md`**, and conformance/test hooks proving regressions cannot slip unnoticed:

| Theme | Typical trigger |
|-------|----------------|
| Host-mediated vs **`in_process`** orchestration ergonomics vs trust boundaries | MCP host ergonomics, dual-mode hosts (**ADR-0002** lineage) |
| Richer delegate/subworkflow semantics (cancel propagation, dedicated delegate events, status correlation) | Post-R3 ([#8](https://github.com/benvdbergh/workflows/issues/8), R4+) per **ADR-0004** |
| Checkpoint density vs throughput/cost trade-offs | Larger graphs, parallelism fan-out |
| Adapter parity sequencing (**MCP** now, **REST/SDK** later—**Section 11**) | Portfolio integrators diverging expectations |
| Contract / schema **versioning** & compatibility guards ahead of GA | npm major bumps, bundled schema pinning |

Mandatory cross-links inside each ADR body:

1. Supporting **RFC** sections (execution model, integrations, conformance expectations).
2. **`docs/poc-scope.md`** impact statement (narrow/widen profile).
3. **Conformance** additions (`conformance/vectors/**`) plus targeted **`packages/engine/test/**`** identifiers.

---

**Improvement candidate:** Lightweight **ADR index table** tagging each ADR with **affected orchestrator modules** and **linked conformance vectors**.
