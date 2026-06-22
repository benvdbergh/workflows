import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import {
  A2ADelegateExecutor,
  createMcpWorkflowToolHandlers,
  createRestWorkflowHandler,
  createWorkflowApplicationPort,
  DefinitionRegistry,
  MemoryExecutionHistoryStore,
  StubActivityExecutor,
} from "../packages/engine/src/index.mjs";
import { createA2AMockHttpServer } from "../packages/engine/test/helpers/a2a-mock-http-server.mjs";
import { WorkflowClient } from "../packages/sdk/src/index.mjs";
import { SdkError } from "../packages/sdk/src/errors.mjs";

/** @typedef {"port" | "mcp" | "rest" | "sdk"} ParitySurface */

/**
 * @typedef {"start" | "status" | "resume" | "submit_activity" | "signal" | "cancel" | "list"} ParityOp
 */

/**
 * @typedef {object} ParityStep
 * @property {ParityOp} op
 * @property {Record<string, unknown>} [input]
 * @property {Record<string, unknown>} [resumePayload]
 * @property {string} [nodeId]
 * @property {string} [signalName]
 * @property {string} [reason]
 * @property {Record<string, unknown>} [payload]
 * @property {{ ok: true; result?: Record<string, unknown>; delegateCorrelationId?: string; delegate_correlation_id?: string; externalTaskId?: string; external_task_id?: string } | { ok: false; error: string; code?: string }} [outcome]
 * @property {"in_process" | "host_mediated"} [activityExecutionMode]
 * @property {Record<string, Record<string, unknown>>} [stubActivityOutputs]
 * @property {object} [expectedParallelSpan]
 * @property {boolean} [expectError]
 * @property {string} [expectErrorCode]
 * @property {string} [executionId] Override vector execution id (start steps creating multiple runs).
 * @property {string} [listPhase]
 * @property {number} [listLimit]
 * @property {string} [listCursor]
 * @property {Record<string, unknown>} [expect]
 */

/**
 * @param {unknown} listResult
 */
function normalizeListSnapshot(listResult) {
  const r = /** @type {{ executions: Array<{ executionId: string }>; nextCursor?: string }} */ (listResult);
  return {
    op: "list",
    is_error: false,
    execution_count: r.executions.length,
    execution_ids: r.executions.map((item) => item.executionId).sort(),
    ...(r.nextCursor !== undefined ? { next_cursor: r.nextCursor } : {}),
  };
}

/**
 * @typedef {object} ParityVector
 * @property {string} id
 * @property {"parity"} kind
 * @property {string} [description]
 * @property {boolean} [pending]
 * @property {string} [pendingReason]
 * @property {string} definition
 * @property {string} executionId
 * @property {boolean} [useProductionA2ADelegate] When true, wire A2ADelegateExecutor against in-process mock A2A HTTP.
 * @property {Record<string, Record<string, unknown>>} [stubActivityOutputs]
 * @property {ParityStep[]} steps
 */

/**
 * @param {WorkflowParallelSpan | undefined} parallelSpan
 */
function parallelSpanToMcp(parallelSpan) {
  if (!parallelSpan) {
    return undefined;
  }
  return {
    parallel_node_id: parallelSpan.parallelNodeId,
    join_target_id: parallelSpan.joinTargetId,
    branch_name: parallelSpan.branchName,
    branch_entry_node_id: parallelSpan.branchEntryNodeId,
  };
}

/**
 * @param {ParityOp} op
 * @param {unknown} portResult
 * @param {boolean} isError
 * @param {string | undefined} errorCode
 */
