import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createMcpWorkflowToolHandlers,
  createWorkflowApplicationPort,
  MemoryExecutionHistoryStore,
  StubActivityExecutor,
} from "../packages/engine/src/index.mjs";

/**
 * @typedef {"start" | "status" | "resume" | "submit_activity"} ParityOp
 */

/**
 * @typedef {object} ParityStep
 * @property {ParityOp} op
 * @property {Record<string, unknown>} [input]
 * @property {Record<string, unknown>} [resumePayload]
 * @property {string} [nodeId]
 * @property {{ ok: true; result?: Record<string, unknown>; delegateCorrelationId?: string; delegate_correlation_id?: string; externalTaskId?: string; external_task_id?: string } | { ok: false; error: string; code?: string }} [outcome]
 * @property {"in_process" | "host_mediated"} [activityExecutionMode]
 * @property {Record<string, Record<string, unknown>>} [stubActivityOutputs]
 * @property {object} [expectedParallelSpan]
 * @property {boolean} [expectError]
 * @property {string} [expectErrorCode]
 * @property {Record<string, unknown>} [expect]
 */

/**
 * @typedef {object} ParityVector
 * @property {string} id
 * @property {"parity"} kind
 * @property {string} [description]
 * @property {boolean} [pending]
 * @property {string} [pendingReason]
 * @property {string} definition
 * @property {string} executionId
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
  const s = mcpResult.structuredContent;
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
  };
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
 * @param {"port" | "mcp"} surface
 * @param {import("../packages/engine/src/application/workflow-application-port.mjs").WorkflowApplicationPort} port
 * @param {ReturnType<typeof createMcpWorkflowToolHandlers>} handlers
 * @param {object} definition
 * @param {string} executionId
 * @param {ParityStep} step
 * @param {Record<string, unknown>} scenarioInput
 */
async function executeStep(surface, port, handlers, definition, executionId, step, scenarioInput) {
  const activityMode = step.activityExecutionMode;

  if (step.op === "start") {
    if (surface === "port") {
      try {
        const portResult = await port.startWorkflow({
          executionId,
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
    const mcpResult = await handlers.workflow_start({
      execution_id: executionId,
      definition,
      input: step.input ?? scenarioInput,
      ...(activityMode ? { activity_execution_mode: activityMode } : {}),
    });
    return {
      snapshot: normalizeMcpSnapshot("start", mcpResult),
      isError: Boolean(mcpResult.isError),
    };
  }

  if (step.op === "status") {
    if (surface === "port") {
      const portResult = await port.getWorkflowStatus({ executionId });
      return { snapshot: normalizePortSnapshot("status", portResult, false, undefined), isError: false };
    }
    const mcpResult = await handlers.workflow_status({ execution_id: executionId });
    return { snapshot: normalizeMcpSnapshot("status", mcpResult), isError: Boolean(mcpResult.isError) };
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
    const mcpResult = await handlers.workflow_resume({
      execution_id: executionId,
      definition,
      resume_payload: step.resumePayload ?? {},
      ...(activityMode ? { activity_execution_mode: activityMode } : {}),
    });
    return { snapshot: normalizeMcpSnapshot("resume", mcpResult), isError: Boolean(mcpResult.isError) };
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

  throw new Error(`Unsupported parity op "${step.op}"`);
}

/**
 * @param {ParityVector} vector
 * @param {string} repoRoot
 */
const allowPending =
  process.env.CONFORMANCE_ALLOW_PENDING === "1" || process.env.CONFORMANCE_ALLOW_PENDING === "true";

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

  /**
   * @param {"port" | "mcp"} surface
   */
  async function runScenario(surface) {
    const store = new MemoryExecutionHistoryStore();
    const port = createWorkflowApplicationPort({
      store,
      ...(vector.stubActivityOutputs
        ? { activityExecutor: new StubActivityExecutor(vector.stubActivityOutputs) }
        : {}),
    });
    const handlers = createMcpWorkflowToolHandlers(port);
    /** @type {Record<string, unknown>[]} */
    const snapshots = [];

    for (const step of vector.steps) {
      const { snapshot, isError } = await executeStep(
        surface,
        port,
        handlers,
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
  }

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

  return { passed: true, context: { stepCount: vector.steps.length } };
}
