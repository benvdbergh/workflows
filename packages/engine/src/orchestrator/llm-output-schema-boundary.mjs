/**
 * Activity-boundary validation for `llm_call` structured outputs (`output_schema`).
 */
import { parseLlmCallNodeConfig, validateLlmStructuredOutput } from "./llm-activity-executor.mjs";

/** @typedef {"OUTPUT_SCHEMA_VIOLATION"} OutputSchemaViolationCode */

export const OUTPUT_SCHEMA_VIOLATION = "OUTPUT_SCHEMA_VIOLATION";

/**
 * @param {unknown} output
 * @returns {Record<string, unknown>}
 */
function normalizeActivityOutput(output) {
  return output && typeof output === "object" && !Array.isArray(output)
    ? /** @type {Record<string, unknown>} */ ({ .../** @type {object} */ (output) })
    : { value: output };
}

/**
 * Validate an activity result at the graph-walker boundary when the node is `llm_call` with `output_schema`.
 *
 * @param {{ type: string; config?: object }} node
 * @param {unknown} output
 * @returns {{ ok: true, output: Record<string, unknown> } | { ok: false, error: string, code: OutputSchemaViolationCode }}
 */
export function validateLlmCallOutputAtActivityBoundary(node, output) {
  if (node.type !== "llm_call") {
    return { ok: true, output: normalizeActivityOutput(output) };
  }
  const parsedCfg = parseLlmCallNodeConfig(node.config);
  if (!parsedCfg.ok || !parsedCfg.config.outputSchema) {
    return { ok: true, output: normalizeActivityOutput(output) };
  }
  const validated = validateLlmStructuredOutput(output, parsedCfg.config.outputSchema);
  if (!validated.ok) {
    return { ok: false, error: validated.error, code: OUTPUT_SCHEMA_VIOLATION };
  }
  return validated;
}

/**
 * Map in-process executor failure codes to activity-boundary codes for `llm_call` nodes.
 *
 * @param {{ type: string }} node
 * @param {string | undefined} code
 * @returns {string | undefined}
 */
export function mapLlmActivityFailureCode(node, code) {
  if (node.type === "llm_call" && code === "LLM_OUTPUT_VALIDATION_FAILED") {
    return OUTPUT_SCHEMA_VIOLATION;
  }
  return code;
}
