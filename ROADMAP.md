# Agent Workflow Protocol Roadmap

Last updated: 2026-06-24 (synced with [Linear workflows project](https://linear.app/ben-van-den-bergh/project/workflows-a5eb475ff80e/overview) and `docs/releases/alpha-release-notes.md`)

This roadmap translates the full RFC scope (`docs/RFC/`) into sequenced, workable releases after the delivered POC alpha scope (7 epics, summarized in `docs/releases/alpha-release-notes.md`).

## Delivery status (repository + Linear)

| Release | Engine / repo status | Linear milestone / issues |
|---|---|---|
| **POC alpha** | **Delivered** — lighthouse + conformance baseline (`docs/releases/alpha-release-notes.md`, pre-`v0.1.1` cuts) | Not tracked in Linear (pre-migration scope) |
| **R2 Beta** | **Delivered** — `@agent-workflow/engine@0.1.1` (`parallel`, `wait`, `set_state`, unified graph walker) | Not tracked in Linear |
| **R3 RC** | **Delivered** — native `agent_delegate` + `subworkflow`, REST/SDK parity, production A2A adapter, interop guides, v1 conformance vectors in CI | Milestone **R3 RC — Interop & delegation closure** — complete |
| **R4 GA 1.0** | **Delivered** — `@agent-workflow/engine@1.0.0` (`v1.0.0` tag): runtime stub replacement, security v1, control plane, GA E2E + v1 conformance gate | Milestone **R4 GA 1.0** — [BEN-81](https://linear.app/ben-van-den-bergh/issue/BEN-81) epic tree complete; umbrella [BEN-5](https://linear.app/ben-van-den-bergh/issue/BEN-5) closes on release |
| **R5 1.1** | **Not started** (later horizon) | Milestone **R5 1.1** — 0% progress; issues [BEN-6](https://linear.app/ben-van-den-bergh/issue/BEN-6), [BEN-7](https://linear.app/ben-van-den-bergh/issue/BEN-7), [BEN-9](https://linear.app/ben-van-den-bergh/issue/BEN-9), [BEN-12](https://linear.app/ben-van-den-bergh/issue/BEN-12) — all **Backlog** |

Linear currently holds **R4–R5 only** (migrated from GitHub); R2/R3 completion is reflected here and in release notes, not as Linear milestones. See `.project-planning.yaml` and `.claude/skills/wf-plan/references/linear-project-operating-model.md`.

## Planning assumptions

- **Current baseline:** [`@agent-workflow/engine@1.0.0`](https://www.npmjs.com/package/@agent-workflow/engine) implements the v1 profile in [`docs/engine-profile.md`](docs/engine-profile.md): full core orchestration, native delegation/composition, REST/SDK/MCP integration surfaces, security v1, and GA conformance (`npm run conformance:v1`). Host-mediated and engine-direct activity execution per [ADR-0003](docs/architecture/adr/ADR-0003-engine-direct-mcp-activity-execution.md).
- **Next planning focus:** **R5 1.1** (scale, operations, production operability). Runway items (e.g. [BEN-118](https://linear.app/ben-van-den-bergh/issue/BEN-118)) carry to post-GA.
- This roadmap prioritizes vertical value slices while maintaining architectural runway for durability, interoperability, and governance.
- Release names are planning labels; semantic versions are assigned during release planning.

## Release strategy overview

| Horizon | Release | Status | Intent |
|---|---|---|---|
| Done | **POC alpha** | Delivered | RFC subset, reference engine, MCP stdio, lighthouse demo |
| Done | **R2 Beta - Full Core Orchestration** | Delivered (`v0.1.1`) | `parallel`, `wait`, `set_state`, replay/checkpoint hardening |
| In progress | **R3 RC - Delegation and Composition** | Delivered (`v0.1.2`–`v1.0.0`) | Native `agent_delegate` / `subworkflow`; REST/SDK; production A2A; v1 conformance |
| **Done** | **R4 GA 1.0 - Protocol and Runtime Stabilization** | Delivered (`v1.0.0`) | v1 contract freeze, security baseline, conformance bar, adoption DX |
| Later | **R5 1.1 - Scale and Operations** | Not started (Linear backlog) | Production operability, performance, tenancy, policy controls |
| Longer term | **Future prospects** | — | Ecosystem and standards expansion once v1 is stable and adopted |

## R2 Beta - Full Core Orchestration

**Status: delivered** (`@agent-workflow/engine@0.1.1`, 2026-05-17). R2 core orchestration for the Node.js reference engine ships in the unified graph walker with conformance coverage for parallel joins, timers, and `set_state`. Remaining RFC-08 aspirational items (for example full reducer-matrix conformance, additional MCP mock roundtrip vectors) may still be deferred; see `conformance/README.md` and `docs/releases/alpha-release-notes.md`.

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
- Reference engine path for **engine-direct** activity execution (MCP client integration and bounded local command adapters) with operator configuration that can **align with or translate** common MCP host manifest formats, complementing host-mediated assistant integration ([ADR-0002](docs/architecture/adr/ADR-0002-host-mediated-activity-execution.md) evolution note).

### Exit criteria

- Reference workflow #2 (research + summarize parallelism) runs end-to-end with conformance coverage.
- Beta release notes explicitly state remaining non-GA limitations.

## R3 RC - Delegation and Composition

**Status: partially delivered** (`@agent-workflow/engine@0.1.2`, 2026-05-17). Native node types, schema bundle, walker/runtime (`delegate-executor.mjs`, `subworkflow-runtime.mjs`), mock A2A lifecycle, and R3 golden fixtures (`examples/r3-multi-agent-coding.workflow.json`, conformance schema/replay vectors) are in repo and CI. **Still open for RC closure:** REST/OpenAPI surface, TypeScript/Python SDK parity with MCP, production A2A adapter and mapping guide, LangGraph/import adapter, and documented assistant-host + automation-platform integration paths (see exit criteria below). Not tracked as Linear issues today.

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

**Status: delivered** (`@agent-workflow/engine@1.0.0`, 2026-06-24). Linear milestone [R4 GA 1.0](https://linear.app/ben-van-den-bergh/project/workflows-a5eb475ff80e/overview) — [BEN-81](https://linear.app/ben-van-den-bergh/issue/BEN-81) epic tree complete; release gate [BEN-89](https://linear.app/ben-van-den-bergh/issue/BEN-89) merged in PR #100.

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

**Status: not started (later horizon).** Linear milestone [R5 1.1](https://linear.app/ben-van-den-bergh/project/workflows-a5eb475ff80e/overview) — 0% progress; issues [BEN-6](https://linear.app/ben-van-den-bergh/issue/BEN-6) (umbrella), [BEN-7](https://linear.app/ben-van-den-bergh/issue/BEN-7), [BEN-9](https://linear.app/ben-van-den-bergh/issue/BEN-9), [BEN-12](https://linear.app/ben-van-den-bergh/issue/BEN-12) are **Backlog**. Planning posture: defer execution until v1 stabilization (R4) is far enough along to avoid optimizing unstable contracts.

### Outcome

Move from single-node reference posture to production-grade operational posture.

### Scope

- Runtime scale improvements:
  - Worker pool and queue abstractions for activity execution.
  - Throughput and latency targets with benchmark suite.
  - Optional alternate durable stores (while preserving event semantics).
  - Execution list API (`listExecutions`): reference SQLite store scans all execution ids and replays full history per id for phase projection — add an execution-summary index or materialized view before high-volume deployments.
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

To keep momentum and traceability with `/project-planning` (backlog SSOT: [Linear workflows project](https://linear.app/ben-van-den-bergh/project/workflows-a5eb475ff80e/overview); see `.project-planning.yaml`), convert each release into:

- 1 release umbrella epic (goal, scope, exit criteria).
- 3-6 feature epics (runtime, schema/conformance, interfaces, security, docs/governance).
- 1 mandatory architecture-runway epic per release (testability, compatibility, operability).

This keeps feature delivery and architectural runway explicitly balanced rather than implicit.

## External references used to shape roadmap practices

- SAFe architectural runway guidance (intentional architecture + emergent design balance): [Scaled Agile - Architectural Runway](https://framework.scaledagile.com/blog/glossary_term/architectural-runway-2)
- Product/platform roadmap governance patterns (outcome focus, dependency-aware sequencing): [Aha! platform roadmap practices](https://aha.io/support/roadmaps/strategic-roadmaps/best-practices/best-practices-manage-product-platforms)
- Adjacent workflow standards context for longer-term interoperability: [CNCF Serverless Workflow Specification](https://github.com/serverlessworkflow/specification)
