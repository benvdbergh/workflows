import { z } from "zod";

/**
 * Adapter mapping contract for MCP EPIC-4 minimum toolset.
 * These schemas are transport-facing; application core uses workflow application port DTOs.
 */
export const workflowStartArgsSchema = z.object({
  execution_id: z.string().min(1).optional(),
  definition: z.object({}).passthrough(),
  input: z.object({}).passthrough(),
});

export const workflowStatusArgsSchema = z.object({
  execution_id: z.string().min(1),
});

export const workflowResumeArgsSchema = z.object({
  execution_id: z.string().min(1),
  definition: z.object({}).passthrough(),
  resume_payload: z.object({}).passthrough(),
});

export const workflowStartResultSchema = z.object({
  execution_id: z.string(),
  status: z.enum(["completed", "failed", "interrupted"]),
  final_state: z.object({}).passthrough().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  node_id: z.string().optional(),
});

export const workflowStatusResultSchema = z.object({
  execution_id: z.string(),
  phase: z.enum(["running", "completed", "failed", "interrupted"]),
  current_node_id: z.string().optional(),
  last_error: z.string().optional(),
});

export const workflowResumeResultSchema = z.object({
  execution_id: z.string(),
  status: z.enum(["completed", "failed", "interrupted"]),
  final_state: z.object({}).passthrough().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  node_id: z.string().optional(),
});
