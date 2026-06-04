import { validateWorkflowDefinition } from "../../validate.mjs";
import { verifyDefinitionSignature } from "../../definition-signing.mjs";
import { MCP_ADAPTER_ERROR, McpAdapterError } from "./errors.mjs";

/** Maximum UTF-8 byte length for JSON-serialized MCP workflow payloads (definition, input, resume). */
export const MAX_MCP_WORKFLOW_JSON_BYTES = 2 * 1024 * 1024;

/**
 * @param {unknown} value
 * @returns {number}
 */
export function measureUtf8JsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

/**
 * @param {string} label
 * @param {unknown} value
 * @param {number} [maxBytes]
 */
export function assertMcpJsonWithinSizeLimit(label, value, maxBytes = MAX_MCP_WORKFLOW_JSON_BYTES) {
  const bytes = measureUtf8JsonBytes(value);
  if (bytes > maxBytes) {
    throw new McpAdapterError(
      MCP_ADAPTER_ERROR.VALIDATION_ERROR,
      `${label} exceeds maximum allowed JSON size (${maxBytes} bytes).`,
      { label, bytes, maxBytes }
    );
  }
}

/**
 * AJV + graph invariants + optional definition signing hook at the MCP transport boundary.
 *
 * @param {unknown} definition
 */
export function assertValidWorkflowDefinitionAtTransport(definition) {
  const v = validateWorkflowDefinition(definition);
  if (!v.ok) {
    throw new McpAdapterError(MCP_ADAPTER_ERROR.VALIDATION_ERROR, "Workflow definition failed schema validation.", {
      errors: v.errors,
    });
  }
  const signing = verifyDefinitionSignature(definition);
  if (!signing.ok) {
    throw new McpAdapterError(
      MCP_ADAPTER_ERROR.VALIDATION_ERROR,
      signing.error ?? "Workflow definition signature verification failed.",
      { signing }
    );
  }
}

/**
 * @param {unknown} definition
 * @param {unknown} [extraPayload] input or resume_payload sized together with definition
 */
export function validateWorkflowStartTransportPayload(definition, extraPayload) {
  assertMcpJsonWithinSizeLimit("definition", definition);
  if (extraPayload !== undefined) {
    assertMcpJsonWithinSizeLimit("input", extraPayload);
  }
  assertValidWorkflowDefinitionAtTransport(definition);
}

/**
 * @param {unknown} definition
 * @param {unknown} resumePayload
 */
export function validateWorkflowResumeTransportPayload(definition, resumePayload) {
  assertMcpJsonWithinSizeLimit("definition", definition);
  assertMcpJsonWithinSizeLimit("resume_payload", resumePayload);
  assertValidWorkflowDefinitionAtTransport(definition);
}
