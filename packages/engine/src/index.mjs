/**
 * @agent-workflow-protocol/engine — POC validation and execution history port (persistence adapters).
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
  assertNoCustomReducers,
  applyOutputWithReducers,
  computeLinearNodePath,
  runLinearWorkflow,
} from "./orchestrator/linear-runner.mjs";
export { runPocWorkflow, resumePocWorkflow } from "./orchestrator/poc-runner.mjs";
