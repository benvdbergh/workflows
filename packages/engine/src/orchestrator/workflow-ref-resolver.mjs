import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJsonStringify } from "../canonical-json.mjs";
import { findWorkflowRepoRoot } from "../validate.mjs";

/** @type {Map<string, object>} */
const registry = new Map();

/** @type {Map<string, { definition: object; definitionHash: string }>} */
const fetchCache = new Map();

/** @type {Record<string, string> | null} */
let builtinFilenameByRef = null;

/** @type {typeof fetch | null} */
let fetchImpl = null;

/**
 * @param {object} definition
 * @returns {string}
 */
export function computeWorkflowDefinitionHash(definition) {
  return createHash("sha256").update(canonicalJsonStringify(definition)).digest("hex");
}

/**
 * @param {typeof fetch} impl
 */
export function setWorkflowRefFetchImpl(impl) {
  fetchImpl = impl;
}

/**
 * @returns {typeof fetch}
 */
function resolveFetch() {
  if (fetchImpl) return fetchImpl;
  if (typeof globalThis.fetch !== "function") {
    throw new Error("workflow_ref HTTP(S) resolution requires global fetch or setWorkflowRefFetchImpl()");
  }
  return globalThis.fetch;
}

/**
 * @param {string} workflowRef
 * @param {string | undefined} versionPin
 * @returns {string}
 */
function cacheKey(workflowRef, versionPin) {
  return versionPin ? `${workflowRef}\0${versionPin}` : workflowRef;
}

/**
 * @param {object} definition
 * @param {string | undefined} versionPin
 * @returns {object}
 */
function assertVersionPin(definition, versionPin) {
  if (!versionPin) return definition;
  const hash = computeWorkflowDefinitionHash(definition);
  if (hash !== versionPin) {
    throw new Error(
      `workflow_ref version_pin mismatch (expected ${versionPin}, resolved ${hash})`
    );
  }
  return definition;
}

/**
 * @param {string} workflowRef
 * @param {object} definition
 * @param {string | undefined} versionPin
 * @returns {object}
 */
function storeInFetchCache(workflowRef, definition, versionPin) {
  const definitionHash = computeWorkflowDefinitionHash(definition);
  fetchCache.set(cacheKey(workflowRef, versionPin), { definition, definitionHash });
  return definition;
}

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
  fetchCache.clear();
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
 * @returns {boolean}
 */
function isHttpWorkflowRef(workflowRef) {
  return workflowRef.startsWith("http://") || workflowRef.startsWith("https://");
}

/**
 * @param {string} workflowRef
 * @returns {Promise<object>}
 */
async function fetchWorkflowDefinition(workflowRef) {
  const response = await resolveFetch()(workflowRef);
  if (!response.ok) {
    throw new Error(`workflow_ref fetch failed for "${workflowRef}" (HTTP ${response.status})`);
  }
  let definition;
  try {
    definition = await response.json();
  } catch {
    throw new Error(`workflow_ref fetch for "${workflowRef}" returned invalid JSON`);
  }
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw new Error(`workflow_ref fetch for "${workflowRef}" must return a JSON object`);
  }
  return /** @type {object} */ (definition);
}

/**
 * @param {string} workflowRef
 * @param {{ versionPin?: string }} [options]
 * @returns {Promise<object>}
 */
export async function resolveWorkflowRef(workflowRef, options = {}) {
  if (typeof workflowRef !== "string" || !workflowRef.trim()) {
    throw new Error("workflow_ref must be a non-empty string");
  }
  const versionPin =
    typeof options.versionPin === "string" && options.versionPin.trim()
      ? options.versionPin.trim()
      : undefined;

  const cachedFetch = fetchCache.get(cacheKey(workflowRef, versionPin));
  if (cachedFetch) {
    assertVersionPin(cachedFetch.definition, versionPin);
    return cachedFetch.definition;
  }

  const registered = registry.get(workflowRef);
  if (registered) {
    assertVersionPin(registered, versionPin);
    return storeInFetchCache(workflowRef, registered, versionPin);
  }

  const filename = builtinRefs()[workflowRef];
  if (filename) {
    // Built-in URNs read examples/ under the monorepo root; npm package hosts must registerWorkflowRef.
    const root = findWorkflowRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
    const filePath = path.join(root, "examples", filename);
    const definition = JSON.parse(readFileSync(filePath, "utf8"));
    registry.set(workflowRef, definition);
    assertVersionPin(definition, versionPin);
    return storeInFetchCache(workflowRef, definition, versionPin);
  }

  if (isHttpWorkflowRef(workflowRef)) {
    const definition = await fetchWorkflowDefinition(workflowRef);
    assertVersionPin(definition, versionPin);
    return storeInFetchCache(workflowRef, definition, versionPin);
  }

  throw new Error(`Unknown workflow_ref "${workflowRef}" (not registered and no built-in mapping)`);
}
