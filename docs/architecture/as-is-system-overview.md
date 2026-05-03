# As-Is System Overview (POC Alpha Baseline)

Last updated: 2026-04-14
Status: Current implementation baseline (not a target architecture)

## Purpose

Document the current implementation state of the Agent Workflow Protocol repository as a shared baseline for:

- Future design-first increments.
- Structured ADR authoring.
- Release planning and architecture runway decisions (`R2` onward).

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

Deferred in current POC runtime profile:

- `parallel`
- `agent_delegate`
- `subworkflow`
- `wait`
- `set_state`

Source of truth for this boundary: `docs/poc-scope.md`.

### Runtime and storage

- Engine runtime is implemented in Node.js (`@agent-workflow/engine` package).
- Execution history is append-only via an application port:
  - SQLite adapter (`node:sqlite`) for durable local history.
  - In-memory adapter for tests and lightweight runs.
- Orchestration follows deterministic replay-oriented command/event progression.
- Checkpoint events are emitted in the POC walker at deterministic boundaries.

### Interfaces and surfaces

- CLI validation entrypoint (`workflows-engine`).
- MCP stdio adapter (`workflows-engine-mcp`) exposing:
  - `workflow_start`
  - `workflow_status`
  - `workflow_resume`

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

## Architecture strengths in current state

- Clear protocol-to-POC boundary through `docs/poc-scope.md`.
- Deterministic command/event model with replay-oriented design.
- Stable adapter boundary (`createWorkflowApplicationPort`) reducing coupling.
- Explicit conformance harness as part of the delivery contract.
- Practical local/operator split for MCP deployment model.
- Checkpoints after R2 parallel branch steps carry a **`parallelSpan`** correlation object (parallel node id, join target, branch name, branch entry) alongside inline state snapshots.

## Known gaps and intentional limitations

- Active runtime implements R2 core nodes (`parallel`, `wait`, `set_state`) in the reference engine; `agent_delegate` and `subworkflow` remain deferred (R3+).
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

- Node coverage expansion strategy (R3 delegation/subworkflow, richer join/timer matrices) without replay regressions.
- Checkpointing and replay guarantees versus performance/cost.
- Adapter surface parity strategy (MCP first, REST/SDK sequencing).
- Contract versioning and compatibility gates for GA stabilization.

Each ADR should link:

- Relevant RFC sections.
- `docs/poc-scope.md` delta impact.
- Conformance additions required to prove the decision.

## Evidence references

- `packages/engine/README.md`
- `conformance/README.md`
- `docs/poc-scope.md`
- `docs/RFC/rfc-04-execution-model.md`
- `docs/RFC/rfc-08-reference-implementation.md`
- `ROADMAP.md`
