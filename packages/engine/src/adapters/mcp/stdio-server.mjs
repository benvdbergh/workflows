import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  workflowResumeArgsSchema,
  workflowCancelArgsSchema,
  workflowListArgsSchema,
  workflowSignalArgsSchema,
  workflowStartArgsSchema,
  workflowStatusArgsSchema,
  workflowSubmitActivityArgsSchema,
} from "./contracts.mjs";
import { createMcpWorkflowToolHandlers } from "./workflow-tools.mjs";

const enginePackageJsonPath = fileURLToPath(new URL("../../../package.json", import.meta.url));
const enginePackageVersion = JSON.parse(readFileSync(enginePackageJsonPath, "utf8")).version;

/**
 * @param {{ startWorkflow: Function; getWorkflowStatus: Function; resumeWorkflow: Function; submitWorkflowActivity: Function; signalWorkflow: Function; cancelWorkflow: Function; listWorkflowExecutions: Function }} workflowPort
 * @param {{ transportValidation?: import("./transport-validation.mjs").TransportValidationOptions }} [options]
 */
export function createMcpWorkflowStdioServer(workflowPort, options = {}) {
  const server = new McpServer({
    name: "@agent-workflow/engine-mcp-stdio",
    version: enginePackageVersion,
  });
  const handlers = createMcpWorkflowToolHandlers(workflowPort, {
    transportValidation: options.transportValidation,
  });

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

  server.registerTool(
    "workflow_submit_activity",
    {
      title: "Submit host-mediated activity outcome",
      description:
        "After workflow_start with activity_execution_mode host_mediated, submit success or failure for the pending ActivityRequested node. Requires the same definition and input as the initial start.",
      inputSchema: workflowSubmitActivityArgsSchema,
    },
    (args) => handlers.workflow_submit_activity(args)
  );

  server.registerTool(
    "workflow_signal",
    {
      title: "Deliver workflow signal",
      description:
        "Deliver an external signal to unblock a wait node with config.kind signal. Signal payload keys merge into workflow state via state_schema reducers. Returns EXECUTION_NOT_FOUND when the execution id is unknown. Requires the same definition and input as the initial start.",
      inputSchema: workflowSignalArgsSchema,
    },
    (args) => handlers.workflow_signal(args)
  );

  server.registerTool(
    "workflow_cancel",
    {
      title: "Cancel workflow execution",
      description:
        "Request cooperative cancellation for a non-terminal execution identity. Cancellation takes effect at host pause points (awaiting signal, awaiting activity, interrupted); it does not interrupt an in-process node mid-flight. Returns EXECUTION_NOT_FOUND when the execution id is unknown.",
      inputSchema: workflowCancelArgsSchema,
    },
    (args) => handlers.workflow_cancel(args)
  );

  server.registerTool(
    "workflow_list",
    {
      title: "List workflow executions",
      description:
        "List persisted workflow executions with optional phase, definition name, and date-range filters. Results are paginated (newest first).",
      inputSchema: workflowListArgsSchema,
    },
    (args) => handlers.workflow_list(args)
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
