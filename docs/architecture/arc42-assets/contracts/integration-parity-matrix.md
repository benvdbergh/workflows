# Integration parity matrix (R3 runway)

Normative orchestration behavior lives in `createWorkflowApplicationPort` ([RFC-05 §5.1](https://github.com/benvdbergh/workflows/blob/master/docs/RFC/rfc-05-integration-interfaces.md)). Adapters (MCP today; REST/SDK forecast) MUST map to the same lifecycle semantics. The conformance harness under `conformance/vectors/parity/` proves **application port ↔ MCP tool handler** equivalence via normalized JSON snapshots (in-process; no stdio HTTP in CI).

## Lifecycle operations (R2 baseline)

| Scenario ID | MCP tool | Port method | RFC-05 REST (planned) | Conformance vector |
|-------------|----------|-------------|------------------------|-------------------|
| Start execution | `workflow_start` | `startWorkflow` | `POST /v1/workflows/{wf_id}/executions` | `parity.r2.*` |
| Observe phase | `workflow_status` | `getWorkflowStatus` | `GET /v1/executions/{exec_id}` | all R2 parity vectors |
| Continue interrupt | `workflow_resume` | `resumeWorkflow` | `POST /v1/executions/{exec_id}:resume` | `parity.r2.interrupt_resume` |
| Complete host activity | `workflow_submit_activity` | `submitWorkflowActivity` | (host-mediated; REST TBD) | `parity.r2.host_mediated_submit`, `parity.r2.parallel_join` |

### R2 parity scenarios (implemented)

| Vector | Workflow fixture | Surfaces exercised |
|--------|------------------|-------------------|
| `parity.r2.linear_complete` | `examples/lighthouse-customer-routing.workflow.json` | start → completed; status → completed |
| `parity.r2.interrupt_resume` | lighthouse | start → interrupted; status; resume → completed |
| `parity.r2.host_mediated_submit` | `examples/conformance-host-activity-linear.workflow.json` | start → awaiting_activity; submit → completed |
| `parity.r2.parallel_join` | `examples/conformance-host-activity-parallel.workflow.json` | start with `parallel_span`; submit with span correlation → completed |

### R3 placeholders (pending — must not false-green)

| Vector | Blocked by | Expected status fields (when implemented) |
|--------|------------|---------------------------------------------|
| `parity.r3.delegate_status_correlation` | [#6](https://github.com/benvdbergh/workflows/issues/6) | `delegate_correlation_id`, A2A task linkage |
| `parity.r3.subworkflow_status_correlation` | [#8](https://github.com/benvdbergh/workflows/issues/8) (runtime [#7](https://github.com/benvdbergh/workflows/issues/7) done) | `child_execution_id`, `parent_execution_id` |

## Normalized snapshot format

Harness compares canonical snake_case objects per step:

- Success: `execution_id`, `status` or `phase`, optional `node_id`, `result`, `final_state`, `parallel_span`, `state`
- Error: `is_error: true`, `error.code` aligned with MCP adapter codes (`VALIDATION_ERROR`, `EXECUTION_NOT_FOUND`, `INVALID_RESUME_PAYLOAD`, `ACTIVITY_SUBMIT_*`, `ENGINE_FAILURE`, `INTERNAL_ERROR`)

## Trace propagation (R3 spec baseline)

W3C Trace Context fields are **specified** for R3+ surfaces; the R3 runway harness does not require live OTel exporters in CI.

| Field | Where documented | R3 CI behavior |
|-------|------------------|----------------|
| `traceparent` | Optional on `ExecutionStarted` and child/delegate events (RFC-05 §5.6) | No-op / not asserted until tracing story lands |
| `delegate_correlation_id` | `workflow_status` when `agent_delegate` active | Pending #6 |
| `child_execution_id` / `parent_execution_id` | `workflow_status` / history when `subworkflow` active | In history events; **status projection pending #8** |

Informative command/event prefix narratives remain under `examples/*.trace.*.json` (not harness-validated). Parity vectors use live port/MCP responses as the executable contract.

## Deferred MCP tools (RFC-05 §5.2)

Not in POC MCP adapter or parity matrix until committed: `workflow_cancel`, `workflow_signal`, `workflow_list`.

## Running parity checks

From repository root:

```bash
npm run conformance
```

Parity vectors are discovered with schema/replay vectors under `conformance/vectors/` (`kind: "parity"`).
