import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findWorkflowRepoRoot } from "../validate.mjs";

/** @type {Map<string, object>} */
const registry = new Map();

/** @type {Record<string, string> | null} */
let builtinFilenameByRef = null;

/**
 * @param {string} workflowRef
 * @param {object} definition
 */
export function registerWorkflowRef(workflowRef, definition) {
  if (typeof workflowRef !== "string" || !workflowRef.trim()) {
    throw new Error("workflow_ref must be a non-empty string");
  }
  if (!definition || typeof definition !== "object") {
    throw new Error("definition must be a non-null object");
  }
  registry.set(workflowRef, definition);
}

export function clearWorkflowRefs() {
  registry.clear();
}

/**
 * @returns {Record<string, string>}
 */
function builtinRefs() {
  if (!builtinFilenameByRef) {
    builtinFilenameByRef = {
      "urn:awp:wf:unit-tests": "r3-unit-tests-child.workflow.json",
    };
  }
  return builtinFilenameByRef;
}

/**
 * @param {string} workflowRef
 * @returns {object}
 */
export function resolveWorkflowRef(workflowRef) {
  if (typeof workflowRef !== "string" || !workflowRef.trim()) {
    throw new Error("workflow_ref must be a non-empty string");
  }
  const cached = registry.get(workflowRef);
  if (cached) return cached;

  const filename = builtinRefs()[workflowRef];
  if (filename) {
    const root = findWorkflowRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
    const filePath = path.join(root, "examples", filename);
    const definition = JSON.parse(readFileSync(filePath, "utf8"));
    registry.set(workflowRef, definition);
    return definition;
  }

  throw new Error(`Unknown workflow_ref "${workflowRef}" (not registered and no built-in mapping)`);
}
