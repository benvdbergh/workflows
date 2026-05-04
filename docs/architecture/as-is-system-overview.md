# As-Is System Overview (POC Alpha Baseline)

Last updated: 2026-05-04
Status: Current implementation baseline (not a target architecture). The Node.js reference engine at **`@agent-workflow/engine@0.1.0-alpha.3`** implements the **POC + R2** profile ([`docs/poc-scope.md`](../poc-scope.md)), including **host-mediated** and **engine-direct** `tool_call` execution per [ADR-0002](adr/ADR-0002-host-mediated-activity-execution.md) and [ADR-0003](adr/ADR-0003-engine-direct-mcp-activity-execution.md). **Assistant-class** deployments still favor host-mediated activities; engine-direct is for operator/automation profiles. See `ROADMAP.md` for R3+ targets (`agent_delegate`, `subworkflow`, REST/SDK parity).

## Purpose

Document the current implementation state of the Agent Workflow Protocol repository as a shared baseline for:

- Future design-first increments.
- Structured ADR authoring.
- Release planning and architecture runway decisions (R3 onward).

This is an as-is snapshot. RFC documents remain the normative target contract.

## Architecture viewpoints (as-is baseline)

This document is structured using practical architecture viewpoints for the current implementation state:

1. **Context and scope viewpoint**: protocol intent, active POC boundary, and repo role.
2. **Building block viewpoint**: functional components and internal dependencies.
3. **Deployment/physical viewpoint**: process topology and runtime communication paths.
4. **Runtime behavior viewpoint**: validate/execute, interrupt/resume, and host invocation flows.
5. **Evolution viewpoint**: known gaps from current POC to roadmap targets.

Primary diagram artifacts:

- `docs/architecture/as-built-views.drawio` (as-is architecture viewpoints)
- `docs/architecture/rfc-target-views.drawio` (target-state architecture viewpoints)

## System context

The repository currently acts as:

1. Protocol specification source (`docs/RFC/`).
2. POC contract and fixtures (`docs/poc-scope.md`, `schemas/`, `examples/`).
3. Executable Node.js reference package (`packages/engine/`).
4. Quality gate and replay checks (`conformance/`, CI workflows).

Current architecture is intentionally optimized for POC learning speed and deterministic behavior over broad feature completeness.

## Current implementation scope (what exists)

### Workflow execution profile

Supported node types in active engine path:

- `start`
- `end`
- `step`
- `llm_call`
- `tool_call`
- `switch`
- `interrupt`
- `parallel`
- `wait`
- `set_state`

Explicitly **out of scope** for the current engine profile (see `docs/poc-scope.md` §2.1):

- `agent_delegate`
- `subworkflow`

Source of truth for this boundary: `docs/poc-scope.md`.

### Runtime and storage

- Engine runtime is implemented in Node.js (`@agent-workflow/engine` package).
- Execution history is append-only via an application port:
  - SQLite adapter (`node:sqlite`) for durable local history.
  - In-memory adapter for tests and lightweight runs.
- Orchestration follows deterministic replay-oriented command/event progression.
- Checkpoint events are emitted in the POC walker at deterministic boundaries.

### Activity execution boundary (as-implemented vs target)

- **As-implemented (reference package):** `step`, `llm_call`, and `tool_call` are driven through an injectable **`ActivityExecutor`** port. Default **`activityExecutionMode: "in_process"`** runs the executor immediately after `ActivityRequested`. With **`activityExecutionMode: "host_mediated"`**, the POC walker **returns** after persisting `ActivityRequested` (`status: "awaiting_activity"`); the host calls **`submitActivityOutcome`** (application port **`submitWorkflowActivity`**) to append `ActivityCompleted` / `ActivityFailed` and continue via the same deterministic replay path used for crash recovery. Parallel branches include **`parallelSpan`** on the request and yield payload for correlation. The shipped MCP stdio binary still defaults to in-process stub execution; a control-plane submit tool is tracked separately (see RFC-05 / ADR-0002 follow-ups).
- **Target (assistant-class):** **Host-mediated execution** per [ADR-0002](adr/ADR-0002-host-mediated-activity-execution.md): the engine records `ActivityRequested` and yields; the **MCP host** runs tools or model calls, then submits results on a control-plane callback (see `docs/RFC/rfc-05-integration-interfaces.md`, section 5.2). **Hybrid** in-process executors remain valid for tests or embedded profiles, not the default assumption for IDE/assistant hosts.
- **Target (reference engine — automation):** The engine **invokes** configured MCP **tools/call** (and **MAY** invoke bounded local command handlers where the deployment profile allows) inside the runtime during `in_process` activity execution, without requiring the conversational host to submit each outcome. Credential and server definitions **SHOULD** be alignable with host-side manifest formats (for example IDE `mcp.json`-style descriptors) so operators can avoid parallel, unrelated secret graphs where policy permits.
- **Positioning:** Host-mediated paths mirror Cursor-class clients (host owns tools and credentials for that profile). Engine-direct paths target unattended and automation scenarios while preserving **deterministic** next-step selection from the graph and state, not a free-form agent loop inside the engine.

