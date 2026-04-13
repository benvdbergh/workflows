/**
 * POC workflow definition validation (JSON Schema Draft 2020-12).
 * Mirrors scripts/validate-workflows.mjs: same schema path relative to repo root, same Ajv options.
 */
import Ajv2020 from "ajv/dist/2020.js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * POC schema shipped next to `src/` inside the published package (no-install / npx).
 * @returns {string}
 */
function bundledPocSchemaPath() {
  return path.join(__dirname, "..", "schemas", "workflow-definition-poc.json");
}

/**
 * Walks upward from `startDir` to find the **workflows** monorepo root (fixtures, shared scripts).
 * Uses `examples/lighthouse-customer-routing.workflow.json` plus root `package.json` named `workflows`
 * so this does not stop at `packages/engine` when that directory also carries a bundled schema copy.
 * @param {string} startDir
 * @returns {string}
 */
export function findWorkflowRepoRoot(startDir = __dirname) {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (dir !== root) {
    const lighthouse = path.join(dir, "examples", "lighthouse-customer-routing.workflow.json");
    const rootPkgPath = path.join(dir, "package.json");
    if (existsSync(lighthouse) && existsSync(rootPkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
        if (pkg.name === "workflows") return dir;
      } catch {
        // ignore invalid package.json
      }
    }
    dir = path.dirname(dir);
  }
  throw new Error(
    'Could not locate workflows repository root (expected examples/lighthouse-customer-routing.workflow.json and a root package.json with "name": "workflows").'
  );
}

/**
 * @returns {import("ajv").AnySchema}
 */
function loadPocSchema() {
  const bundled = bundledPocSchemaPath();
  if (existsSync(bundled)) {
    return JSON.parse(readFileSync(bundled, "utf8"));
  }
  const schemaPath = path.join(findWorkflowRepoRoot(__dirname), "schemas", "workflow-definition-poc.json");
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
