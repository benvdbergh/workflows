# Integration parity matrix

Normative orchestration behavior lives in `createWorkflowApplicationPort` ([RFC-05 §5.1](https://github.com/benvdbergh/workflows/blob/master/docs/RFC/rfc-05-integration-interfaces.md)). Adapters (MCP, REST, SDK) MUST map to the same lifecycle semantics. The conformance harness under `conformance/vectors/parity/` proves **application port ↔ MCP ↔ REST ↔ SDK (port transport)** equivalence via normalized JSON snapshots (in-process; no stdio HTTP in CI).

## Lifecycle operations

| Scenario ID | MCP tool | Port method | RFC-05 REST | SDK (`WorkflowClient`) | Conformance vector |
|-------------|----------|-------------|-------------|------------------------|-------------------|
| Start execution | `workflow_start` | `startWorkflow` | `POST /v1/workflows/{wf_id}/executions` | `start` | `parity.*` start steps |
| Observe phase | `workflow_status` | `getWorkflowStatus` | `GET /v1/executions/{exec_id}` | `getStatus` | all parity vectors with `status` steps |
| Continue interrupt | `workflow_resume` | `resumeWorkflow` | `POST /v1/executions/{exec_id}:resume` | `resume` | `parity.r2.interrupt_resume` |
| Complete host activity | `workflow_submit_activity` | `submitWorkflowActivity` | `POST /v1/executions/{exec_id}:submit_activity` | `submitActivity` | `parity.r2.host_mediated_submit`, `parity.r2.host_mediated_lighthouse_classify`, `parity.r2.parallel_join` |
| Deliver signal to wait | `workflow_signal` | `signalWorkflow` | — | — | `parity.r4.signal_wait` |
| Cooperative cancel | `workflow_cancel` | `cancelWorkflow` | `POST /v1/executions/{exec_id}:cancel` | — | `parity.r4.signal_cancel` |
| List executions | `workflow_list` | `listWorkflowExecutions` | — | — | `parity.r4.list_executions` |

### Core orchestration parity (implemented)

| Vector | Workflow fixture | Surfaces exercised |
|--------|------------------|-------------------|
| `parity.r2.linear_complete` | `examples/lighthouse-customer-routing.workflow.json` | port, MCP, REST, SDK (port transport) — start → completed; status → completed |
| `parity.r2.interrupt_resume` | lighthouse | port, MCP, REST, SDK — start → interrupted; status; resume → completed |
| `parity.r2.host_mediated_submit` | `examples/conformance-host-activity-linear.workflow.json` | port, MCP, REST, SDK — start → awaiting_activity; submit → completed |
| `parity.r2.host_mediated_lighthouse_classify` | `examples/lighthouse-customer-routing.workflow.json` | port, MCP, REST, SDK — host_mediated start → classify submit → open_ticket submit → completed |
| `parity.r2.parallel_join` | `examples/conformance-host-activity-parallel.workflow.json` | port, MCP, REST, SDK — start with `parallel_span`; submit with span correlation → completed |

### Signal wait parity (port + MCP)

| Vector | Workflow fixture | Surfaces exercised |
|--------|------------------|-------------------|
| `parity.r4.signal_wait` | `examples/conformance-signal-wait.workflow.json` | port, MCP — start → awaiting_signal; status; signal → completed |

### Cancel parity (port + MCP)

| Vector | Workflow fixture | Surfaces exercised |
|--------|------------------|-------------------|
| `parity.r4.signal_cancel` | `examples/conformance-signal-wait.workflow.json` | port, MCP — start → awaiting_signal; cancel → cancelled; status → cancelled |

### List executions parity (port + MCP)

| Vector | Workflow fixture | Surfaces exercised |
|--------|------------------|-------------------|
| `parity.r4.list_executions` | `examples/conformance-signal-wait.workflow.json` | port, MCP — multiple starts; list with phase filter |

### Composition parity (port + MCP; REST/SDK deferred to R3 vectors)

| Vector | Workflow fixture | Surfaces exercised |
|--------|------------------|-------------------|
| `parity.r3.delegate_status_correlation` | `examples/conformance-agent-delegate-linear.workflow.json` | port, MCP — start → completed; status includes `delegate_correlation_id` |
| `parity.r3.subworkflow_status_correlation` | `examples/conformance-subworkflow-parent.workflow.json` | port, MCP — nested child run; status includes `child_execution_id` / `parent_execution_id` |

### SDK REST transport smoke

`conformance/sdk-parity-smoke.mjs` exercises `WorkflowClient` over in-process RFC-05 REST (`baseUrl`) for the r2 linear-complete lighthouse path. Invoked from `npm run conformance` and standalone via `npm run conformance:parity-sdk`.

## Normalized snapshot format

Harness compares canonical snake_case objects per step:

- Success: `execution_id`, `status` or `phase`, optional `node_id`, `result`, `final_state`, `parallel_span`, `state`, `delegate_correlation_id`, `child_execution_id`, `parent_execution_id`
- Error: `is_error: true`, `error.code` aligned with MCP adapter codes (`VALIDATION_ERROR`, `EXECUTION_NOT_FOUND`, `INVALID_RESUME_PAYLOAD`, `ACTIVITY_SUBMIT_*`, `SIGNAL_*`, `CANCEL_*`, `ENGINE_FAILURE`, `INTERNAL_ERROR`)

REST and SDK surfaces use the same normalized snapshot shape as MCP (`normalizeTransportSnapshot` in `conformance/parity-runner.mjs`).

## Trace propagation

W3C Trace Context fields are **specified** for future surfaces; the parity harness does not require live OTel exporters in CI.

| Field | Where documented | Parity harness |
|-------|------------------|----------------|
| `traceparent` | Optional on `ExecutionStarted` and child/delegate events (RFC-05 §5.6) | Not asserted |
| `delegate_correlation_id` | `workflow_status` when `agent_delegate` history exists | Asserted by `parity.r3.delegate_status_correlation` |
| `child_execution_id` / `parent_execution_id` | `workflow_status` when `subworkflow` history exists | Asserted by `parity.r3.subworkflow_status_correlation` |

Informative command/event prefix narratives remain under `examples/*.trace.*.json` (not harness-validated). Parity vectors use live port/MCP/REST/SDK responses as the executable contract.

### `workflow_list` pagination (MCP + port)

- **Sort:** newest `updated_at` first (last history row `created_at`), tie-break `execution_id` ascending.
- **Page size:** `limit` optional, default **50**, maximum **100**.
- **Cursor:** opaque string `updated_at|execution_id` from the prior page’s `next_cursor`; omit on the first request.
- **Filters:** `phase` (status projection), optional `definition_name` (`ExecutionStarted.workflowName`), optional `updated_after` / `updated_before` (ISO 8601 inclusive bounds on `updated_at`).

## Running parity checks

From repository root:

```bash
npm run conformance
npm run conformance:parity-sdk   # SDK REST transport smoke only
```

Parity vectors are discovered with schema/replay vectors under `conformance/vectors/` (`kind: "parity"`). CI fails on adapter semantic drift when any surface snapshot diverges from the port baseline.

## Changelog (process)

| Date | Note |
|------|------|
| R3 interop | Extended parity harness with REST and SDK (port transport) for `parity.r2.*` vectors; SDK REST smoke via `sdk-parity-smoke.mjs`. |
| R3 runway | Added delegate/subworkflow status correlation parity vectors ([#8](https://github.com/benvdbergh/workflows/issues/8)); runtime for `agent_delegate` ([#6](https://github.com/benvdbergh/workflows/issues/6)) and `subworkflow` ([#7](https://github.com/benvdbergh/workflows/issues/7)) precedes status projection. |
