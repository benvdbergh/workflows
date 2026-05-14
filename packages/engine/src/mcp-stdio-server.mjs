#!/usr/bin/env node
import { createWorkflowApplicationPort } from "./application/workflow-application-port.mjs";
import { createMcpWorkflowStdioServer } from "./adapters/mcp/stdio-server.mjs";
import {
  formatMcpManifestValidationErrors,
  loadEngineDirectActivityExecutor,
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
        "Engine-direct activity execution (real MCP tool_call via operator manifest):\n" +
        "  Set WORKFLOW_ENGINE_MCP_CONFIG to a JSON file path, or pass --mcp-config <path>.\n" +
        "  When unset, tool_call nodes use the in-process stub (backward-compatible default).\n" +
        "  Manifest schema: same as `workflows-engine mcp-manifest validate` (mcpServers stdio subset).\n"
    );
    return;
  }

  const manifestPath = resolveWorkflowEngineMcpConfigPath(process.argv);
  let activityExecutor = undefined;
  if (manifestPath) {
    const loaded = await loadEngineDirectActivityExecutor(manifestPath);
    if (!loaded.ok) {
      process.stderr.write(
        `[engine-mcp-stdio] Invalid operator manifest at ${manifestPath}:\n${formatMcpManifestValidationErrors(loaded.errors)}\n`
      );
      process.exitCode = 1;
      return;
    }
    activityExecutor = loaded.executor;
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
