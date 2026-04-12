/**
 * POC workflow definition validation (JSON Schema Draft 2020-12).
 * Mirrors scripts/validate-workflows.mjs: same schema path relative to repo root, same Ajv options.
 */
import Ajv2020 from "ajv/dist/2020.js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {string | null} */
let cachedRepoRoot = null;

/**
 * Walks upward from `startDir` to find the repository root that contains `schemas/workflow-definition-poc.json`.
 * @param {string} startDir
 * @returns {string}
 */
export function findWorkflowRepoRoot(startDir = __dirname) {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (dir !== root) {
    const candidate = path.join(dir, "schemas", "workflow-definition-poc.json");
    if (existsSync(candidate)) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(
    "Could not locate schemas/workflow-definition-poc.json; run the engine from a checkout of the workflows repository."
  );
}

/**
 * @returns {string}
 */
function getRepoRoot() {
  if (!cachedRepoRoot) cachedRepoRoot = findWorkflowRepoRoot(__dirname);
  return cachedRepoRoot;
}

/**
 * @returns {import("ajv").AnySchema}
 */
function loadPocSchema() {
  const schemaPath = path.join(getRepoRoot(), "schemas", "workflow-definition-poc.json");
  return JSON.parse(readFileSync(schemaPath, "utf8"));
}

/** @type {import("ajv").ValidateFunction | null} */
let cachedValidate = null;

/**
 * Compiles the POC schema once (cached) and returns a function that validates arbitrary parsed JSON objects.
 * @returns {(data: unknown) => { ok: true } | { ok: false, errors: import("ajv").ErrorObject[] | null | undefined }}
 */
export function compileWorkflowValidator() {
  if (!cachedValidate) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    cachedValidate = ajv.compile(loadPocSchema());
  }
  const validate = cachedValidate;
  return (data) => {
    const valid = validate(data);
    if (valid) return { ok: true };
    return { ok: false, errors: validate.errors ?? [] };
  };
}

/**
 * Validates `data` against `schemas/workflow-definition-poc.json` (Draft 2020-12).
 * @param {unknown} data Parsed JSON value (object).
 * @returns {{ ok: true } | { ok: false, errors: import("ajv").ErrorObject[] }}
 */
export function validateWorkflowDefinition(data) {
  return compileWorkflowValidator()(data);
}
