# Agent Workflow Protocol Roadmap

Last updated: 2026-04-14

This roadmap translates the full RFC scope (`docs/RFC/`) into sequenced, workable releases after the delivered POC alpha scope (7 epics, summarized in `docs/releases/alpha-release-notes.md`).

## Planning assumptions

- Current baseline: POC scope is released (`start`, `end`, `step`, `llm_call`, `tool_call`, `switch`, `interrupt`) with schema validation, conformance harness, and Node.js engine package.
- This roadmap prioritizes vertical value slices while maintaining architectural runway for durability, interoperability, and governance.
- Release names are planning labels; semantic versions are assigned during release planning.

## Release strategy overview

| Horizon | Release | Intent |
|---|---|---|
| Near term | **R2 Beta - Full Core Orchestration** | Close major RFC execution-model gaps (`parallel`, `wait`, `set_state`, stronger replay/checkpoint guarantees). |
| Near term | **R3 RC - Delegation and Composition** | Add `agent_delegate` and `subworkflow`, plus richer cross-runtime interoperability. |
| Mid term | **R4 GA 1.0 - Protocol and Runtime Stabilization** | Freeze v1 contracts, security baseline, conformance bar, and multi-surface SDK/API readiness. |
| Mid term | **R5 1.1 - Scale and Operations** | Improve production operability, performance, tenancy, and policy-driven controls. |
| Longer term | **Future prospects** | Ecosystem and standards expansion once v1 is stable and adopted. |

## R2 Beta - Full Core Orchestration

### Outcome

Deliver the full single-runtime orchestration surface from RFC-03 and RFC-04 before multi-agent/delegation depth.

### Scope

- Node types promoted from deferred list:
  - `parallel` with `all`, `any`, `n_of_m` joins.
  - `wait` (`duration`, `until`, `signal`) with durable timer commands/events.
  - `set_state` for declarative state mutations.
- Execution model hardening:
  - Full command/event taxonomy for parallel/timer semantics.
  - Determinism checks for replay divergence.
  - Checkpoint policy options beyond baseline (at least `after_each_node` + configurable intervals).
- Schema/profile maturity:
  - Publish updated schema bundle for promoted node types.
  - Define jq conformance subset/profile for portability.
  - Expand conformance vectors for reducers, joins, timers, and replay.

### Architectural runway (must ship in parallel)

- Deterministic orchestration contract tests in CI (history-prefix replay invariants).
- Durable storage abstraction boundary (SQLite default + pluggable interface, even if single backend initially).
- Event schema versioning strategy for forward-compatible history readers.

### Exit criteria

- Reference workflow #2 (research + summarize parallelism) runs end-to-end with conformance coverage.
- Beta release notes explicitly state remaining non-GA limitations.

## R3 RC - Delegation and Composition

### Outcome

Enable multi-agent and nested orchestration patterns while preserving replayability and auditability.

### Scope

- Node types:
  - Native `agent_delegate` lifecycle support (beyond `tool_call` bridge mode).
  - Native `subworkflow` parent/child execution correlation.
- Interoperability:
  - A2A mapping guide for delegated task lifecycle and correlation IDs.
  - LangGraph/graph import adapter with compatibility report.
  - Clarified backend compilation profile (e.g., durable runtime mapping) without changing canonical semantics.
- Integration interfaces:
  - REST surface to parity with MCP controls and execution history introspection.
  - TypeScript SDK parity with Python SDK for start/status/resume/streaming.

### Architectural runway (must ship in parallel)

- Correlation and tracing model across parent/child/delegated runs (W3C trace propagation).
- Contract-test harness for adapter parity (MCP vs REST vs SDK behavior).
- Compatibility policy for bridge-mode to native-delegate migration.

### Exit criteria

- Reference workflow #3 (multi-agent coding task) runs against native delegation semantics.
- Interop docs include at least one assistant-host and one automation-platform integration path.

## R4 GA 1.0 - Protocol and Runtime Stabilization

### Outcome

Publish a stable v1 protocol/runtime contract with a clear adopter bar and governance posture.

### Scope

- Spec and contract stability:
  - Finalize protocol naming and schema URI namespace.
  - Freeze v1 JSON schema bundle and version negotiation behavior.
  - Publish migration notes from alpha/beta/rc to GA.
- Security baseline (v1 required profile):
  - Scoped auth tokens and action-level authorization.
  - Secret reference and redaction defaults in execution/audit logs.
  - Definition signing profile (at least optional but documented and testable).
- Developer experience and adoption:
  - "First successful execution in <5 minutes" quickstart target.
  - Tagged conformance suite and certification-like "passes v1 profile" result.
  - Release governance: changelog, compatibility matrix, deprecation policy.

### Architectural runway (must ship in parallel)

- Backward compatibility gates in CI (schema diff + API breaking-change checks).
- Security threat-model regression checklist for new node and adapter features.
- Formal profile model (core vs optional features) to prevent scope creep in v1.

### Exit criteria

- Two independent integration surfaces demonstrate interoperable execution of canonical JSON.
- Conformance suite is green for tagged GA artifacts.

## R5 1.1 - Scale and Operations

### Outcome

Move from single-node reference posture to production-grade operational posture.

### Scope

- Runtime scale improvements:
  - Worker pool and queue abstractions for activity execution.
  - Throughput and latency targets with benchmark suite.
  - Optional alternate durable stores (while preserving event semantics).
- Operations and platform controls:
  - Multi-tenant isolation patterns and policy controls.
  - Extended observability (SLO dashboards, retry/failure analytics).
  - Disaster-recovery and backup/restore runbooks.
- Governance evolution:
  - Release trains and LTS policy options.
  - Candidate process for extension proposals and profile promotion.

### Architectural runway (must ship in parallel)

- Capacity model and load-test scenarios integrated into CI/nightly.
- Versioned operational runbooks tied to release artifacts.
- Cost-aware execution controls (timeouts, concurrency, per-tenant quotas).

### Exit criteria

- Documented and tested operating envelope for production-like deployments.
- Platform operators can validate reliability/security posture with reproducible checks.

## Future prospects (post-1.1 context)

- **Standards alignment expansion:** deeper formal mapping with CNCF Serverless Workflow and adjacent standards where semantics align (especially wait/event/parallel/subflow patterns).
- **Foundation trajectory:** pursue neutral governance home after sustained multi-platform adoption and conformance maturity.
- **Policy-as-code ecosystem:** richer extension registry for org policy, compliance gates, and domain-specific node profiles without fragmenting core semantics.
- **Enterprise topology options:** geographically distributed control plane/storage patterns once single-region operational maturity is proven.

## Suggested planning conversion to epics

To keep momentum and traceability with `/project-planning`, convert each release into:

- 1 release umbrella epic (goal, scope, exit criteria).
- 3-6 feature epics (runtime, schema/conformance, interfaces, security, docs/governance).
- 1 mandatory architecture-runway epic per release (testability, compatibility, operability).

This keeps feature delivery and architectural runway explicitly balanced rather than implicit.

## External references used to shape roadmap practices

- SAFe architectural runway guidance (intentional architecture + emergent design balance): [Scaled Agile - Architectural Runway](https://framework.scaledagile.com/blog/glossary_term/architectural-runway-2)
- Product/platform roadmap governance patterns (outcome focus, dependency-aware sequencing): [Aha! platform roadmap practices](https://aha.io/support/roadmaps/strategic-roadmaps/best-practices/best-practices-manage-product-platforms)
- Adjacent workflow standards context for longer-term interoperability: [CNCF Serverless Workflow Specification](https://github.com/serverlessworkflow/specification)
