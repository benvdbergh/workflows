import { ZodError } from "zod";
import {
  workflowResumeArgsSchema,
  workflowCancelArgsSchema,
  workflowStartArgsSchema,
  workflowStatusArgsSchema,
  workflowSubmitActivityArgsSchema,
} from "../mcp/contracts.mjs";
import {
  MCP_ADAPTER_ERROR,
  McpAdapterError,
  normalizeMcpAdapterError,
} from "../mcp/errors.mjs";
import {
  validateWorkflowResumeTransportPayload,
  validateWorkflowStartTransportPayload,
} from "../mcp/transport-validation.mjs";
import {
  historyRowToTransport,
  cancelResponseFromPort,
  resumeResponseFromPort,
  startResponseFromPort,
  statusResponseFromPort,
  submitActivityResponseFromPort,
} from "../transport-response.mjs";
import { DefinitionRegistry } from "./definition-registry.mjs";
import { adapterErrorToHttpBody, httpStatusForAdapterError } from "./errors.mjs";
import { readJsonBody, requestPathname, requestQuery, sendJson } from "./http-utils.mjs";
import {
  authorizeRestRequest,
  extractBearerToken,
  loadControlPlaneAuthConfigFromEnv,
} from "../../security/control-plane-auth.mjs";

const SUBMIT_ACTIVITY_ADAPTER_CODES = new Set([
  MCP_ADAPTER_ERROR.ACTIVITY_SUBMIT_NOT_AWAITING,
  MCP_ADAPTER_ERROR.ACTIVITY_SUBMIT_NODE_MISMATCH,
  MCP_ADAPTER_ERROR.ACTIVITY_SUBMIT_PARALLEL_MISMATCH,
  MCP_ADAPTER_ERROR.SUBMIT_VALIDATION_ERROR,
]);

/**
 * @param {string | undefined} code
 * @param {string | undefined} message
 */
function adapterErrorForStartFailure(code, message) {
  const text = message && message.trim() !== "" ? message : "Workflow start failed.";
  if (code === MCP_ADAPTER_ERROR.VALIDATION_ERROR || code === "VALIDATION_ERROR") {
    return new McpAdapterError(MCP_ADAPTER_ERROR.VALIDATION_ERROR, text, { engineCode: code });
  }
  return new McpAdapterError(MCP_ADAPTER_ERROR.ENGINE_FAILURE, "Engine reported a workflow failure.", {
    cause: text,
  });
}

/**
 * @param {string | undefined} code
 * @param {string | undefined} message
 */
function adapterErrorForResumeFailure(code, message) {
  const text = message && message.trim() !== "" ? message : "Resume request failed.";
  if (code === MCP_ADAPTER_ERROR.INVALID_RESUME_PAYLOAD) {
    return new McpAdapterError(MCP_ADAPTER_ERROR.INVALID_RESUME_PAYLOAD, text);
  }
  return new McpAdapterError(MCP_ADAPTER_ERROR.ENGINE_FAILURE, "Engine reported a workflow failure.", {
    cause: text,
  });
}

/**
 * @param {string | undefined} code
 * @param {string | undefined} message
 */
function adapterErrorForSubmitFailure(code, message) {
  const text = message && message.trim() !== "" ? message : "Activity submit rejected.";
  if (code && SUBMIT_ACTIVITY_ADAPTER_CODES.has(code)) {
    return new McpAdapterError(code, text);
  }
  return new McpAdapterError(MCP_ADAPTER_ERROR.ENGINE_FAILURE, "Engine reported a workflow failure.", {
    cause: text,
  });
}

const CANCEL_ADAPTER_CODES = new Set([
  MCP_ADAPTER_ERROR.CANCEL_NOT_ALLOWED,
  MCP_ADAPTER_ERROR.CANCEL_VALIDATION_ERROR,
  MCP_ADAPTER_ERROR.EXECUTION_NOT_FOUND,
]);

/**
 * @param {string | undefined} code
 * @param {string | undefined} message
 */
