/**
 * @typedef {"in_process" | "host_mediated"} ActivityExecutionMode
 */

/**
 * @typedef {{
 *   parallel_node_id: string;
 *   join_target_id: string;
 *   branch_name: string;
 *   branch_entry_node_id: string;
 * }} WorkflowParallelSpanTransport
 */

/**
 * @typedef {{
 *   ok: true;
 *   result?: Record<string, unknown>;
 *   delegate_correlation_id?: string;
 *   external_task_id?: string;
 * }} ActivityOutcomeSuccessTransport
 */

/**
 * @typedef {{
 *   ok: false;
 *   error: string;
 *   code?: string;
 * }} ActivityOutcomeFailureTransport
 */

/**
 * @typedef {ActivityOutcomeSuccessTransport | ActivityOutcomeFailureTransport} ActivityOutcomeTransport
 */

/**
 * @typedef {{
 *   execution_id: string;
 *   status: "completed" | "failed" | "interrupted" | "awaiting_activity";
 *   final_state?: Record<string, unknown>;
 *   result?: unknown;
 *   error?: string;
 *   node_id?: string;
 *   state?: Record<string, unknown>;
 *   parallel_span?: WorkflowParallelSpanTransport;
 *   agent_id?: string;
 *   protocol?: string;
 *   delegate_input?: Record<string, unknown>;
 *   delegate_correlation_id?: string;
 * }} WorkflowStartResultTransport
 */

/**
 * @typedef {{
 *   execution_id: string;
 *   phase: "running" | "completed" | "failed" | "interrupted" | "awaiting_activity";
 *   current_node_id?: string;
 *   last_error?: string;
 *   delegate_correlation_id?: string;
 *   child_execution_id?: string;
 *   parent_execution_id?: string;
 *   agent_id?: string;
 *   protocol?: string;
 *   delegate_input?: Record<string, unknown>;
 * }} WorkflowStatusResultTransport
 */

/**
 * @typedef {{
 *   execution_id: string;
 *   status: "completed" | "failed" | "interrupted" | "awaiting_activity";
 *   final_state?: Record<string, unknown>;
 *   result?: unknown;
 *   error?: string;
 *   node_id?: string;
 *   state?: Record<string, unknown>;
 *   parallel_span?: WorkflowParallelSpanTransport;
 *   agent_id?: string;
 *   protocol?: string;
 *   delegate_input?: Record<string, unknown>;
 *   delegate_correlation_id?: string;
 * }} WorkflowResumeResultTransport
 */

/**
 * @typedef {{
 *   execution_id: string;
 *   status: "completed" | "failed" | "interrupted" | "awaiting_activity";
 *   final_state?: Record<string, unknown>;
 *   result?: unknown;
 *   error?: string;
 *   node_id?: string;
 *   state?: Record<string, unknown>;
 *   parallel_span?: WorkflowParallelSpanTransport;
 *   code?: string;
 *   agent_id?: string;
 *   protocol?: string;
 *   delegate_input?: Record<string, unknown>;
 *   delegate_correlation_id?: string;
 * }} WorkflowSubmitActivityResultTransport
 */

/**
 * @typedef {{
 *   wf_id: string;
 *   definition: object;
 * }} RegisterDefinitionResultTransport
 */

export {};