function normalizePortSnapshot(op, portResult, isError, errorCode) {
  if (isError) {
    return { op, is_error: true, error: { code: errorCode } };
  }
  const r = /** @type {Record<string, unknown>} */ (portResult);
  if (op === "status") {
    return {
      op,
      is_error: false,
      execution_id: r.executionId,
      phase: r.phase,
      ...(r.currentNodeId !== undefined ? { current_node_id: r.currentNodeId } : {}),
      ...(r.lastError !== undefined ? { last_error: r.lastError } : {}),
      ...(r.delegateCorrelationId !== undefined
        ? { delegate_correlation_id: r.delegateCorrelationId }
        : {}),
      ...(r.agentId !== undefined ? { agent_id: r.agentId } : {}),
      ...(r.protocol !== undefined ? { protocol: r.protocol } : {}),
      ...(r.delegateInput !== undefined ? { delegate_input: r.delegateInput } : {}),
      ...(r.childExecutionId !== undefined ? { child_execution_id: r.childExecutionId } : {}),
      ...(r.parentExecutionId !== undefined ? { parent_execution_id: r.parentExecutionId } : {}),
      ...(r.signalName !== undefined ? { signal_name: r.signalName } : {}),
    };
  }
  const parallelSpan = /** @type {import("../packages/engine/src/application/workflow-application-port.mjs").WorkflowParallelSpan | undefined} */ (
    r.parallelSpan
  );
  return {
    op,
    is_error: false,
    execution_id: r.executionId,
    ...(op === "status" ? {} : { status: r.status }),
    ...(op === "status" ? { phase: r.phase } : {}),
    ...(r.finalState !== undefined ? { final_state: r.finalState } : {}),
    ...(r.result !== undefined ? { result: r.result } : {}),
    ...(r.error !== undefined ? { error: r.error } : {}),
    ...(r.nodeId !== undefined ? { node_id: r.nodeId } : {}),
    ...(r.state !== undefined ? { state: r.state } : {}),
    ...(r.code !== undefined ? { code: r.code } : {}),
    ...(r.agentId !== undefined ? { agent_id: r.agentId } : {}),
    ...(r.protocol !== undefined ? { protocol: r.protocol } : {}),
    ...(r.delegateInput !== undefined ? { delegate_input: r.delegateInput } : {}),
    ...(r.delegateCorrelationId !== undefined
      ? { delegate_correlation_id: r.delegateCorrelationId }
      : {}),
    ...(parallelSpan ? { parallel_span: parallelSpanToMcp(parallelSpan) } : {}),
    ...(r.signalName !== undefined ? { signal_name: r.signalName } : {}),
    ...(r.reason !== undefined ? { reason: r.reason } : {}),
  };
}

/**
 * @param {ParityOp} op
 * @param {Record<string, unknown>} transportBody
 */
function normalizeTransportSnapshot(op, transportBody) {
  const s = transportBody;
  return {
    op,
    is_error: false,
    execution_id: s.execution_id,
    ...(s.status !== undefined ? { status: s.status } : {}),
    ...(s.phase !== undefined ? { phase: s.phase } : {}),
    ...(s.final_state !== undefined ? { final_state: s.final_state } : {}),
    ...(s.result !== undefined ? { result: s.result } : {}),
    ...(s.error !== undefined ? { error: s.error } : {}),
    ...(s.node_id !== undefined ? { node_id: s.node_id } : {}),
    ...(s.state !== undefined ? { state: s.state } : {}),
    ...(s.code !== undefined ? { code: s.code } : {}),
    ...(s.current_node_id !== undefined ? { current_node_id: s.current_node_id } : {}),
    ...(s.last_error !== undefined ? { last_error: s.last_error } : {}),
    ...(s.delegate_correlation_id !== undefined
      ? { delegate_correlation_id: s.delegate_correlation_id }
      : {}),
    ...(s.agent_id !== undefined ? { agent_id: s.agent_id } : {}),
    ...(s.protocol !== undefined ? { protocol: s.protocol } : {}),
    ...(s.delegate_input !== undefined ? { delegate_input: s.delegate_input } : {}),
    ...(s.child_execution_id !== undefined ? { child_execution_id: s.child_execution_id } : {}),
    ...(s.parent_execution_id !== undefined ? { parent_execution_id: s.parent_execution_id } : {}),
    ...(s.parallel_span !== undefined ? { parallel_span: s.parallel_span } : {}),
    ...(s.signal_name !== undefined ? { signal_name: s.signal_name } : {}),
    ...(s.reason !== undefined ? { reason: s.reason } : {}),
  };
}

/**
 * @param {ParityOp} op
 * @param {{ isError?: boolean; structuredContent: Record<string, unknown> }} mcpResult
 */
