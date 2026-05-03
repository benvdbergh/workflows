/**
 * Engine-direct MCP stdio client for `tools/call` against operator manifest server definitions.
 *
 * **Transport:** stdio subprocess only (operator manifest `command` / `args` / `env`).
 * HTTP/SSE `url` servers are out of scope for this module; see `docs/architecture/mcp-operator-manifest.md`.
 *
 * **Timeouts:** `callMcpToolStdio` and {@link McpManifestActivityExecutor} use conservative defaults
 * suitable for CI (`DEFAULT_MCP_ACTIVITY_TOOL_TIMEOUT_MS`). Override per call via `timeoutMs`, or pass
 * `signal` (`AbortSignal`) for cancellation (connect + `tools/call` honor `RequestOptions.signal` from the MCP SDK).
 *
 * @see docs/architecture/adr/ADR-0003-engine-direct-mcp-activity-execution.md
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

/** Default for MCP initialize + tools/call (ms). Conservative for automation/CI. */
export const DEFAULT_MCP_ACTIVITY_TOOL_TIMEOUT_MS = 45_000;

/**
 * Maps thrown errors from MCP client / stdio transport to ActivityFailed-compatible results.
 *
 * @param {unknown} err
 * @returns {import("./activity-executor.mjs").ActivityExecutorResult}
 */
export function mapMcpClientThrownError(err) {
  if (err instanceof DOMException && err.name === "AbortError") {
    return { ok: false, error: "MCP tool call aborted", code: "ACTIVITY_CANCELLED" };
  }
  if (err instanceof McpError) {
    if (err.code === ErrorCode.RequestTimeout) {
      return { ok: false, error: err.message, code: "ACTIVITY_TIMEOUT" };
    }
    if (err.code === ErrorCode.ConnectionClosed) {
      return { ok: false, error: err.message, code: "MCP_CONNECTION_CLOSED" };
    }
    return { ok: false, error: err.message, code: "MCP_PROTOCOL_ERROR" };
  }
  if (err instanceof Error) {
    if (err.name === "AbortError") {
      return { ok: false, error: err.message || "aborted", code: "ACTIVITY_CANCELLED" };
    }
    return { ok: false, error: err.message, code: "MCP_CLIENT_ERROR" };
  }
  return { ok: false, error: String(err), code: "MCP_CLIENT_ERROR" };
}

/**
 * @param {unknown} content
 * @returns {string}
 */
function joinTextToolContent(content) {
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (block && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

/**
 * Interprets a successful `client.callTool` return value into an activity result.
 *
 * @param {Record<string, unknown>} result
 * @returns {import("./activity-executor.mjs").ActivityExecutorResult}
 */
export function mapMcpCallToolResultToActivityResult(result) {
  if (result.isError === true) {
    const msg = joinTextToolContent(result.content) || "MCP tool returned isError";
    return { ok: false, error: msg, code: "MCP_TOOL_EXECUTION_ERROR" };
  }
  if (result.structuredContent && typeof result.structuredContent === "object" && !Array.isArray(result.structuredContent)) {
    return { ok: true, output: /** @type {Record<string, unknown>} */ ({ ...result.structuredContent }) };
  }
  const text = joinTextToolContent(result.content);
  if (text) {
    return { ok: true, output: { text } };
  }
  return { ok: true, output: { content: result.content ?? [] } };
}

/**
 * Spawns an MCP stdio server, completes initialize, invokes `tools/call`, then closes the client.
 *
 * @param {import("../config/mcp-operator-manifest.mjs").McpStdioServerDefinition} serverDef
 * @param {string} toolName
 * @param {Record<string, unknown>} toolArguments
 * @param {{
 *   timeoutMs?: number;
 *   signal?: AbortSignal;
 *   clientName?: string;
 *   clientVersion?: string;
 * }} [options]
 * @returns {Promise<import("./activity-executor.mjs").ActivityExecutorResult>}
 */
export async function callMcpToolStdio(serverDef, toolName, toolArguments, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_MCP_ACTIVITY_TOOL_TIMEOUT_MS;
  const client = new Client(
    {
      name: options.clientName ?? "@agent-workflow/engine-mcp-activity-client",
      version: options.clientVersion ?? "0.0.0",
    },
    {}
  );
  const transport = new StdioClientTransport({
    command: serverDef.command,
    args: serverDef.args ?? [],
    env: serverDef.env && typeof serverDef.env === "object" ? { ...serverDef.env } : {},
  });
  try {
    await client.connect(transport, { timeout: timeoutMs, signal: options.signal });
    const raw = await client.callTool({ name: toolName, arguments: toolArguments }, undefined, {
      timeout: timeoutMs,
      signal: options.signal,
    });
    return mapMcpCallToolResultToActivityResult(/** @type {Record<string, unknown>} */ (raw));
  } catch (err) {
    return mapMcpClientThrownError(err);
  } finally {
    try {
      await client.close();
    } catch {
      // ignore shutdown errors
    }
  }
}

/**
 * ActivityExecutor that runs `tool_call` nodes via MCP stdio using a normalized operator manifest.
 * `step` and `llm_call` are rejected (use stub/host-mediated paths for those in R2).
 *
 * @implements {import("./activity-executor.mjs").ActivityExecutor}
 */
export class McpManifestActivityExecutor {
  /**
   * @param {{
   *   manifest: import("../config/mcp-operator-manifest.mjs").NormalizedMcpOperatorManifest;
   *   defaultTimeoutMs?: number;
   *   getAbortSignal?: () => AbortSignal | undefined;
   *   clientName?: string;
   *   clientVersion?: string;
   * }} opts
   */
  constructor(opts) {
    this.manifest = opts.manifest;
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? DEFAULT_MCP_ACTIVITY_TOOL_TIMEOUT_MS;
    this.getAbortSignal = opts.getAbortSignal;
    this.clientName = opts.clientName;
    this.clientVersion = opts.clientVersion;
  }

  /**
   * @param {import("./activity-executor.mjs").ActivityExecutorContext} ctx
   * @returns {Promise<import("./activity-executor.mjs").ActivityExecutorResult>}
   */
  async executeActivity(ctx) {
    const { node } = ctx;
    if (node.type !== "tool_call") {
      return {
        ok: false,
        error: `McpManifestActivityExecutor only supports tool_call nodes (got ${node.type})`,
        code: "ACTIVITY_EXECUTOR_UNSUPPORTED_NODE",
      };
    }
    const cfg = node.config && typeof node.config === "object" && !Array.isArray(node.config) ? node.config : {};
    const serverKey = typeof cfg.server === "string" ? cfg.server : "";
    const toolName = typeof cfg.tool === "string" ? cfg.tool : "";
    if (!serverKey || !toolName) {
      return {
        ok: false,
        error: "tool_call node requires config.server and config.tool strings",
        code: "INVALID_TOOL_CALL_CONFIG",
      };
    }
    const serverDef = this.manifest.mcpServers[serverKey];
    if (!serverDef) {
      return {
        ok: false,
        error: `No MCP server "${serverKey}" in operator manifest`,
        code: "MCP_SERVER_NOT_CONFIGURED",
      };
    }
    const toolArguments =
      cfg.arguments && typeof cfg.arguments === "object" && !Array.isArray(cfg.arguments)
        ? /** @type {Record<string, unknown>} */ ({ ...cfg.arguments })
        : {};
    const signal = this.getAbortSignal?.();
    return callMcpToolStdio(serverDef, toolName, toolArguments, {
      timeoutMs: this.defaultTimeoutMs,
      signal,
      clientName: this.clientName,
      clientVersion: this.clientVersion,
    });
  }
}
