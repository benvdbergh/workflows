# ADR-0003: Engine-direct MCP activity execution (security and configuration posture)

**Status:** Accepted  
**Date:** 2026-05-04  
**Tags:** integration, MCP, execution-model, trust-boundary, security, engine-direct

## Context

[ADR-0002](ADR-0002-host-mediated-activity-execution.md) establishes **host-mediated** activity execution as the default for assistant-class deployments and describes an **engine-direct** evolution for operator and automation scenarios. [RFC-06 §6.1](../../RFC/rfc-06-interoperability.md#61-composing-mcp) distinguishes **host-mediated** and **engine-direct** profiles at the protocol level.

Without normative repository rules, engine-direct execution risks duplicating host trust assumptions: secrets in the engine process, unbounded child processes, and non-replay-safe side effects. This ADR closes that gap so dependent R2 implementation issues can assume explicit boundaries.

## Decision

1. **Engine-direct is an optional deployment profile** of the reference engine. It **does not** change the default assistant-class posture in ADR-0002. Operators **MUST** enable it only where policy, threat model, and operating procedures explicitly allow the engine process to perform MCP **tools/call** (and any bounded local handlers) on behalf of workflows.
2. **Trust boundaries** (normative for this repository’s reference engine when engine-direct is enabled):
   - **Workflow document and graph state** remain untrusted input; validation and deterministic replay rules apply unchanged.
   - **Engine process** becomes part of the **credential and side-effect trust zone** for configured MCP servers and allowed local handlers—the same practical zone as a long-lived automation worker, not an ephemeral IDE session.
   - **MCP server processes** (stdio children or remote peers) are **separate trust domains** from the engine: compromised or malicious servers can attack the engine via protocol surfaces, resource exhaustion, or malicious tool results; the engine **MUST** treat tool payloads as untrusted input to reducers and host-facing projections.
3. **Secret and credential storage** (reference expectations):
   - **Preferred:** OS/user secret stores, environment injection by a supervisor, or short-lived tokens obtained out-of-band—configured so workflow JSON **never** embeds long-lived secrets when avoidable.
   - **Acceptable for R2:** Filesystem-backed manifest shapes compatible with common MCP host configs (for example `mcp.json`-class), with **explicit operator responsibility** for file permissions, rotation, and exclusion from version control; the engine **SHOULD** read credentials only from configured paths or env vars named in operator docs, not from arbitrary workflow fields.
   - **Forbidden as a normative pattern:** silently persisting tool outputs that contain secrets into durable history without policy; see audit/redaction below.
4. **Process isolation for stdio MCP children:**
   - Each stdio MCP server **SHOULD** run as a **separate child process** with minimal inherited environment; operators **SHOULD** use dedicated OS users or containers where available.
   - The engine **MUST NOT** assume stdio children are benign; enforce timeouts, output size limits, and connection lifecycle consistent with implementation issues and RFC security guidance ([RFC-07](../../RFC/rfc-07-security-model.md)).
   - **Restart and health** behavior is implementation-defined but **MUST** preserve append-only history and deterministic replay (completed activities are not re-invoked on replay—see conformance/replay work).
5. **Audit and redaction:**
   - Command/event history remains the **audit trail** for orchestration; operators **SHOULD** configure logging and retention to match policy.
   - Implementations **SHOULD** support redaction or omission of sensitive fragments in persisted events and tool error surfaces where feasible; full enterprise DLP is **out of scope** for R2 (see non-goals).
6. **When engine-direct is forbidden vs host-mediated** (decision guide):
   - **Require host-mediated** when the deployment cannot accept the engine process holding MCP credentials, when regulatory context requires human-in-the-loop hosts for external access, when untrusted third parties supply workflow definitions to a shared engine, or when child-process or network egress from the engine is disallowed.
   - **Engine-direct may be used** when a dedicated automation worker owns the same trust as the tools it calls, workflows and definitions are operator-controlled, and blast radius is accepted and monitored.

## Considered options

| Option | Summary | Why not primary |
|--------|---------|-----------------|
| A — Document only in RFC | Keep norms exclusively in RFC-06/RFC-07 | Insufficient for repo-specific manifest alignment, replay, and CI/governance gates |
| B — Large addendum to ADR-0002 | Single ADR for both profiles | Blurs default-assistant vs automation narrative; harder to review |
| C — Standalone ADR (chosen) | This ADR-0003 | Extra file; clearer ownership for engine-direct security |

## Consequences

- **Positive:** Implementers of MCP bridges and MCP stdio modes have explicit security and configuration rules; conformance can cite replay/non-reinvoke expectations.
- **Negative:** Operators must read and apply profile guidance; engine-direct is not “zero config secure.”
- **Specification:** [RFC-06 §6.1](../../RFC/rfc-06-interoperability.md#61-composing-mcp) remains normative for protocol wording; this ADR adds **repository reference-engine** obligations and deployment guidance.

## Non-goals (R2)

- A full **multi-tenant secret service**, HSM integration, or organization-wide policy DSL.
- **Network zero-trust** enforcement inside the engine beyond reasonable timeouts, TLS where applicable, and operator-supplied allowlists (may be incremental post-R2).
- **Formal verification** of MCP servers or tool implementations.
- **Universal** redaction/DLP guarantees across all tool payloads and logs.

## Governance alignment (`docs/governance/spec-architecture-governance.md`)

| Gate | Engine-direct–related evidence |
|------|----------------------------------|
| **Gate A (Intake)** | Use case for automation/engine-owned tools; explicit pointer to [RFC-06 §6.1](../../RFC/rfc-06-interoperability.md#61-composing-mcp); initial risk note (credentials, child processes, egress). |
| **Gate B (Build ready)** | This ADR linked; affected surfaces listed (MCP adapter, executor port, manifest loader, conformance); runway dependencies (for example parent ADR-0002) linked on the issue graph. |
| **Gate C (Merge ready)** | PR traceability section complete; behavior or contract changes accompanied by docs/tests/conformance per the implementing issue; material topology changes reflected in `as-is-system-overview.md` and as-built diagrams when applicable. |

## Follow-up

- Implementation: MCP manifest alignment, `ActivityExecutor` bridge, engine-direct MCP stdio profile, conformance replay invariants (tracked as child issues under the R2 epic).
- Review after first engine-direct default path ships: revisit timeouts, size limits, and redaction hooks against operational feedback.

## References

- [ADR-0002 — Host-mediated activity execution](ADR-0002-host-mediated-activity-execution.md) (default posture and hybrid context)
- [RFC-06 — Interoperability, §6.1](../../RFC/rfc-06-interoperability.md#61-composing-mcp)
- [RFC-07 — Security model](../../RFC/rfc-07-security-model.md)
- `docs/architecture/as-is-system-overview.md`
- `docs/poc-scope.md`, `ROADMAP.md`
- `docs/governance/spec-architecture-governance.md`