function normalizeMcpSnapshot(op, mcpResult) {
  if (mcpResult.isError) {
    const err = /** @type {{ code?: string }} */ (mcpResult.structuredContent.error ?? {});
    return { op, is_error: true, error: { code: err.code } };
  }
  return normalizeTransportSnapshot(op, mcpResult.structuredContent);
}

/**
 * @param {ParityOp} op
 * @param {number} httpStatus
 * @param {Record<string, unknown> | undefined} body
 */
function normalizeRestSnapshot(op, httpStatus, body) {
  if (httpStatus >= 400) {
    const err = /** @type {{ code?: string }} */ (body?.error ?? {});
    return { op, is_error: true, error: { code: err.code } };
  }
  return normalizeTransportSnapshot(op, /** @type {Record<string, unknown>} */ (body ?? {}));
}

/**
 * @param {ParityOp} op
 * @param {Record<string, unknown> | undefined} transportBody
 * @param {unknown} [error]
 */
function normalizeSdkSnapshot(op, transportBody, error) {
  if (error) {
    const code =
      error instanceof SdkError
        ? error.code
        : typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
          ? error.code
          : "ENGINE_FAILURE";
    return { op, is_error: true, error: { code } };
  }
  return normalizeTransportSnapshot(op, /** @type {Record<string, unknown>} */ (transportBody ?? {}));
}

/**
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} pathname
 * @param {unknown} [body]
 */
async function restRequestJson(baseUrl, method, pathname, body) {
  // codeql[js/file-access-to-http]: conformance posts fixture JSON to in-process localhost only
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : undefined;
  return { status: response.status, body: parsed };
}

/**
 * @param {object} definition
 * @param {import("../packages/engine/src/persistence/types.mjs").ExecutionHistoryStore} store
 * @param {import("../packages/engine/src/orchestrator/delegate-executor.mjs").DelegateExecutor} [delegateExecutor]
 * @param {Record<string, Record<string, unknown>>} [stubActivityOutputs]
 */
export async function createParityRestServer(definition, store, delegateExecutor, stubActivityOutputs) {
  const definitionRegistry = new DefinitionRegistry();
  const registered = definitionRegistry.register(definition);
  const workflowPort = createWorkflowApplicationPort({
    store,
    ...(stubActivityOutputs ? { activityExecutor: new StubActivityExecutor(stubActivityOutputs) } : {}),
    ...(delegateExecutor ? { delegateExecutor } : {}),
  });
  const handler = createRestWorkflowHandler(workflowPort, { definitionRegistry, store });
  const server = createServer((req, res) => {
    handler(req, res).catch((error) => {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: String(error) } }));
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address !== "object") {
    throw new Error("Failed to bind parity REST server.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const close = () =>
    new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve(undefined)));
    });
  return { baseUrl, wfId: registered.wf_id, close };
}

/**
 * @param {ParityVector} vector
 */
export function isR2ParityVector(vector) {
  return vector.id.startsWith("parity.r2.");
}

/**
 * @param {Record<string, unknown>} snapshot
 * @param {Record<string, unknown>} expect
 */
function snapshotMatchesExpect(snapshot, expect) {
  for (const [key, value] of Object.entries(expect)) {
    if (JSON.stringify(snapshot[key]) !== JSON.stringify(value)) {
      return {
        ok: false,
        reason: `Expected ${key}=${JSON.stringify(value)} but got ${JSON.stringify(snapshot[key])}`,
      };
    }
  }
  return { ok: true, reason: "" };
}

/**
 * @param {Record<string, unknown>} a
 * @param {Record<string, unknown>} b
 */
function snapshotsEqual(a, b) {
  return JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort());
}

/**
 * @param {ParityStep["outcome"]} outcome
 */
