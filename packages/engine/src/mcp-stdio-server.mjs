#!/usr/bin/env node
import { createWorkflowApplicationPort } from "./application/workflow-application-port.mjs";
import { createMcpWorkflowStdioServer } from "./adapters/mcp/stdio-server.mjs";
import { MemoryExecutionHistoryStore } from "./persistence/memory-history-store.mjs";

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) {
    process.stdout.write(
      "Usage: node packages/engine/src/mcp-stdio-server.mjs\n" +
        "Starts MCP stdio adapter with workflow_start/workflow_status/workflow_resume tools.\n"
    );
    return;
  }

  const store = new MemoryExecutionHistoryStore();
  const workflowPort = createWorkflowApplicationPort({ store });
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
