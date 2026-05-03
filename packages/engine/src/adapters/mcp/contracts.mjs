import { z } from "zod";

/**
 * Adapter mapping contract for MCP EPIC-4 minimum toolset.
 * These schemas are transport-facing; application core uses workflow application port DTOs.
 */
export const activityExecutionModeSchema = z.enum(["in_process", "host_mediated"]);

export const workflowStartArgsSchema = z.object({
  execution_id: z.string().min(1).optional(),
  definition: z.object({}).passthrough(),
  input: z.object({}).passthrough(),
  activity_execution_mode: activityExecutionModeSchema.optional(),
});

export const workflowStatusArgsSchema = z.object({
  execution_id: z.string().min(1),
});

export const workflowResumeArgsSchema = z.object({
  execution_id: z.string().min(1),
  definition: z.object({}).passthrough(),
  resume_payload: z.object({}).passthrough(),
  activity_execution_mode: activityExecutionModeSchema.optional(),
});

export const workflowParallelSpanSchema = z.object({
  parallel_node_id: z.string(),
  join_target_id: z.string(),
  branch_name: z.string(),
  branch_entry_node_id: z.string(),
});

const activityOutcomeSuccessSchema = z.object({
  ok: z.literal(true),
  result: z.object({}).passthrough().optional(),
});

const activityOutcomeFailureSchema = z.object({
  ok: z.literal(false),
  error: z.string().min(1),
  code: z.string().optional(),
});

export const activityOutcomeSchema = z.discriminatedUnion("ok", [
  activityOutcomeSuccessSchema,
  activityOutcomeFailureSchema,
]);

export const workflowSubmitActivityArgsSchema = z.object({
  execution_id: z.string().min(1),
  definition: z.object({}).passthrough(),
  input: z.object({}).passthrough(),
  node_id: z.string().min(1),
  outcome: activityOutcomeSchema,
  parallel_span: workflowParallelSpanSchema.optional(),
  activity_execution_mode: activityExecutionModeSchema.optional(),
});

export const workflowStartResultSchema = z.object({
  execution_id: z.string(),
  status: z.enum(["completed", "failed", "interrupted", "awaiting_activity"]),
  final_state: z.object({}).passthrough().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  node_id: z.string().optional(),
  state: z.object({}).passthrough().optional(),
  parallel_span: workflowParallelSpanSchema.optional(),
});

export const workflowStatusResultSchema = z.object({
  execution_id: z.string(),
  phase: z.enum(["running", "completed", "failed", "interrupted", "awaiting_activity"]),
  current_node_id: z.string().optional(),
  last_error: z.string().optional(),
});

export const workflowResumeResultSchema = z.object({
  execution_id: z.string(),
  status: z.enum(["completed", "failed", "interrupted", "awaiting_activity"]),
  final_state: z.object({}).passthrough().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  node_id: z.string().optional(),
  state: z.object({}).passthrough().optional(),
  parallel_span: workflowParallelSpanSchema.optional(),
});

export const workflowSubmitActivityResultSchema = z.object({
  execution_id: z.string(),
  status: z.enum(["completed", "failed", "interrupted", "awaiting_activity"]),
  final_state: z.object({}).passthrough().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  node_id: z.string().optional(),
  state: z.object({}).passthrough().optional(),
  parallel_span: workflowParallelSpanSchema.optional(),
  code: z.string().optional(),
});