function normalizeSubmitOutcomeForPort(outcome) {
  if (!outcome || outcome.ok !== true) {
    return outcome ?? { ok: true, result: {} };
  }
  return {
    ok: true,
    ...(outcome.result !== undefined ? { result: outcome.result } : {}),
    ...((outcome.delegateCorrelationId ?? outcome.delegate_correlation_id) !== undefined
      ? {
          delegateCorrelationId:
            outcome.delegateCorrelationId ?? outcome.delegate_correlation_id,
        }
      : {}),
    ...((outcome.externalTaskId ?? outcome.external_task_id) !== undefined
      ? { externalTaskId: outcome.externalTaskId ?? outcome.external_task_id }
      : {}),
  };
}

/**
 * @param {ParityStep["outcome"]} outcome
 */
function normalizeSubmitOutcomeForMcp(outcome) {
  if (!outcome || outcome.ok !== true) {
    return outcome ?? { ok: true, result: {} };
  }
  return {
    ok: true,
    ...(outcome.result !== undefined ? { result: outcome.result } : {}),
    ...((outcome.delegateCorrelationId ?? outcome.delegate_correlation_id) !== undefined
      ? {
          delegate_correlation_id:
            outcome.delegateCorrelationId ?? outcome.delegate_correlation_id,
        }
      : {}),
    ...((outcome.externalTaskId ?? outcome.external_task_id) !== undefined
      ? { external_task_id: outcome.externalTaskId ?? outcome.external_task_id }
      : {}),
  };
}

/**
 * @typedef {object} ParityRestContext
 * @property {string} baseUrl
 * @property {string} wfId
 */

/**
 * @param {ParitySurface} surface
 * @param {import("../packages/engine/src/application/workflow-application-port.mjs").WorkflowApplicationPort} port
 * @param {ReturnType<typeof createMcpWorkflowToolHandlers>} handlers
 * @param {WorkflowClient | undefined} sdkClient
 * @param {ParityRestContext | undefined} restContext
 * @param {object} definition
 * @param {string} executionId
 * @param {ParityStep} step
 * @param {Record<string, unknown>} scenarioInput
 */
