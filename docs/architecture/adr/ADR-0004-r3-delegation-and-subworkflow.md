# ADR-0004: R3 native delegation and subworkflow composition

**Status:** Accepted  
**Date:** 2026-05-17  
**Tags:** execution-model, composition, A2A, replay, R3

## Context

R2 delivered core orchestration (`parallel`, `wait`, `set_state`) on a flat `executionId` history spine. RFC-03 Example C and RFC-04 §4.9 require **native `agent_delegate`** and **`subworkflow`** nodes with auditable parent/child correlation—not `tool_call` shims. Epic [#5](https://github.com/benvdbergh/workflows/issues/5) promotes both types into the reference engine profile while preserving **append-only, replayable** history ([ADR-0001](ADR-0001-poc-foundation-decisions.md)).

**Problems:**

1. Delegation semantics were emulated via `tool_call` bridges without stable `delegateCorrelationId` / `externalTaskId` fields.
2. Nested workflows had no distinct child `executionId` or `StartSubworkflow` / `SubworkflowCompleted` events.
3. Replay must not re-invoke delegate adapters or re-run children when completion events exist in the prefix.

## Decision

### 1. `subworkflow` (parent/child execution)

1. **Schema:** `config.workflow_ref` (required) and `config.input_mapping` (required); optional `version_pin` per RFC-03.
2. **Child identity:** `childExecutionId = {parentExecutionId}:sub:{nodeId}` (deterministic for tests and replay).
3. **Commands/events:** `StartSubworkflow` → `SubworkflowStarted` → nested `runGraphWorkflow` → `SubworkflowCompleted` → `CompleteSubworkflow`.
4. **Merge policy:** On child success, shallow-merge child `finalState` into parent state.
5. **Failure:** Child `ExecutionFailed` fails the parent node.
6. **Resolution:** In-process registry (`workflow-ref-resolver.mjs`); built-in `urn:awp:wf:unit-tests` → `examples/r3-unit-tests-child.workflow.json`.
7. **Depth limit:** Default max nested depth **4**.
8. **Replay:** `SubworkflowCompleted` indexed by `nodeId`; tail replay must not re-run child.

### 2. `agent_delegate` (delegation lifecycle)

1. **Schema:** Required `config.agent_id`, `config.protocol` (`a2a` | `mcp` | `sdk`), `config.input_mapping`.
2. **Separate port:** `DelegateExecutor` in `delegate-executor.mjs`—not overloaded onto `ActivityExecutor`.
3. **History shape (R3 RC):** `ActivityRequested` / `ActivityCompleted` with `delegateCorrelationId`, `externalTaskId`, `nodeType: "agent_delegate"`.
4. **R3 mock A2A:** In-process `MockA2ADelegateExecutor` (single-shot completed output for CI).
5. **Bridge migration:** `docs/engine-profile.md` §2.2 maps `tool_call` agent tools → native node.
6. **Replay:** Prefix `ActivityCompleted` skips delegate port invocation.

### 3. Cross-cutting

- No new top-level workflow document keys.
- Parent cancel → child propagation **deferred** (R4+).
- `workflow_status` correlation fields are **#8** runway (parity vectors stay `pending` until status shape lands).

## Consequences

- **Positive:** Example C validates and runs; conformance replay vectors lock non-reinvoke invariants.
- **Negative:** Status API lacks correlation until #8; mock A2A is not production-interop.
- **Supersedes:** ADR-0001 deferred-node list for `agent_delegate` and `subworkflow`.

## Follow-up

- [#8](https://github.com/benvdbergh/workflows/issues/8): status fields + parity vector flip.
- Epic #5: full Example C e2e conformance with interrupt resume to completed.

## References

- RFC-03, RFC-04 §4.9, RFC-06 §6.2
- `docs/engine-profile.md`
- `subworkflow-runtime.mjs`, `delegate-runtime.mjs`, `delegate-executor.mjs`
