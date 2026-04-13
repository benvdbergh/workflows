import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateWorkflowDefinition } from "../packages/engine/src/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const vectorsRoot = path.join(__dirname, "vectors");

/**
 * @typedef {{
 *   id: string;
 *   description?: string;
 *   kind: "schema";
 *   definition: string;
 *   expect: {
 *     ok: boolean;
 *     diagnostics?: Array<{
 *       instancePath?: string;
 *       keyword?: string;
 *       messageIncludes?: string;
 *     }>;
 *   };
 * }} ConformanceVector
 */

/**
 * @param {string} directory
 * @returns {string[]}
 */
function walk(directory) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".vector.json")) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Deterministic vector discovery in lexical path order.
 * @returns {{ file: string, vector: ConformanceVector }[]}
 */
export function discoverVectors() {
  const vectorFiles = walk(vectorsRoot).sort((a, b) => a.localeCompare(b));
  return vectorFiles.map((file) => {
    const vector = JSON.parse(readFileSync(file, "utf8"));
    return { file, vector };
  });
}

/**
 * @param {ConformanceVector} vector
 */
function runSchemaVector(vector) {
  const definitionPath = path.resolve(repoRoot, vector.definition);
  const definition = JSON.parse(readFileSync(definitionPath, "utf8"));
  const result = validateWorkflowDefinition(definition);
  const passed = result.ok === vector.expect.ok;

  return {
    passed,
    actualOk: result.ok,
    expectedOk: vector.expect.ok,
    errors: result.ok ? [] : (result.errors ?? []),
  };
}

/**
 * @param {import("ajv").ErrorObject} error
 * @param {{ instancePath?: string, keyword?: string, messageIncludes?: string }} signal
 */
function matchesDiagnosticSignal(error, signal) {
  if (signal.instancePath !== undefined && error.instancePath !== signal.instancePath) {
    return false;
  }
  if (signal.keyword !== undefined && error.keyword !== signal.keyword) {
    return false;
  }
  if (signal.messageIncludes !== undefined) {
    const message = error.message ?? "";
    if (!message.toLowerCase().includes(signal.messageIncludes.toLowerCase())) {
      return false;
    }
  }
  return true;
}

/**
 * @param {import("ajv").ErrorObject[]} errors
 * @param {Array<{ instancePath?: string, keyword?: string, messageIncludes?: string }>} signals
 */
function evaluateDiagnosticSignals(errors, signals) {
  if (signals.length === 0) {
    return { ok: true, reason: "" };
  }
  const matched = signals.some((signal) =>
    errors.some((error) => matchesDiagnosticSignal(error, signal))
  );
  if (matched) {
    return { ok: true, reason: "" };
  }
  return {
    ok: false,
    reason: "Validation failed as expected, but none of the expected diagnostic signals matched.",
  };
}

/**
 * @param {{ file: string, vector: ConformanceVector }} discovered
 */
export function runVector(discovered) {
  const { file, vector } = discovered;
  if (vector.kind !== "schema") {
    return {
      id: vector.id,
      file: path.relative(repoRoot, file),
      passed: false,
      reason: `Unsupported vector kind "${vector.kind}"`,
    };
  }

  try {
    const execution = runSchemaVector(vector);
    const category = vector.expect.ok ? "schema-pass" : "schema-fail-by-design";
    const diagnosticSignals = vector.expect.diagnostics ?? [];
    if (!vector.expect.ok && execution.actualOk === false) {
      const diagnosticsCheck = evaluateDiagnosticSignals(execution.errors, diagnosticSignals);
      if (!diagnosticsCheck.ok) {
        return {
          id: vector.id,
          file: path.relative(repoRoot, file),
          category,
          passed: false,
          reason: diagnosticsCheck.reason,
          context: {
            definition: vector.definition,
            expectedSignals: diagnosticSignals,
            errors: execution.errors.slice(0, 5),
          },
        };
      }
    }

    if (execution.passed) {
      return {
        id: vector.id,
        file: path.relative(repoRoot, file),
        category,
        passed: true,
      };
    }

    return {
      id: vector.id,
      file: path.relative(repoRoot, file),
      category,
      passed: false,
      reason: `Expected ok=${execution.expectedOk} but got ok=${execution.actualOk}`,
      context: {
        definition: vector.definition,
        errors: execution.errors.slice(0, 5),
      },
    };
  } catch (error) {
    return {
      id: vector.id,
      file: path.relative(repoRoot, file),
      category: "unexpected",
      passed: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export { repoRoot };