async function executeStep(
  surface,
  port,
  handlers,
  sdkClient,
  restContext,
  definition,
  executionId,
  step,
  scenarioInput
) {
  const activityMode = step.activityExecutionMode;
  const stepExecutionId = step.executionId ?? executionId;

  if (step.op === "start") {
    if (surface === "port") {
      try {
        const portResult = await port.startWorkflow({
          executionId: stepExecutionId,
          definition,
          input: step.input ?? scenarioInput,
          ...(activityMode ? { activityExecutionMode: activityMode } : {}),
        });
        const isError = portResult.status === "failed" && portResult.error !== undefined;
        return {
          snapshot: normalizePortSnapshot(
            "start",
            portResult,
            isError,
            isError ? portResult.code ?? "ENGINE_FAILURE" : undefined
          ),
          isError,
        };
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error && typeof error.code === "string"
            ? error.code
            : "ENGINE_FAILURE";
        return {
          snapshot: normalizePortSnapshot("start", {}, true, code),
          isError: true,
        };
      }
    }
    if (surface === "mcp") {
      const mcpResult = await handlers.workflow_start({
        execution_id: stepExecutionId,
        definition,
        input: step.input ?? scenarioInput,
        ...(activityMode ? { activity_execution_mode: activityMode } : {}),
      });
      return {
        snapshot: normalizeMcpSnapshot("start", mcpResult),
        isError: Boolean(mcpResult.isError),
      };
    }
    if (surface === "rest" && restContext) {
      try {
        const { status, body } = await restRequestJson(
          restContext.baseUrl,
          "POST",
          `/v1/workflows/${encodeURIComponent(restContext.wfId)}/executions`,
          {
            execution_id: stepExecutionId,
            input: step.input ?? scenarioInput,
            ...(activityMode ? { activity_execution_mode: activityMode } : {}),
          }
        );
        const isError = status >= 400;
        return {
          snapshot: normalizeRestSnapshot("start", status, body),
          isError,
        };
      } catch (error) {
        return {
          snapshot: normalizeRestSnapshot("start", 500, {
            error: { code: "INTERNAL_ERROR", message: String(error) },
          }),
          isError: true,
        };
      }
    }
    if (surface === "sdk" && sdkClient) {
      try {
        const result = await sdkClient.start({
          definition,
          executionId: stepExecutionId,
          input: step.input ?? scenarioInput,
          ...(activityMode ? { activityExecutionMode: activityMode } : {}),
        });
        return {
          snapshot: normalizeSdkSnapshot("start", /** @type {Record<string, unknown>} */ (result)),
          isError: false,
        };
      } catch (error) {
        return {
          snapshot: normalizeSdkSnapshot("start", undefined, error),
          isError: true,
        };
      }
    }
  }

  if (step.op === "status") {
    if (surface === "port") {
      const portResult = await port.getWorkflowStatus({ executionId });
      return { snapshot: normalizePortSnapshot("status", portResult, false, undefined), isError: false };
    }
    if (surface === "mcp") {
      const mcpResult = await handlers.workflow_status({ execution_id: executionId });
      return { snapshot: normalizeMcpSnapshot("status", mcpResult), isError: Boolean(mcpResult.isError) };
    }
    if (surface === "rest" && restContext) {
      const { status, body } = await restRequestJson(
        restContext.baseUrl,
        "GET",
        `/v1/executions/${encodeURIComponent(executionId)}`
      );
      const isError = status >= 400;
      return {
        snapshot: normalizeRestSnapshot("status", status, body),
        isError,
      };
    }
    if (surface === "sdk" && sdkClient) {
      try {
        const result = await sdkClient.getStatus({ executionId });
        return {
          snapshot: normalizeSdkSnapshot("status", /** @type {Record<string, unknown>} */ (result)),
          isError: false,
        };
      } catch (error) {
        return {
          snapshot: normalizeSdkSnapshot("status", undefined, error),
          isError: true,
        };
      }
    }
  }

  if (step.op === "resume") {
    if (surface === "port") {
      const portResult = await port.resumeWorkflow({
        executionId,
        definition,
        resumePayload: step.resumePayload ?? {},
        ...(activityMode ? { activityExecutionMode: activityMode } : {}),
      });
      const isError = portResult.status === "failed";
      return {
        snapshot: normalizePortSnapshot(
          "resume",
          portResult,
          isError,
          isError ? portResult.code ?? "ENGINE_FAILURE" : undefined
        ),
        isError,
      };
    }
    if (surface === "mcp") {
      const mcpResult = await handlers.workflow_resume({
        execution_id: executionId,
        definition,
        resume_payload: step.resumePayload ?? {},
        ...(activityMode ? { activity_execution_mode: activityMode } : {}),
      });
      return { snapshot: normalizeMcpSnapshot("resume", mcpResult), isError: Boolean(mcpResult.isError) };
    }
    if (surface === "rest" && restContext) {
      const { status, body } = await restRequestJson(
        restContext.baseUrl,
        "POST",
        `/v1/executions/${encodeURIComponent(executionId)}:resume`,
        {
          definition,
          resume_payload: step.resumePayload ?? {},
          ...(activityMode ? { activity_execution_mode: activityMode } : {}),
        }
      );
      const isError = status >= 400;
      return {
        snapshot: normalizeRestSnapshot("resume", status, body),
        isError,
      };
    }
    if (surface === "sdk" && sdkClient) {
      try {
        const result = await sdkClient.resume({
          executionId,
          definition,
          resumePayload: step.resumePayload ?? {},
          ...(activityMode ? { activityExecutionMode: activityMode } : {}),
        });
        return {
          snapshot: normalizeSdkSnapshot("resume", /** @type {Record<string, unknown>} */ (result)),
          isError: false,
        };
      } catch (error) {
        return {
          snapshot: normalizeSdkSnapshot("resume", undefined, error),
          isError: true,
        };
      }
    }
  }

  if (step.op === "submit_activity") {
    const expectedParallelSpan = step.expectedParallelSpan;
    const portOutcome = normalizeSubmitOutcomeForPort(step.outcome);
    const mcpOutcome = normalizeSubmitOutcomeForMcp(step.outcome);
    if (surface === "port") {
      const portResult = await port.submitWorkflowActivity({
        executionId,
        definition,
        input: scenarioInput,
        nodeId: step.nodeId ?? "",
        outcome: portOutcome,
        ...(expectedParallelSpan ? { expectedParallelSpan } : {}),
        ...(activityMode ? { activityExecutionMode: activityMode } : {}),
      });
      const isError = portResult.status === "failed";
      return {
        snapshot: normalizePortSnapshot(
          "submit_activity",
          portResult,
          isError,
          isError ? portResult.code ?? "ENGINE_FAILURE" : undefined
        ),
        isError,
      };
    }
    const mcpParallelSpan = expectedParallelSpan
      ? {
          parallel_node_id: expectedParallelSpan.parallelNodeId,
          join_target_id: expectedParallelSpan.joinTargetId,
          branch_name: expectedParallelSpan.branchName,
          branch_entry_node_id: expectedParallelSpan.branchEntryNodeId,
        }
      : undefined;
    if (surface === "mcp") {
      const mcpResult = await handlers.workflow_submit_activity({
        execution_id: executionId,
        definition,
        input: scenarioInput,
        node_id: step.nodeId ?? "",
        outcome: mcpOutcome,
        ...(mcpParallelSpan ? { parallel_span: mcpParallelSpan } : {}),
        ...(activityMode ? { activity_execution_mode: activityMode } : {}),
      });
      return { snapshot: normalizeMcpSnapshot("submit_activity", mcpResult), isError: Boolean(mcpResult.isError) };
    }
    if (surface === "rest" && restContext) {
      const { status, body } = await restRequestJson(
        restContext.baseUrl,
        "POST",
        `/v1/executions/${encodeURIComponent(executionId)}:submit_activity`,
        {
          definition,
          input: scenarioInput,
          node_id: step.nodeId ?? "",
          outcome: mcpOutcome,
          ...(mcpParallelSpan ? { parallel_span: mcpParallelSpan } : {}),
          ...(activityMode ? { activity_execution_mode: activityMode } : {}),
        }
      );
      const isError = status >= 400;
      return {
        snapshot: normalizeRestSnapshot("submit_activity", status, body),
        isError,
      };
    }
    if (surface === "sdk" && sdkClient) {
      try {
        const result = await sdkClient.submitActivity({
          executionId,
          definition,
          input: scenarioInput,
          nodeId: step.nodeId ?? "",
          outcome: mcpOutcome,
          ...(mcpParallelSpan ? { parallelSpan: mcpParallelSpan } : {}),
          ...(activityMode ? { activityExecutionMode: activityMode } : {}),
        });
        return {
          snapshot: normalizeSdkSnapshot("submit_activity", /** @type {Record<string, unknown>} */ (result)),
          isError: false,
        };
      } catch (error) {
        return {
          snapshot: normalizeSdkSnapshot("submit_activity", undefined, error),
          isError: true,
        };
      }
    }
  }

  if (step.op === "signal") {
    if (surface === "port") {
      const portResult = await port.signalWorkflow({
        executionId,
        definition,
        input: scenarioInput,
        signalName: step.signalName ?? "",
        ...(step.payload !== undefined ? { payload: step.payload } : {}),
        ...(activityMode ? { activityExecutionMode: activityMode } : {}),
      });
      const isError = portResult.status === "failed";
      return {
        snapshot: normalizePortSnapshot(
          "signal",
          portResult,
          isError,
          isError ? portResult.code ?? "ENGINE_FAILURE" : undefined
        ),
        isError,
      };
    }
    if (surface === "mcp") {
      const mcpResult = await handlers.workflow_signal({
        execution_id: executionId,
        definition,
        input: scenarioInput,
        signal_name: step.signalName ?? "",
        ...(step.payload !== undefined ? { payload: step.payload } : {}),
        ...(activityMode ? { activity_execution_mode: activityMode } : {}),
      });
      return { snapshot: normalizeMcpSnapshot("signal", mcpResult), isError: Boolean(mcpResult.isError) };
    }
  }

  if (step.op === "cancel") {
    if (surface === "port") {
      const portResult = await port.cancelWorkflow({
        executionId,
        ...(step.reason !== undefined ? { reason: step.reason } : {}),
      });
      const isError = portResult.status === "failed";
      return {
        snapshot: normalizePortSnapshot(
          "cancel",
          portResult,
          isError,
          isError ? portResult.code ?? "ENGINE_FAILURE" : undefined
        ),
        isError,
      };
    }
    if (surface === "mcp") {
      const mcpResult = await handlers.workflow_cancel({
        execution_id: executionId,
        ...(step.reason !== undefined ? { reason: step.reason } : {}),
      });
      return { snapshot: normalizeMcpSnapshot("cancel", mcpResult), isError: Boolean(mcpResult.isError) };
    }
  }

  if (step.op === "list") {
    const listRequest = {
      ...(step.listPhase !== undefined ? { phase: step.listPhase } : {}),
      ...(step.listLimit !== undefined ? { limit: step.listLimit } : {}),
      ...(step.listCursor !== undefined ? { cursor: step.listCursor } : {}),
    };
    if (surface === "port") {
      const portResult = await port.listWorkflowExecutions(listRequest);
      return { snapshot: normalizeListSnapshot(portResult), isError: false };
    }
    if (surface === "mcp") {
      const mcpResult = await handlers.workflow_list({
        ...(step.listPhase !== undefined ? { phase: step.listPhase } : {}),
        ...(step.listLimit !== undefined ? { limit: step.listLimit } : {}),
        ...(step.listCursor !== undefined ? { cursor: step.listCursor } : {}),
      });
      if (mcpResult.isError) {
        return {
          snapshot: { op: "list", is_error: true, error: mcpResult.structuredContent?.error },
          isError: true,
        };
      }
      const executions = mcpResult.structuredContent.executions.map((item) => ({
        executionId: item.execution_id,
      }));
      return {
        snapshot: normalizeListSnapshot({
          executions,
          ...(mcpResult.structuredContent.next_cursor !== undefined
            ? { nextCursor: mcpResult.structuredContent.next_cursor }
            : {}),
        }),
        isError: false,
      };
    }
  }

  throw new Error(`Unsupported parity op "${step.op}"`);
}

