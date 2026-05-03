/**
 * @agent-workflow/engine — POC validation and execution history port (persistence adapters).
 *
 * @typedef {import("./orchestrator/activity-executor.mjs").ActivityExecutorContext} ActivityExecutorContext
 * @typedef {import("./orchestrator/activity-executor.mjs").ActivityExecutorResult} ActivityExecutorResult
 * @typedef {import("./orchestrator/activity-executor.mjs").ActivityExecutor} ActivityExecutor
 */
export * from "./validate.mjs";
export { StubActivityExecutor } from "./orchestrator/activity-executor.mjs";
export { MemoryExecutionHistoryStore } from "./persistence/memory-history-store.mjs";
export { SqliteExecutionHistoryStore } from "./persistence/sqlite-history-store.mjs";
export {
  assertHistoryReadableByEngine,
  coerceRecordSchemaVersion,
  CURRENT_HISTORY_RECORD_SCHEMA_VERSION,
  recordSchemaVersionOf,
} from "./persistence/history-record-schema-version.mjs";
export {
  assertNoCustomReducers,
  applyOutputWithReducers,
  computeLinearNodePath,
  runLinearWorkflow,
} from "./orchestrator/linear-runner.mjs";
export { runPocWorkflow, resumePocWorkflow, submitActivityOutcome } from "./orchestrator/poc-runner.mjs";
export { hydrateReplayContext } from "./orchestrator/replay-loader.mjs";
export { createWorkflowApplicationPort } from "./application/workflow-application-port.mjs";
export { createMcpWorkflowStdioServer } from "./adapters/mcp/stdio-server.mjs";
export { createMcpWorkflowToolHandlers } from "./adapters/mcp/workflow-tools.mjs";
export { MCP_ADAPTER_ERROR, McpAdapterError } from "./adapters/mcp/errors.mjs";
export {
  normalizeMcpOperatorManifest,
  readAndValidateMcpOperatorManifestFile,
  resolveMcpOperatorManifestPath,
  validateMcpOperatorManifest,
} from "./config/mcp-operator-manifest.mjs";
