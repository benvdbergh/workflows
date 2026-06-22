#!/usr/bin/env node
import { createWorkflowApplicationPort } from "./application/workflow-application-port.mjs";
import { createMcpWorkflowStdioServer } from "./adapters/mcp/stdio-server.mjs";
import {
  formatActivityRoutingSummaryLog,
  formatMcpManifestValidationErrors,
  loadProductionActivityExecutor,
  loadProductionDelegateExecutor,
  resolveTransportValidationOptionsFromEnv,
  resolveWorkflowEngineMcpConfigPath,
} from "./adapters/mcp/stdio-server-config.mjs";
import { MemoryExecutionHistoryStore } from "./persistence/memory-history-store.mjs";
import { loadControlPlaneAuthConfigFromEnv } from "./security/control-plane-auth.mjs";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      "Usage: workflows-engine-mcp [--mcp-config <path>]\n" +
        "Starts MCP stdio adapter with workflow_start/workflow_status/workflow_resume/workflow_submit_activity/workflow_signal/workflow_cancel/workflow_list tools.\n" +
        "\n" +
        "Production activity execution (composite router):\n" +
        "  WORKFLOW_ENGINE_MCP_CONFIG — operator MCP manifest for tool_call (or --mcp-config <path>).\n" +
        "  WORKFLOW_ENGINE_LLM_CONFIG — inline JSON or file path for llm_call operator credentials.\n" +
        "  WORKFLOW_ENGINE_STEP_HANDLERS — inline JSON or file path: URN → static output object (not programmatic handlers).\n" +
        "    For custom handler code, use StepHandlerRegistry.register at library bootstrap (see engine README).\n" +
        "  When none are set, activities use StubActivityExecutor (local demo only; set WORKFLOW_ENGINE_PROFILE=demo\n" +
        "  to enable stub fallback for unconfigured node types inside a partial composite).\n" +
        "\n" +
        "Production delegate execution (composite router):\n" +
        "  WORKFLOW_ENGINE_A2A_CONFIG — inline JSON or file path for a2a operator credentials (baseUrl, apiKeyEnv).\n" +
        "  WORKFLOW_ENGINE_MCP_CONFIG — operator manifest delegateAgents for mcp protocol (same path as tool_call).\n" +
        "  When none are set, agent_delegate uses MockA2ADelegateExecutor (local demo only; set\n" +
        "  WORKFLOW_ENGINE_PROFILE=demo to enable mock fallback for unconfigured protocols inside a partial composite).\n" +
        "  Manifest schema: same as `workflows-engine mcp-manifest validate` (mcpServers stdio subset).\n" +
        "\n" +
        "Definition signing (v1 JWS Ed25519 profile):\n" +
        "  WORKFLOW_ENGINE_DEFINITION_SIGNING_MODE — optional (default) or require.\n" +
        "  WORKFLOW_ENGINE_SIGNING_PUBLIC_KEYS — inline JSON map { keyId: base64url-spki-or-raw-pub } or file:path.\n" +
        "\n" +
        "Control-plane auth (stdio boundary):\n" +
        "  MCP stdio has no Authorization header channel — rely on OS process isolation between host and engine.\n" +
        "  When WORKFLOW_ENGINE_AUTH_TOKENS is set, REST (`workflows-engine-rest`) enforces Bearer tokens;\n" +
        "  stdio does not require tokens (backward compatible for local dev). See docs/security/mcp-control-plane-auth.md.\n"
    );
    return;
  }

  const manifestPath = resolveWorkflowEngineMcpConfigPath(process.argv);
  let activityExecutor = undefined;
  let delegateExecutor = undefined;
  try {
    const [activityLoaded, delegateLoaded] = await Promise.all([
      loadProductionActivityExecutor({ manifestPath }),
      loadProductionDelegateExecutor({ manifestPath }),
    ]);
    if (!activityLoaded.ok) {
      if ("errors" in activityLoaded && activityLoaded.errors) {
        process.stderr.write(
          `[engine-mcp-stdio] Invalid operator manifest at ${manifestPath}:\n${formatMcpManifestValidationErrors(activityLoaded.errors)}\n`
        );
      } else {
        process.stderr.write(`[engine-mcp-stdio] Activity executor configuration failed: ${activityLoaded.error}\n`);
      }
      process.exitCode = 1;
      return;
    }
    activityExecutor = activityLoaded.executor;

    if (!delegateLoaded.ok) {
      if ("errors" in delegateLoaded && delegateLoaded.errors) {
        process.stderr.write(
          `[engine-mcp-stdio] Invalid operator manifest at ${manifestPath}:\n${formatMcpManifestValidationErrors(delegateLoaded.errors)}\n`
        );
      } else {
        process.stderr.write(`[engine-mcp-stdio] Delegate executor configuration failed: ${delegateLoaded.error}\n`);
      }
      process.exitCode = 1;
      return;
    }
    delegateExecutor = delegateLoaded.executor;
    process.stderr.write(formatActivityRoutingSummaryLog(activityLoaded.routingSummary));
  } catch (err) {
    process.stderr.write(
      `[engine-mcp-stdio] Executor configuration failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exitCode = 1;
    return;
  }

  const store = new MemoryExecutionHistoryStore();
  const workflowPort = createWorkflowApplicationPort({
    store,
    ...(activityExecutor ? { activityExecutor } : {}),
    ...(delegateExecutor ? { delegateExecutor } : {}),
  });
  const transportValidation = resolveTransportValidationOptionsFromEnv();
  const server = createMcpWorkflowStdioServer(workflowPort, { transportValidation });

  process.on("uncaughtException", (error) => {
    process.stderr.write(`[engine-mcp-stdio] uncaught exception: ${error instanceof Error ? error.message : String(error)}\n`);
  });
  process.on("unhandledRejection", (reason) => {
    process.stderr.write(`[engine-mcp-stdio] unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}\n`);
  });

  if (loadControlPlaneAuthConfigFromEnv().enabled) {
    process.stderr.write(
      "[engine-mcp-stdio] WORKFLOW_ENGINE_AUTH_TOKENS is set but stdio does not enforce bearer auth; use OS process isolation. REST enforces tokens.\n"
    );
  }

  await server.start();
}

main().catch((error) => {
  process.stderr.write(`[engine-mcp-stdio] startup failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
