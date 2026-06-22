import {
  workflowResumeResultSchema,
  workflowStartResultSchema,
  workflowStatusResultSchema,
  workflowSubmitActivityResultSchema,
  workflowSignalResultSchema,
} from "./mcp/contracts.mjs";

/**
 * @param {Record<string, unknown>} parsed
 */
function awaitingDelegateFieldsFromPort(parsed) {
  return {
    ...(parsed.agentId !== undefined ? { agent_id: parsed.agentId } : {}),
    ...(parsed.protocol !== undefined ? { protocol: parsed.protocol } : {}),
    ...(parsed.delegateInput !== undefined ? { delegate_input: parsed.delegateInput } : {}),
    ...(parsed.delegateCorrelationId !== undefined
      ? { delegate_correlation_id: parsed.delegateCorrelationId }
      : {}),
  };
}

function awaitingSignalFieldsFromPort(parsed) {
  return {
    ...(parsed.signalName !== undefined ? { signal_name: parsed.signalName } : {}),
  };
}

/**
 * @param {{ parallelNodeId: string; joinTargetId: string; branchName: string; branchEntryNodeId: string } | undefined} parallelSpan
 */
function parallelSpanToTransport(parallelSpan) {
  if (!parallelSpan) return {};
  return {
    parallel_span: {
      parallel_node_id: parallelSpan.parallelNodeId,
      join_target_id: parallelSpan.joinTargetId,
      branch_name: parallelSpan.branchName,
      branch_entry_node_id: parallelSpan.branchEntryNodeId,
    },
  };
}

/**
 * @param {unknown} parsed
 */
export function startResponseFromPort(parsed) {
  const response = {
    execution_id: parsed.executionId,
    status: parsed.status,
    ...(parsed.finalState !== undefined ? { final_state: parsed.finalState } : {}),
    ...(parsed.result !== undefined ? { result: parsed.result } : {}),
    ...(parsed.error !== undefined ? { error: parsed.error } : {}),
    ...(parsed.nodeId !== undefined ? { node_id: parsed.nodeId } : {}),
    ...(parsed.state !== undefined ? { state: parsed.state } : {}),
    ...parallelSpanToTransport(parsed.parallelSpan),
    ...awaitingDelegateFieldsFromPort(parsed),
    ...awaitingSignalFieldsFromPort(parsed),
  };
  return workflowStartResultSchema.parse(response);
}

/**
 * @param {unknown} parsed
 */
export function statusResponseFromPort(parsed) {
  const response = {
    execution_id: parsed.executionId,
    phase: parsed.phase,
    ...(parsed.currentNodeId !== undefined ? { current_node_id: parsed.currentNodeId } : {}),
    ...(parsed.lastError !== undefined ? { last_error: parsed.lastError } : {}),
    ...(parsed.delegateCorrelationId !== undefined
      ? { delegate_correlation_id: parsed.delegateCorrelationId }
      : {}),
    ...(parsed.childExecutionId !== undefined ? { child_execution_id: parsed.childExecutionId } : {}),
    ...(parsed.parentExecutionId !== undefined ? { parent_execution_id: parsed.parentExecutionId } : {}),
    ...(parsed.agentId !== undefined ? { agent_id: parsed.agentId } : {}),
    ...(parsed.protocol !== undefined ? { protocol: parsed.protocol } : {}),
    ...(parsed.delegateInput !== undefined ? { delegate_input: parsed.delegateInput } : {}),
    ...awaitingSignalFieldsFromPort(parsed),
  };
  return workflowStatusResultSchema.parse(response);
}

/**
 * @param {unknown} parsed
 */
export function resumeResponseFromPort(parsed) {
  const response = {
    execution_id: parsed.executionId,
    status: parsed.status,
    ...(parsed.finalState !== undefined ? { final_state: parsed.finalState } : {}),
    ...(parsed.result !== undefined ? { result: parsed.result } : {}),
    ...(parsed.error !== undefined ? { error: parsed.error } : {}),
    ...(parsed.nodeId !== undefined ? { node_id: parsed.nodeId } : {}),
    ...(parsed.state !== undefined ? { state: parsed.state } : {}),
    ...parallelSpanToTransport(parsed.parallelSpan),
    ...awaitingDelegateFieldsFromPort(parsed),
    ...awaitingSignalFieldsFromPort(parsed),
  };
  return workflowResumeResultSchema.parse(response);
}

/**
 * @param {unknown} parsed
 */
export function submitActivityResponseFromPort(parsed) {
  const response = {
    execution_id: parsed.executionId,
    status: parsed.status,
    ...(parsed.finalState !== undefined ? { final_state: parsed.finalState } : {}),
    ...(parsed.result !== undefined ? { result: parsed.result } : {}),
    ...(parsed.error !== undefined ? { error: parsed.error } : {}),
    ...(parsed.nodeId !== undefined ? { node_id: parsed.nodeId } : {}),
    ...(parsed.state !== undefined ? { state: parsed.state } : {}),
    ...(parsed.code !== undefined ? { code: parsed.code } : {}),
    ...parallelSpanToTransport(parsed.parallelSpan),
    ...awaitingDelegateFieldsFromPort(parsed),
    ...awaitingSignalFieldsFromPort(parsed),
  };
  return workflowSubmitActivityResultSchema.parse(response);
}

/**
 * @param {unknown} parsed
 */
export function signalResponseFromPort(parsed) {
  const response = {
    execution_id: parsed.executionId,
    status: parsed.status,
    ...(parsed.finalState !== undefined ? { final_state: parsed.finalState } : {}),
    ...(parsed.result !== undefined ? { result: parsed.result } : {}),
    ...(parsed.error !== undefined ? { error: parsed.error } : {}),
    ...(parsed.nodeId !== undefined ? { node_id: parsed.nodeId } : {}),
    ...(parsed.state !== undefined ? { state: parsed.state } : {}),
    ...(parsed.code !== undefined ? { code: parsed.code } : {}),
    ...parallelSpanToTransport(parsed.parallelSpan),
    ...awaitingDelegateFieldsFromPort(parsed),
    ...awaitingSignalFieldsFromPort(parsed),
  };
  return workflowSignalResultSchema.parse(response);
}

/**
 * @param {import("../persistence/types.mjs").HistoryRow} row
 */
export function historyRowToTransport(row) {
  return {
    seq: row.seq,
    kind: row.kind,
    name: row.name,
    payload: row.payload,
    ...(row.createdAt !== undefined ? { created_at: row.createdAt } : {}),
    ...(row.recordSchemaVersion !== undefined ? { record_schema_version: row.recordSchemaVersion } : {}),
  };
}
