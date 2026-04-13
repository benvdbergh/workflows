import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  workflowResumeArgsSchema,
  workflowStartArgsSchema,
  workflowStatusArgsSchema,
} from "./contracts.mjs";
import { createMcpWorkflowToolHandlers } from "./workflow-tools.mjs";

/**
 * @param {{ startWorkflow: Function; getWorkflowStatus: Function; resumeWorkflow: Function }} workflowPort
 */
export function createMcpWorkflowStdioServer(workflowPort) {
  const server = new McpServer({
    name: "@agent-workflow-protocol/engine-mcp-stdio",
    version: "0.0.0",
  });
  const handlers = createMcpWorkflowToolHandlers(workflowPort);

  server.registerTool(
    "workflow_start",
    {
      title: "Start workflow execution",
      description: "Start a workflow execution and return canonical execution identity and current terminal/interrupted status.",
      inputSchema: workflowStartArgsSchema,
    },
    (args) => handlers.workflow_start(args)
  );

  server.registerTool(
    "workflow_status",
    {
      title: "Read workflow status",
      description: "Read workflow phase, active node, and last known failure for an execution identity.",
      inputSchema: workflowStatusArgsSchema,
    },
    (args) => handlers.workflow_status(args)
  );

  server.registerTool(
    "workflow_resume",
    {
      title: "Resume interrupted workflow",
      description: "Resume an interrupted workflow with a resume payload bound to an execution identity.",
      inputSchema: workflowResumeArgsSchema,
    },
    (args) => handlers.workflow_resume(args)
  );

  return {
    server,
    /**
     * @returns {Promise<void>}
     */
    async start() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },
    /**
     * @returns {Promise<void>}
     */
    async close() {
      await server.close();
    },
  };
}
