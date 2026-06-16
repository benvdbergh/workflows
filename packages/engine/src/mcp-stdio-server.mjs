#!/usr/bin/env node
import { createWorkflowApplicationPort } from "./application/workflow-application-port.mjs";
import { createMcpWorkflowStdioServer } from "./adapters/mcp/stdio-server.mjs";
import {
  formatMcpManifestValidationErrors,
  loadProductionActivityExecutor,
  resolveWorkflowEngineMcpConfigPath,
} from "./adapters/mcp/stdio-server-config.mjs";
import { MemoryExecutionHistoryStore } from "./persistence/memory-history-store.mjs";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      "Usage: workflows-engine-mcp [--mcp-config <path>]\n" +
        "Starts MCP stdio adapter with workflow_start/workflow_status/workflow_resume/workflow_submit_activity tools.\n" +
        "\n" +
        "Production activity execution (composite router):\n" +
        "  WORKFLOW_ENGINE_MCP_CONFIG — operator MCP manifest for tool_call (or --mcp-config <path>).\n" +
        "  WORKFLOW_ENGINE_LLM_CONFIG — inline JSON or file path for llm_call operator credentials.\n" +
        "  WORKFLOW_ENGINE_STEP_HANDLERS — inline JSON or file path mapping handler URNs to static outputs.\n" +
        "  When none are set, activities use StubActivityExecutor (local demo only; set WORKFLOW_ENGINE_PROFILE=demo\n" +
        "  to enable stub fallback for unconfigured node types inside a partial composite).\n" +
        "  Manifest schema: same as `workflows-engine mcp-manifest validate` (mcpServers stdio subset).\n"
    );
    return;
  }

  const manifestPath = resolveWorkflowEngineMcpConfigPath(process.argv);
  let activityExecutor = undefined;
  try {
    const loaded = await loadProductionActivityExecutor({ manifestPath });
    if (!loaded.ok) {
      if ("errors" in loaded && loaded.errors) {
        process.stderr.write(
          `[engine-mcp-stdio] Invalid operator manifest at ${manifestPath}:\n${formatMcpManifestValidationErrors(loaded.errors)}\n`
        );
      } else {
        process.stderr.write(`[engine-mcp-stdio] Activity executor configuration failed: ${loaded.error}\n`);
      }
      process.exitCode = 1;
      return;
    }
    activityExecutor = loaded.executor;
  } catch (err) {
    process.stderr.write(
      `[engine-mcp-stdio] Activity executor configuration failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exitCode = 1;
    return;
  }

  const store = new MemoryExecutionHistoryStore();
  const workflowPort = createWorkflowApplicationPort({
    store,
    ...(activityExecutor ? { activityExecutor } : {}),
  });
  const server = createMcpWorkflowStdioServer(workflowPort);

  process.on("uncaughtException", (error) => {
    process.stderr.write(`[engine-mcp-stdio] uncaught exception: ${error instanceof Error ? error.message : String(error)}\n`);
  });
  process.on("unhandledRejection", (reason) => {
    process.stderr.write(`[engine-mcp-stdio] unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}\n`);
  });

  await server.start();
}

main().catch((error) => {
  process.stderr.write(`[engine-mcp-stdio] startup failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
