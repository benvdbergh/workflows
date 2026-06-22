export type ActivityExecutionMode = "in_process" | "host_mediated";

export interface WorkflowParallelSpanTransport {
  parallel_node_id: string;
  join_target_id: string;
  branch_name: string;
  branch_entry_node_id: string;
}

export type ActivityOutcomeTransport =
  | {
      ok: true;
      result?: Record<string, unknown>;
      delegate_correlation_id?: string;
      external_task_id?: string;
    }
  | {
      ok: false;
      error: string;
      code?: string;
    };

export interface WorkflowStartResultTransport {
  execution_id: string;
  status: "completed" | "failed" | "interrupted" | "awaiting_activity";
  final_state?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  node_id?: string;
  state?: Record<string, unknown>;
  parallel_span?: WorkflowParallelSpanTransport;
  agent_id?: string;
  protocol?: string;
  delegate_input?: Record<string, unknown>;
  delegate_correlation_id?: string;
}

export interface WorkflowStatusResultTransport {
  execution_id: string;
  phase: "running" | "completed" | "failed" | "interrupted" | "awaiting_activity";
  current_node_id?: string;
  last_error?: string;
  delegate_correlation_id?: string;
  child_execution_id?: string;
  parent_execution_id?: string;
  agent_id?: string;
  protocol?: string;
  delegate_input?: Record<string, unknown>;
}

export interface WorkflowResumeResultTransport {
  execution_id: string;
  status: "completed" | "failed" | "interrupted" | "awaiting_activity";
  final_state?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  node_id?: string;
  state?: Record<string, unknown>;
  parallel_span?: WorkflowParallelSpanTransport;
  agent_id?: string;
  protocol?: string;
  delegate_input?: Record<string, unknown>;
  delegate_correlation_id?: string;
}

export interface WorkflowSubmitActivityResultTransport {
  execution_id: string;
  status: "completed" | "failed" | "interrupted" | "awaiting_activity";
  final_state?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  node_id?: string;
  state?: Record<string, unknown>;
  parallel_span?: WorkflowParallelSpanTransport;
  code?: string;
  agent_id?: string;
  protocol?: string;
  delegate_input?: Record<string, unknown>;
  delegate_correlation_id?: string;
}

export interface RegisterDefinitionResultTransport {
  wf_id: string;
  definition: object;
}

export interface WorkflowStartOptions {
  wfId?: string;
  wf_id?: string;
  definition?: object;
  executionId?: string;
  execution_id?: string;
  input?: Record<string, unknown>;
  activityExecutionMode?: ActivityExecutionMode;
  activity_execution_mode?: ActivityExecutionMode;
  allowExistingExecutionId?: boolean;
  allow_existing_execution_id?: boolean;
}

export interface WorkflowStatusOptions {
  executionId?: string;
  execution_id?: string;
}

export interface WorkflowResumeOptions {
  executionId?: string;
  execution_id?: string;
  definition: object;
  resumePayload?: Record<string, unknown>;
  resume_payload?: Record<string, unknown>;
  activityExecutionMode?: ActivityExecutionMode;
  activity_execution_mode?: ActivityExecutionMode;
}

export interface WorkflowSubmitActivityOptions {
  executionId?: string;
  execution_id?: string;
  definition: object;
  input?: Record<string, unknown>;
  nodeId?: string;
  node_id?: string;
  outcome: ActivityOutcomeTransport;
  parallelSpan?: WorkflowParallelSpanTransport;
  parallel_span?: WorkflowParallelSpanTransport;
  activityExecutionMode?: ActivityExecutionMode;
  activity_execution_mode?: ActivityExecutionMode;
}

export interface WorkflowClientRestOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  port?: WorkflowApplicationPort;
}

export interface WorkflowApplicationPort {
  startWorkflow(request: {
    executionId?: string;
    definition: object;
    input: Record<string, unknown>;
    activityExecutionMode?: ActivityExecutionMode;
    allowExistingExecutionId?: boolean;
  }): Promise<{
    executionId: string;
    status: string;
    finalState?: Record<string, unknown>;
    result?: unknown;
    error?: string;
    code?: string;
    nodeId?: string;
    state?: Record<string, unknown>;
    parallelSpan?: {
      parallelNodeId: string;
      joinTargetId: string;
      branchName: string;
      branchEntryNodeId: string;
    };
    agentId?: string;
    protocol?: string;
    delegateInput?: Record<string, unknown>;
    delegateCorrelationId?: string;
  }>;
  getWorkflowStatus(request: { executionId: string }): Promise<{
    executionId: string;
    phase: string;
    currentNodeId?: string;
    lastError?: string;
    delegateCorrelationId?: string;
    childExecutionId?: string;
    parentExecutionId?: string;
    agentId?: string;
    protocol?: string;
    delegateInput?: Record<string, unknown>;
  }>;
  resumeWorkflow(request: {
    executionId: string;
    definition: object;
    resumePayload: Record<string, unknown>;
    activityExecutionMode?: ActivityExecutionMode;
  }): Promise<{
    executionId: string;
    status: string;
    finalState?: Record<string, unknown>;
    result?: unknown;
    error?: string;
    code?: string;
    nodeId?: string;
    state?: Record<string, unknown>;
    parallelSpan?: {
      parallelNodeId: string;
      joinTargetId: string;
      branchName: string;
      branchEntryNodeId: string;
    };
    agentId?: string;
    protocol?: string;
    delegateInput?: Record<string, unknown>;
    delegateCorrelationId?: string;
  }>;
  submitWorkflowActivity(request: {
    executionId: string;
    definition: object;
    input: Record<string, unknown>;
    nodeId: string;
    outcome:
      | { ok: true; result?: Record<string, unknown>; delegateCorrelationId?: string; externalTaskId?: string }
      | { ok: false; error: string; code?: string };
    expectedParallelSpan?: {
      parallelNodeId: string;
      joinTargetId: string;
      branchName: string;
      branchEntryNodeId: string;
    };
    activityExecutionMode?: ActivityExecutionMode;
  }): Promise<{
    executionId: string;
    status: string;
    finalState?: Record<string, unknown>;
    result?: unknown;
    error?: string;
    code?: string;
    nodeId?: string;
    state?: Record<string, unknown>;
    parallelSpan?: {
      parallelNodeId: string;
      joinTargetId: string;
      branchName: string;
      branchEntryNodeId: string;
    };
    agentId?: string;
    protocol?: string;
    delegateInput?: Record<string, unknown>;
    delegateCorrelationId?: string;
  }>;
}

export declare class SdkError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown);
}

export declare class WorkflowClient {
  constructor(options?: WorkflowClientRestOptions);
  static fromPort(port: WorkflowApplicationPort): WorkflowClient;
  registerDefinition(definition: object): Promise<RegisterDefinitionResultTransport>;
  start(options: WorkflowStartOptions): Promise<WorkflowStartResultTransport>;
  getStatus(options: WorkflowStatusOptions): Promise<WorkflowStatusResultTransport>;
  resume(options: WorkflowResumeOptions): Promise<WorkflowResumeResultTransport>;
  submitActivity(options: WorkflowSubmitActivityOptions): Promise<WorkflowSubmitActivityResultTransport>;
}