/**
 * @param {ParityVector} vector
 * @param {string} repoRoot
 */
const allowPending =
  process.env.CONFORMANCE_ALLOW_PENDING === "1" || process.env.CONFORMANCE_ALLOW_PENDING === "true";

/**
 * @param {ParityVector} vector
 * @returns {Promise<{ delegateExecutor?: import("../packages/engine/src/orchestrator/delegate-executor.mjs").DelegateExecutor; closeMockA2A?: () => Promise<void> }>}
 */
async function resolveParityDelegateExecutor(vector) {
  if (!vector.useProductionA2ADelegate) {
    return {};
  }
  const mock = createA2AMockHttpServer({ workingPolls: 1 });
  const { baseUrl, close } = await mock.listen();
  return {
    delegateExecutor: new A2ADelegateExecutor({
      operatorConfig: {
        baseUrl,
        apiKeyEnv: "CONFORMANCE_A2A_API_KEY",
        pollIntervalMs: 10,
        pollTimeoutMs: 5_000,
      },
      env: { CONFORMANCE_A2A_API_KEY: "conformance-a2a-token" },
    }),
    closeMockA2A: close,
  };
}

export async function runParityVector(vector, repoRoot) {
  if (vector.pending) {
    const reason = vector.pendingReason ?? "Scenario pending implementation";
    if (allowPending) {
      return {
        passed: true,
        category: "parity-pending",
        reason,
      };
    }
    return {
      passed: false,
      category: "parity-pending",
      reason: `Pending parity vector must not pass release gate: ${reason}`,
    };
  }

  const definitionPath = path.resolve(repoRoot, vector.definition);
  const definition = JSON.parse(readFileSync(definitionPath, "utf8"));
  const scenarioInput = vector.steps.find((s) => s.input)?.input ?? {};
  const { delegateExecutor, closeMockA2A } = await resolveParityDelegateExecutor(vector);

  /**
   * @param {ParitySurface} surface
   */
  async function runScenario(surface) {
    const store = new MemoryExecutionHistoryStore();
    const port = createWorkflowApplicationPort({
      store,
      ...(vector.stubActivityOutputs
        ? { activityExecutor: new StubActivityExecutor(vector.stubActivityOutputs) }
        : {}),
      ...(delegateExecutor ? { delegateExecutor } : {}),
    });
    const handlers = createMcpWorkflowToolHandlers(port);
    const sdkClient = surface === "sdk" ? WorkflowClient.fromPort(port) : undefined;
    /** @type {ParityRestContext | undefined} */
    let restContext;
    /** @type {(() => Promise<void>) | undefined} */
    let closeRestServer;
    if (surface === "rest") {
      const restServer = await createParityRestServer(
        definition,
        store,
        delegateExecutor,
        vector.stubActivityOutputs
      );
      restContext = { baseUrl: restServer.baseUrl, wfId: restServer.wfId };
      closeRestServer = restServer.close;
    }
    /** @type {Record<string, unknown>[]} */
    const snapshots = [];

    try {
      for (const step of vector.steps) {
        const { snapshot, isError } = await executeStep(
          surface,
          port,
          handlers,
          sdkClient,
          restContext,
          definition,
          vector.executionId,
          step,
          /** @type {Record<string, unknown>} */ (scenarioInput)
        );
        snapshots.push(snapshot);

        if (Boolean(step.expectError) !== isError) {
          return {
            passed: false,
            reason: `Step ${step.op} (${surface}): expected expectError=${Boolean(step.expectError)} but got error=${isError}`,
            context: { snapshot },
          };
        }

        if (step.expectErrorCode && snapshot.error?.code !== step.expectErrorCode) {
          return {
            passed: false,
            reason: `Step ${step.op} (${surface}): expected error code ${step.expectErrorCode}`,
            context: { snapshot },
          };
        }

        if (step.expect && !step.expectError) {
          const match = snapshotMatchesExpect(snapshot, step.expect);
          if (!match.ok) {
            return {
              passed: false,
              reason: `Step ${step.op} (${surface}): ${match.reason}`,
              context: { snapshot, expect: step.expect },
            };
          }
        }
      }

      return { passed: true, snapshots };
    } finally {
      if (closeRestServer) {
        await closeRestServer();
      }
    }
  }

  /**
   * @param {Record<string, unknown>[]} baseline
   * @param {ParitySurface} surface
   */
  async function assertSurfaceMatchesBaseline(baseline, surface) {
    const surfaceRun = await runScenario(surface);
    if (!surfaceRun.passed) {
      return surfaceRun;
    }
    for (let i = 0; i < baseline.length; i += 1) {
      if (!snapshotsEqual(baseline[i], surfaceRun.snapshots[i])) {
        return {
          passed: false,
          reason: `Step index ${i} (${vector.steps[i].op}): port and ${surface} normalized snapshots differ`,
          context: { port: baseline[i], [surface]: surfaceRun.snapshots[i] },
        };
      }
    }
    return { passed: true };
  }

  try {
    const portRun = await runScenario("port");
    if (!portRun.passed) {
      return portRun;
    }
    const mcpRun = await runScenario("mcp");
    if (!mcpRun.passed) {
      return mcpRun;
    }

    for (let i = 0; i < portRun.snapshots.length; i += 1) {
      if (!snapshotsEqual(portRun.snapshots[i], mcpRun.snapshots[i])) {
        return {
          passed: false,
          reason: `Step index ${i} (${vector.steps[i].op}): port and MCP normalized snapshots differ`,
          context: { port: portRun.snapshots[i], mcp: mcpRun.snapshots[i] },
        };
      }
    }

    if (isR2ParityVector(vector)) {
      for (const surface of /** @type {ParitySurface[]} */ (["rest", "sdk"])) {
        const adapterRun = await assertSurfaceMatchesBaseline(portRun.snapshots, surface);
        if (!adapterRun.passed) {
          return adapterRun;
        }
      }
    }

    return {
      passed: true,
      context: {
        stepCount: vector.steps.length,
        ...(isR2ParityVector(vector) ? { surfaces: ["port", "mcp", "rest", "sdk"] } : { surfaces: ["port", "mcp"] }),
      },
    };
  } finally {
    if (closeMockA2A) {
      await closeMockA2A();
    }
  }
}
