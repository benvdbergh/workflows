# Integration parity matrix

Normative orchestration behavior lives in `createWorkflowApplicationPort` ([RFC-05 §5.1](https://github.com/benvdbergh/workflows/blob/master/docs/RFC/rfc-05-integration-interfaces.md)). Adapters (MCP today; REST/SDK forecast) MUST map to the same lifecycle semantics. The conformance harness under `conformance/vectors/parity/` proves **application port ↔ MCP tool handler** equivalence via normalized JSON snapshots (in-process; no stdio HTTP in CI).

## Lifecycle operations

| Scenario ID | MCP tool | Port method | RFC-05 REST (planned) | Conformance vector |
|-------------|----------|-------------|------------------------|-------------------|
| Start execution | `workflow_start` | `startWorkflow` | `POST /v1/workflows/{wf_id}/executions` | `parity.*` start steps |
| Observe phase | `workflow_status` | `getWorkflowStatus` | `GET /v1/executions/{exec_id}` | all parity vectors with `status` steps |
| Continue interrupt | `workflow_resume` | `resumeWorkflow` | `POST /v1/executions/{exec_id}:resume` | `parity.r2.interrupt_resume` |
| Complete host activity | `workflow_submit_activity` | `submitWorkflowActivity` | (host-mediated; REST TBD) | `parity.r2.host_mediated_submit`, `parity.r2.parallel_join` |

### Core orchestration parity (implemented)

| Vector | Workflow fixture | Surfaces exercised |
|--------|------------------|-------------------|
| `parity.r2.linear_complete` | `examples/lighthouse-customer-routing.workflow.json` | start → completed; status → completed |
| `parity.r2.interrupt_resume` | lighthouse | start → interrupted; status; resume → completed |
| `parity.r2.host_mediated_submit` | `examples/conformance-host-activity-linear.workflow.json` | start → awaiting_activity; submit → completed |
| `parity.r2.parallel_join` | `examples/conformance-host-activity-parallel.workflow.json` | start with `parallel_span`; submit with span correlation → completed |

### Composition parity (implemented)

| Vector | Workflow fixture | Surfaces exercised |
|--------|------------------|-------------------|
| `parity.r3.delegate_status_correlation` | `examples/conformance-agent-delegate-linear.workflow.json` | start → completed; status includes `delegate_correlation_id` |
| `parity.r3.subworkflow_status_correlation` | `examples/conformance-subworkflow-parent.workflow.json` | nested child run; status includes `child_execution_id` / `parent_execution_id` |

## Normalized snapshot format

Harness compares canonical snake_case objects per step:

- Success: `execution_id`, `status` or `phase`, optional `node_id`, `result`, `final_state`, `parallel_span`, `state`, `delegate_correlation_id`, `child_execution_id`, `parent_execution_id`
- Error: `is_error: true`, `error.code` aligned with MCP adapter codes (`VALIDATION_ERROR`, `EXECUTION_NOT_FOUND`, `INVALID_RESUME_PAYLOAD`, `ACTIVITY_SUBMIT_*`, `ENGINE_FAILURE`, `INTERNAL_ERROR`)

## Trace propagation

W3C Trace Context fields are **specified** for future surfaces; the parity harness does not require live OTel exporters in CI.

| Field | Where documented | Parity harness |
|-------|------------------|----------------|
| `traceparent` | Optional on `ExecutionStarted` and child/delegate events (RFC-05 §5.6) | Not asserted |
| `delegate_correlation_id` | `workflow_status` when `agent_delegate` history exists | Asserted by `parity.r3.delegate_status_correlation` |
| `child_execution_id` / `parent_execution_id` | `workflow_status` when `subworkflow` history exists | Asserted by `parity.r3.subworkflow_status_correlation` |

Informative command/event prefix narratives remain under `examples/*.trace.*.json` (not harness-validated). Parity vectors use live port/MCP responses as the executable contract.

## Deferred MCP tools (RFC-05 §5.2)

Not in MCP adapter or parity matrix until committed: `workflow_cancel`, `workflow_signal`, `workflow_list`.

## Running parity checks

From repository root:

```bash
npm run conformance
```

Parity vectors are discovered with schema/replay vectors under `conformance/vectors/` (`kind: "parity"`).

## Changelog (process)

| Date | Note |
|------|------|
| R3 runway | Added delegate/subworkflow status correlation parity vectors ([#8](https://github.com/benvdbergh/workflows/issues/8)); runtime for `agent_delegate` ([#6](https://github.com/benvdbergh/workflows/issues/6)) and `subworkflow` ([#7](https://github.com/benvdbergh/workflows/issues/7)) precedes status projection. |
