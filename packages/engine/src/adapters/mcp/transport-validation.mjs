import { validateWorkflowDefinition } from "../../validate.mjs";
import {
  resolveDefinitionSigningOptions,
  stripDefinitionSignature,
  verifyDefinitionSignature,
} from "../../definition-signing.mjs";
import { MCP_ADAPTER_ERROR, McpAdapterError } from "./errors.mjs";

/** Maximum UTF-8 byte length for JSON-serialized MCP workflow payloads (definition, input, resume). */
export const MAX_MCP_WORKFLOW_JSON_BYTES = 2 * 1024 * 1024;

/**
 * @typedef {import("../../definition-signing.mjs").VerifyDefinitionSignatureOptions} TransportSigningOptions
 */

/**
 * @typedef {object} TransportValidationOptions
 * @property {TransportSigningOptions} [signing]
 */

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
 * AJV + graph invariants + definition signing at the MCP transport boundary.
 *
 * @param {unknown} definition
 * @param {TransportValidationOptions} [options]
 */
export function assertValidWorkflowDefinitionAtTransport(definition, options = {}) {
  const forSchema = stripDefinitionSignature(definition);
  const v = validateWorkflowDefinition(forSchema);
  if (!v.ok) {
    throw new McpAdapterError(MCP_ADAPTER_ERROR.VALIDATION_ERROR, "Workflow definition failed schema validation.", {
      errors: v.errors,
    });
  }
  const signingOptions = options.signing ?? resolveDefinitionSigningOptions();
  const signing = verifyDefinitionSignature(definition, signingOptions);
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
 * @param {TransportValidationOptions} [options]
 */
export function validateWorkflowStartTransportPayload(definition, extraPayload, options = {}) {
  assertMcpJsonWithinSizeLimit("definition", definition);
  if (extraPayload !== undefined) {
    assertMcpJsonWithinSizeLimit("input", extraPayload);
  }
  assertValidWorkflowDefinitionAtTransport(definition, options);
}

/**
 * @param {unknown} definition
 * @param {unknown} resumePayload
 * @param {TransportValidationOptions} [options]
 */
export function validateWorkflowResumeTransportPayload(definition, resumePayload, options = {}) {
  assertMcpJsonWithinSizeLimit("definition", definition);
  assertMcpJsonWithinSizeLimit("resume_payload", resumePayload);
  assertValidWorkflowDefinitionAtTransport(definition, options);
}