### Interfaces and surfaces

- CLI validation entrypoint (`workflows-engine`).
- MCP stdio adapter (`workflows-engine-mcp`) exposing:
  - `workflow_start`
  - `workflow_status`
  - `workflow_resume`
  - `workflow_submit_activity` (host-mediated continuation; see RFC-05 section 5.2 and ADR-0002)

The MCP adapter maps tool DTOs to the internal application port and returns structured tool errors with stable codes.

### Validation and conformance

- Schema validation is aligned across script, package, and CI.
- Conformance harness currently covers:
  - Valid/invalid schema vectors.
  - Replay prefix/tail deterministic behavior checks.
- Some RFC-08 conformance areas are intentionally partial/deferred in the current profile.

## Logical building blocks (as implemented)

1. **Contract layer**
   - RFC docs and POC scope note define semantics and active subset.
   - JSON schema enforces definition-time constraints.
2. **Execution core**
   - Walkers (`linear` and general POC) produce command/event histories.
   - Reducer application and state validation occur during node completion.
3. **Persistence boundary**
   - `ExecutionHistoryStore` abstraction with SQLite and memory implementations.
4. **Integration adapter**
   - MCP stdio server translates host calls to execution operations.
5. **Quality and governance**
   - Conformance vectors and repo validation scripts serve as regression gates.

## Building block viewpoint (functional components)

The as-is building block view is captured in:

- `docs/architecture/as-built-views.drawio` (page: `AS-IS Building Block View`)

Functional component groups:

- **Contract/definition**
  - RFC and POC scope documents.
  - POC JSON schema contract.
- **Validation**
  - Engine validation and CLI surfaces.
  - Repo-level validation script and CI gate integration.
- **Application/orchestration**
  - Application port.
  - POC runner (`run`/`resume`) and linear runner.
  - Activity execution boundary and replay loader.
- **Persistence**
  - `ExecutionHistoryStore` abstraction and concrete memory/SQLite implementations.
- **Integration**
  - MCP stdio server and tool contracts/error mapping.
- **Quality/conformance**
  - Conformance runner and vectors used for deterministic regression checks.

## Deployment/physical viewpoint

The as-is deployment/physical view is captured in:

- `docs/architecture/as-built-views.drawio` (page: `AS-IS Deployment View`)

Physical/runtime perspectives shown:

- **Operator host mode**
  - MCP host invokes published `workflows-engine-mcp` over stdio.
  - Engine process runs application port and POC runner with in-memory history by default.
  - Optional package fetch and optional SQLite persistence path.
- **Local development mode**
  - MCP host invokes local `node .../mcp-stdio-server.mjs`.
  - Same runtime interaction shape with local file and optional SQLite persistence.
- **Conformance/CI context**
  - Validation, conformance, and tests execute against the same core runtime boundaries.
- **Deferred note in view**
  - Explicitly marks deferred runtime families to avoid implying active implementation.

## Primary runtime flows

### Flow A: Validate and execute workflow

1. Definition validated against POC schema and static constraints.
2. Execution starts with input-bound initial state.
3. Nodes are scheduled and completed/fail with command/event recording.
4. State updates are merged using reducer policies.
5. Execution terminates as completed, failed, or interrupted.

### Flow B: Interrupt and resume

