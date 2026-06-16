/**
 * Production MCP delegate executor for `agent_delegate` nodes with `protocol: "mcp"`.
 *
 * Routes workflow `agent_id` to `{ server, tool }` bindings in the operator manifest
 * (`delegateAgents`), then invokes the MCP tool via stdio (`callMcpToolStdio`).
 *
 * @see docs/architecture/arc42-assets/contracts/mcp-operator-manifest.md
 */

import { mintDelegateCorrelationId } from "./delegate-executor.mjs";
import {
  callMcpToolStdio,
  DEFAULT_MCP_ACTIVITY_TOOL_TIMEOUT_MS,
} from "./mcp-stdio-activity-executor.mjs";

/** @typedef {"DELEGATE_AGENT_NOT_FOUND" | "DELEGATE_PROTOCOL_ERROR" | "DELEGATE_PROTOCOL_UNSUPPORTED"} McpDelegateErrorCode */

/**
 * @typedef {object} DelegateAgentBinding
 * @property {string} server MCP server label in `manifest.mcpServers`
 * @property {string} tool MCP tool name
 */

/**
 * @param {import("../config/mcp-operator-manifest.mjs").NormalizedMcpOperatorManifest} manifest
 * @param {string} agentId
 * @returns {{ ok: true; binding: DelegateAgentBinding } | { ok: false; error: string; code: "DELEGATE_AGENT_NOT_FOUND" }}
 */
export function resolveDelegateAgentBinding(manifest, agentId) {
  const agents = manifest.delegateAgents;
  if (!agents || typeof agents !== "object") {
    return {
      ok: false,
      error: `No delegateAgents section in operator manifest (agent_id "${agentId}")`,
      code: "DELEGATE_AGENT_NOT_FOUND",
    };
  }
  const raw = agents[agentId];
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      error: `No MCP delegate binding for agent_id "${agentId}"`,
      code: "DELEGATE_AGENT_NOT_FOUND",
    };
  }
  const server = typeof raw.server === "string" ? raw.server.trim() : "";
  const tool = typeof raw.tool === "string" ? raw.tool.trim() : "";
  if (!server || !tool) {
    return {
      ok: false,
      error: `Delegate binding for agent_id "${agentId}" requires server and tool strings`,
      code: "DELEGATE_AGENT_NOT_FOUND",
    };
  }
  return { ok: true, binding: { server, tool } };
}

/**
 * @param {import("./activity-executor.mjs").ActivityExecutorResult} activityResult
 * @returns {import("./delegate-executor.mjs").DelegateExecutorResult}
 */
export function mapMcpActivityResultToDelegateResult(activityResult, delegateCorrelationId, externalTaskId) {
  if (!activityResult.ok) {
    return {
      ok: false,
      error: activityResult.error,
      code: "DELEGATE_PROTOCOL_ERROR",
    };
  }
  return {
    ok: true,
    output: activityResult.output,
    delegateCorrelationId,
    externalTaskId,
  };
}

/**
 * @implements {import("./delegate-executor.mjs").DelegateExecutor}
 */
export class McpDelegateExecutor {
  /**
   * @param {{
   *   manifest: import("../config/mcp-operator-manifest.mjs").NormalizedMcpOperatorManifest;
   *   defaultTimeoutMs?: number;
   *   clientName?: string;
   *   clientVersion?: string;
   * }} opts
   */
  constructor(opts) {
    this.manifest = opts.manifest;
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? DEFAULT_MCP_ACTIVITY_TOOL_TIMEOUT_MS;
    this.clientName = opts.clientName;
    this.clientVersion = opts.clientVersion;
  }

  /**
   * @param {import("./delegate-executor.mjs").DelegateExecutorContext} ctx
   * @returns {Promise<import("./delegate-executor.mjs").DelegateExecutorResult>}
   */
  async executeDelegate(ctx) {
    const { executionId, node, delegateInput, protocol } = ctx;
    const delegateCorrelationId = mintDelegateCorrelationId(executionId, node.id);

    if (protocol !== "mcp") {
      return {
        ok: false,
        error: `McpDelegateExecutor only supports protocol "mcp" (got "${protocol}")`,
        code: "DELEGATE_PROTOCOL_UNSUPPORTED",
      };
    }

    const cfg =
      node.config && typeof node.config === "object"
        ? /** @type {{ agent_id?: string }} */ (node.config)
        : {};
    const agentId = typeof cfg.agent_id === "string" ? cfg.agent_id.trim() : "";
    if (!agentId) {
      return {
        ok: false,
        error: `agent_delegate "${node.id}": agent_id is required`,
        code: "DELEGATE_AGENT_NOT_FOUND",
      };
    }

    const bindingResult = resolveDelegateAgentBinding(this.manifest, agentId);
    if (!bindingResult.ok) {
      return bindingResult;
    }
    const { server: serverKey, tool: toolName } = bindingResult.binding;

    const serverDef = this.manifest.mcpServers[serverKey];
    if (!serverDef) {
      return {
        ok: false,
        error: `Delegate agent "${agentId}" references MCP server "${serverKey}" which is not in mcpServers`,
        code: "DELEGATE_AGENT_NOT_FOUND",
      };
    }

    const externalTaskId = `mcp-task-${delegateCorrelationId.replace(/:/g, "-")}`;
    const toolArguments =
      delegateInput && typeof delegateInput === "object" && !Array.isArray(delegateInput)
        ? /** @type {Record<string, unknown>} */ ({ ...delegateInput })
        : {};

    const activityResult = await callMcpToolStdio(serverDef, toolName, toolArguments, {
      timeoutMs: this.defaultTimeoutMs,
      clientName: this.clientName,
      clientVersion: this.clientVersion,
    });

    return mapMcpActivityResultToDelegateResult(activityResult, delegateCorrelationId, externalTaskId);
  }
}