function adapterErrorForCancelFailure(code, message) {
  const text = message && message.trim() !== "" ? message : "Cancel request rejected.";
  if (code && CANCEL_ADAPTER_CODES.has(code)) {
    return new McpAdapterError(code, text);
  }
  return new McpAdapterError(MCP_ADAPTER_ERROR.ENGINE_FAILURE, "Engine reported a workflow failure.", {
    cause: text,
  });
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {McpAdapterError} error
 */
function sendAdapterError(res, error) {
  sendJson(res, httpStatusForAdapterError(error.code), adapterErrorToHttpBody(error));
}

/**
 * @param {unknown} error
 * @returns {McpAdapterError}
 */
function adaptCaughtError(error) {
  if (error instanceof ZodError) {
    return new McpAdapterError(MCP_ADAPTER_ERROR.VALIDATION_ERROR, "Invalid request arguments.", {
      issues: error.issues,
    });
  }
  if (error instanceof McpAdapterError) {
    return error;
  }
  if (typeof error?.code === "string") {
    if (error.code === "DUPLICATE_WORKFLOW_ID") {
      return new McpAdapterError("DUPLICATE_WORKFLOW_ID", error.message);
    }
    if (error.code === MCP_ADAPTER_ERROR.DUPLICATE_EXECUTION_ID) {
      return new McpAdapterError(MCP_ADAPTER_ERROR.DUPLICATE_EXECUTION_ID, error.message);
    }
  }
  return normalizeMcpAdapterError(error);
}

/**
 * @param {{
 *   startWorkflow: Function;
 *   getWorkflowStatus: Function;
 *   resumeWorkflow: Function;
 *   submitWorkflowActivity: Function;
 *   cancelWorkflow: Function;
 * }} workflowPort
 * @param {{
 *   definitionRegistry?: DefinitionRegistry;
 *   store?: import("../../persistence/types.mjs").ExecutionHistoryStore;
 *   transportValidation?: import("../mcp/transport-validation.mjs").TransportValidationOptions;
 *   authConfig?: import("../../security/control-plane-auth.mjs").ControlPlaneAuthConfig;
 * }} [deps]
 */
export function createRestWorkflowHandler(workflowPort, deps = {}) {
  const transportValidation = deps.transportValidation ?? {};
  const definitionRegistry = deps.definitionRegistry ?? new DefinitionRegistry({ transportValidation });
  const store = deps.store;
  const authConfig = deps.authConfig ?? loadControlPlaneAuthConfigFromEnv();

  /**
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  return async function restWorkflowHandler(req, res) {
    const method = req.method ?? "GET";
    const pathname = requestPathname(req);

    try {
      if (authConfig.enabled) {
        const authResult = authorizeRestRequest(
          method,
          pathname,
          extractBearerToken(req.headers.authorization),
          authConfig
        );
        if (!authResult.ok) {
          throw new McpAdapterError(authResult.code, authResult.message, authResult.details);
        }
      }

      if (method === "POST" && pathname === "/v1/workflows") {
        const body = await readJsonBody(req);
        if (!body || typeof body !== "object" || Array.isArray(body) || !body.definition) {
          throw new McpAdapterError(MCP_ADAPTER_ERROR.VALIDATION_ERROR, "Request body must include a definition object.");
        }
        const registered = definitionRegistry.register(body.definition);
        sendJson(res, 201, registered);
        return;
      }

      const getWorkflowMatch = pathname.match(/^\/v1\/workflows\/([^/]+)$/);
      if (method === "GET" && getWorkflowMatch) {
        const wfId = decodeURIComponent(getWorkflowMatch[1]);
        const definition = definitionRegistry.get(wfId);
        if (!definition) {
          throw new McpAdapterError("WORKFLOW_NOT_FOUND", `Workflow definition "${wfId}" was not found.`);
        }
        sendJson(res, 200, { wf_id: wfId, definition });
        return;
      }

      const startExecutionMatch = pathname.match(/^\/v1\/workflows\/([^/]+)\/executions$/);
      if (method === "POST" && startExecutionMatch) {
        const wfId = decodeURIComponent(startExecutionMatch[1]);
        const definition = definitionRegistry.get(wfId);
        if (!definition) {
          throw new McpAdapterError("WORKFLOW_NOT_FOUND", `Workflow definition "${wfId}" was not found.`);
        }
        const body = (await readJsonBody(req)) ?? {};
        const parsed = workflowStartArgsSchema.parse({
          execution_id: body.execution_id,
          definition,
          input: body.input ?? {},
          activity_execution_mode: body.activity_execution_mode,
          allow_existing_execution_id: body.allow_existing_execution_id,
        });
        validateWorkflowStartTransportPayload(parsed.definition, parsed.input, transportValidation);
        const response = await workflowPort.startWorkflow({
          executionId: parsed.execution_id,
          definition: parsed.definition,
          input: parsed.input,
          ...(parsed.activity_execution_mode ? { activityExecutionMode: parsed.activity_execution_mode } : {}),
          ...(parsed.allow_existing_execution_id === true ? { allowExistingExecutionId: true } : {}),
        });
        if (response.status === "failed" && response.error) {
          throw adapterErrorForStartFailure(response.code, response.error);
        }
        sendJson(res, 200, startResponseFromPort(response));
        return;
      }

      const statusMatch = pathname.match(/^\/v1\/executions\/([^/]+)$/);
      if (method === "GET" && statusMatch) {
        const executionId = decodeURIComponent(statusMatch[1]);
        const parsed = workflowStatusArgsSchema.parse({ execution_id: executionId });
        const response = await workflowPort.getWorkflowStatus({ executionId: parsed.execution_id });
        sendJson(res, 200, statusResponseFromPort(response));
        return;
      }

      const eventsMatch = pathname.match(/^\/v1\/executions\/([^/]+)\/events$/);
      if (method === "GET" && eventsMatch) {
        if (!store) {
          throw new McpAdapterError(
            MCP_ADAPTER_ERROR.INTERNAL_ERROR,
            "Execution history store is not configured for this REST handler."
          );
        }
        const executionId = decodeURIComponent(eventsMatch[1]);
        const rows = store.listByExecution(executionId);
        if (rows.length === 0) {
          throw new McpAdapterError(MCP_ADAPTER_ERROR.EXECUTION_NOT_FOUND, `Execution "${executionId}" was not found.`);
        }
        const query = requestQuery(req);
        const fromSeq = parseOptionalPositiveInt(query.get("from_seq"));
        const toSeq = parseOptionalPositiveInt(query.get("to_seq"));
        const limit = parseOptionalPositiveInt(query.get("limit")) ?? 100;
        const cursor = parseOptionalPositiveInt(query.get("cursor"));
        const effectiveFromSeq = fromSeq ?? cursor;
        let filtered = store.readRange(executionId, effectiveFromSeq, toSeq);
        if (filtered.length > limit) {
          filtered = filtered.slice(0, limit);
        }
        const events = filtered.map(historyRowToTransport);
        const lastSeq = events.length > 0 ? events[events.length - 1].seq : undefined;
        const hasMore =
          lastSeq !== undefined && store.readRange(executionId, lastSeq + 1, toSeq).length > 0;
        sendJson(res, 200, {
          execution_id: executionId,
          events,
          ...(hasMore && lastSeq !== undefined ? { next_cursor: lastSeq + 1 } : {}),
        });
        return;
      }

      const resumeMatch = pathname.match(/^\/v1\/executions\/([^/]+):resume$/);
      if (method === "POST" && resumeMatch) {
        const executionId = decodeURIComponent(resumeMatch[1]);
        const body = (await readJsonBody(req)) ?? {};
        const parsed = workflowResumeArgsSchema.parse({
          execution_id: executionId,
          definition: body.definition,
          resume_payload: body.resume_payload ?? {},
          activity_execution_mode: body.activity_execution_mode,
        });
        validateWorkflowResumeTransportPayload(parsed.definition, parsed.resume_payload, transportValidation);
        const response = await workflowPort.resumeWorkflow({
          executionId: parsed.execution_id,
          definition: parsed.definition,
          resumePayload: parsed.resume_payload,
          ...(parsed.activity_execution_mode ? { activityExecutionMode: parsed.activity_execution_mode } : {}),
        });
        if (response.status === "failed") {
          throw adapterErrorForResumeFailure(response.code, response.error);
        }
        sendJson(res, 200, resumeResponseFromPort(response));
        return;
      }

      const submitMatch = pathname.match(/^\/v1\/executions\/([^/]+):submit_activity$/);
      if (method === "POST" && submitMatch) {
        const executionId = decodeURIComponent(submitMatch[1]);
        const body = (await readJsonBody(req)) ?? {};
        const parsed = workflowSubmitActivityArgsSchema.parse({
          execution_id: executionId,
          definition: body.definition,
          input: body.input ?? {},
          node_id: body.node_id,
          outcome: body.outcome,
          parallel_span: body.parallel_span,
          activity_execution_mode: body.activity_execution_mode,
        });
        const expectedParallelSpan = parsed.parallel_span
          ? {
              parallelNodeId: parsed.parallel_span.parallel_node_id,
              joinTargetId: parsed.parallel_span.join_target_id,
              branchName: parsed.parallel_span.branch_name,
              branchEntryNodeId: parsed.parallel_span.branch_entry_node_id,
            }
          : undefined;
        const response = await workflowPort.submitWorkflowActivity({
          executionId: parsed.execution_id,
          definition: parsed.definition,
          input: parsed.input,
          nodeId: parsed.node_id,
          outcome:
            parsed.outcome.ok === true
              ? {
                  ok: true,
                  ...(parsed.outcome.result !== undefined ? { result: parsed.outcome.result } : {}),
                  ...(parsed.outcome.delegate_correlation_id !== undefined
                    ? { delegateCorrelationId: parsed.outcome.delegate_correlation_id }
                    : {}),
                  ...(parsed.outcome.external_task_id !== undefined
                    ? { externalTaskId: parsed.outcome.external_task_id }
                    : {}),
                }
              : parsed.outcome,
          ...(expectedParallelSpan ? { expectedParallelSpan } : {}),
          ...(parsed.activity_execution_mode ? { activityExecutionMode: parsed.activity_execution_mode } : {}),
        });
        if (response.status === "failed") {
          throw adapterErrorForSubmitFailure(response.code, response.error);
        }
        sendJson(res, 200, submitActivityResponseFromPort(response));
        return;
      }

      const cancelMatch = pathname.match(/^\/v1\/executions\/([^/]+):cancel$/);
      if (method === "POST" && cancelMatch) {
        const executionId = decodeURIComponent(cancelMatch[1]);
        const body = (await readJsonBody(req)) ?? {};
        const parsed = workflowCancelArgsSchema.parse({
          execution_id: executionId,
          reason: body.reason,
        });
        const response = await workflowPort.cancelWorkflow({
          executionId: parsed.execution_id,
          ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
        });
        if (response.status === "failed") {
          throw adapterErrorForCancelFailure(response.code, response.error);
        }
        sendJson(res, 200, cancelResponseFromPort(response));
        return;
      }

      const checkpointMatch = pathname.match(/^\/v1\/executions\/([^/]+)\/checkpoint$/);
      if (method === "GET" && checkpointMatch) {
        if (!store) {
          throw new McpAdapterError(
            MCP_ADAPTER_ERROR.INTERNAL_ERROR,
            "Execution history store is not configured for this REST handler."
          );
        }
        const executionId = decodeURIComponent(checkpointMatch[1]);
        const rows = store.listByExecution(executionId);
        if (rows.length === 0) {
          throw new McpAdapterError(MCP_ADAPTER_ERROR.EXECUTION_NOT_FOUND, `Execution "${executionId}" was not found.`);
        }
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          const row = rows[i];
          if (row.kind === "event" && row.name === "CheckpointWritten") {
            sendJson(res, 200, {
              execution_id: executionId,
              checkpoint: row.payload,
              seq: row.seq,
              ...(row.createdAt !== undefined ? { created_at: row.createdAt } : {}),
            });
            return;
          }
        }
        throw new McpAdapterError(MCP_ADAPTER_ERROR.EXECUTION_NOT_FOUND, `No checkpoint found for execution "${executionId}".`);
      }

      sendJson(res, 404, {
        error: {
          code: "NOT_FOUND",
          message: `No route for ${method} ${pathname}`,
        },
      });
    } catch (error) {
      sendAdapterError(res, adaptCaughtError(error));
    }
  };
}

/**
 * @param {string | null} value
 * @returns {number | undefined}
 */
function parseOptionalPositiveInt(value) {
  if (value === null || value.trim() === "") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new McpAdapterError(MCP_ADAPTER_ERROR.VALIDATION_ERROR, `Invalid positive integer query parameter: ${value}`);
  }
  return parsed;
}