1. Engine reaches `interrupt` node and raises interrupt events.
2. Execution pauses with persisted context.
3. Resume payload is validated against `resume_schema`.
4. On valid resume, execution continues via static successor.
5. Invalid or stale resume attempts fail with typed failure reasons.

### Flow C: MCP host operation

1. Host invokes `workflow_start` with definition and input.
2. Adapter runs orchestration through application port.
3. Host polls `workflow_status`.
4. Host uses `workflow_resume` for interrupt continuation.

### Flow D: Host-mediated activity (ADR-0002; engine path implemented)

1. Engine reaches an activity node with `activityExecutionMode: "host_mediated"`, appends `ActivityRequested` (including optional **`parallelSpan`** inside a `parallel` branch), and returns **`awaiting_activity`** with `nodeId`, workflow **`state`**, and matching **`parallelSpan`** when applicable.
2. Engine does **not** call `ActivityExecutor` for that node until history already contains a completion (replay) or the host has submitted an outcome.
3. Host performs MCP/LLM/`step` work out of band, then calls **`submitActivityOutcome`** / **`submitWorkflowActivity`** with the same **`input`** as the original start (for replay reconstruction), **`nodeId`**, optional **`expectedParallelSpan`**, and success or failure payload.
4. Engine appends **`ActivityCompleted`** or **`ActivityFailed`**; on success it continues the graph via **`runPocWorkflow`** replay (same mechanism as mid-run recovery). **`workflow_status`** reports phase **`awaiting_activity`** when the latest non-checkpoint event is **`ActivityRequested`**.
5. On **replay**, completed activities are satisfied from persisted history (no second host round-trip for the same node).

## Architecture strengths in current state

- Clear protocol-to-POC boundary through `docs/poc-scope.md`.
- Deterministic command/event model with replay-oriented design.
- Stable adapter boundary (`createWorkflowApplicationPort`) reducing coupling.
- Explicit conformance harness as part of the delivery contract.
- Practical local/operator split for MCP deployment model.
- Checkpoints after R2 parallel branch steps carry a **`parallelSpan`** correlation object (parallel node id, join target, branch name, branch entry) alongside inline state snapshots.

## Known gaps and intentional limitations

- `agent_delegate` and `subworkflow` remain deferred for this profile (R3+).
- Host-mediated **submit** is exposed on the reference MCP stdio adapter (`workflow_submit_activity`). **Engine-direct** MCP or command execution with manifest-aligned configuration in that adapter remains **roadmap** work; activity nodes still use the in-process stub unless a custom `ActivityExecutor` is injected at the application port.
- Conformance coverage is not yet full RFC-08 breadth.
- Security hardening posture is intentionally POC-level for local stdio scenarios.
- Multi-surface parity (REST/SDK breadth) is roadmap scope, not as-is baseline.

## Candidate architecture viewpoints for next phase

Use this as-is baseline to derive versioned viewpoints:

1. **Context view**: protocol contract, engine, host integrations, operator boundary.
2. **Refined component view**: split orchestration internals and adapter surfaces by bounded responsibilities.
3. **Runtime behavior view**: normal execution, replay recovery, interrupt/resume sequence.
4. **Evolution view**: gap-to-roadmap mapping from POC profile to `R2-R5`.

## ADR bootstrap guidance

Start ADRs from real tension points observed in this baseline:

- Host-mediated vs in-process activity execution (see [ADR-0002](adr/ADR-0002-host-mediated-activity-execution.md)).
- Node coverage expansion strategy (R3 delegation/subworkflow, richer join/timer matrices) without replay regressions.
- Checkpointing and replay guarantees versus performance/cost.
- Adapter surface parity strategy (MCP first, REST/SDK sequencing).
- Contract versioning and compatibility gates for GA stabilization.

Each ADR should link:

- Relevant RFC sections.
- `docs/poc-scope.md` delta impact.
- Conformance additions required to prove the decision.

## Evidence references

- `docs/architecture/adr/ADR-0002-host-mediated-activity-execution.md`
- `packages/engine/README.md`
- `conformance/README.md`
- `docs/poc-scope.md`
- `docs/RFC/rfc-04-execution-model.md`
- `docs/RFC/rfc-08-reference-implementation.md`
- `ROADMAP.md`
