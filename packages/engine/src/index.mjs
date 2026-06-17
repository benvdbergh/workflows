/**
 * @agent-workflow/engine — workflow definition validation and execution history port (persistence adapters).
 *
 * @typedef {import("./orchestrator/activity-executor.mjs").ActivityExecutorContext} ActivityExecutorContext
 * @typedef {import("./orchestrator/activity-executor.mjs").ActivityExecutorResult} ActivityExecutorResult
 * @typedef {import("./orchestrator/activity-executor.mjs").ActivityExecutor} ActivityExecutor
 */
export * from "./validate.mjs";
export { verifyDefinitionSignature, extractDefinitionSignature } from "./definition-signing.mjs";
export {
  redactSecretsInPayload,
  isSecretPayloadKey,
  SECRET_PAYLOAD_KEY_NAMES,
  REDACTED_VALUE,
} from "./persistence/secret-redaction.mjs";
export { RedactingExecutionHistoryStore } from "./persistence/redacting-history-store.mjs";
export {
  MAX_MCP_WORKFLOW_JSON_BYTES,
  assertMcpJsonWithinSizeLimit,
  assertValidWorkflowDefinitionAtTransport,
  validateWorkflowStartTransportPayload,
  validateWorkflowResumeTransportPayload,
} from "./adapters/mcp/transport-validation.mjs";
export {
  assertMcpCommandAllowed,
  resolveMcpCommandAllowlistFromEnv,
  DEFAULT_MCP_COMMAND_ALLOWLIST,
} from "./orchestrator/mcp-stdio-activity-executor.mjs";
export { RejectingActivityExecutor, StubActivityExecutor } from "./orchestrator/activity-executor.mjs";
export {
  MockA2ADelegateExecutor,
  RejectingDelegateExecutor,
  mintDelegateCorrelationId,
} from "./orchestrator/delegate-executor.mjs";
export {
  A2ADelegateExecutor,
  HttpA2ATransport,
  parseA2AOperatorConfig,
  parseA2ATaskResponse,
  pollA2ATaskUntilTerminal,
  resolveA2AApiKey,
} from "./orchestrator/a2a-delegate-executor.mjs";
export {
  buildCompositeDelegateExecutor,
  CompositeDelegateExecutor,
} from "./orchestrator/composite-delegate-executor.mjs";
export {
  mapMcpActivityResultToDelegateResult,
  McpDelegateExecutor,
  resolveDelegateAgentBinding,
} from "./orchestrator/mcp-delegate-executor.mjs";
export {
  normalizeSdkDelegateHandlers,
  SdkDelegateExecutor,
} from "./orchestrator/sdk-delegate-executor.mjs";
export {
  callMcpToolStdio,
  DEFAULT_MCP_ACTIVITY_TOOL_TIMEOUT_MS,
  mapMcpCallToolResultToActivityResult,
  mapMcpClientThrownError,
  McpManifestActivityExecutor,
} from "./orchestrator/mcp-stdio-activity-executor.mjs";
export {
  buildLlmChatMessages,
  LlmActivityExecutor,
  OpenAiCompatibleLlmProvider,
  parseLlmAssistantContent,
  parseLlmCallNodeConfig,
  resolveLlmApiKey,
  validateLlmStructuredOutput,
} from "./orchestrator/llm-activity-executor.mjs";
export {
  parseStepNodeConfig,
  StepActivityExecutor,
  StepHandlerRegistry,
} from "./orchestrator/step-activity-executor.mjs";
export {
  buildCompositeActivityExecutor,
  CompositeActivityExecutor,
} from "./orchestrator/composite-activity-executor.mjs";
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
export { runGraphWorkflow, resumeGraphWorkflow, submitActivityOutcome } from "./orchestrator/workflow-graph-walker.mjs";
export { hydrateReplayContext } from "./orchestrator/replay-loader.mjs";
export { createWorkflowApplicationPort } from "./application/workflow-application-port.mjs";
export { createMcpWorkflowStdioServer } from "./adapters/mcp/stdio-server.mjs";
export { createMcpWorkflowToolHandlers } from "./adapters/mcp/workflow-tools.mjs";
export { createRestWorkflowHandler } from "./adapters/rest/rest-handler.mjs";
export { DefinitionRegistry } from "./adapters/rest/definition-registry.mjs";
export {
  startResponseFromPort,
  statusResponseFromPort,
  resumeResponseFromPort,
  submitActivityResponseFromPort,
  historyRowToTransport,
} from "./adapters/transport-response.mjs";
export { MCP_ADAPTER_ERROR, McpAdapterError } from "./adapters/mcp/errors.mjs";
export {
  normalizeMcpOperatorManifest,
  readAndValidateMcpOperatorManifestFile,
  resolveMcpOperatorManifestPath,
  validateMcpOperatorManifest,
} from "./config/mcp-operator-manifest.mjs";
