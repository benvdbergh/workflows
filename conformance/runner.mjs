import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateWorkflowDefinition } from "../packages/engine/src/validate.mjs";
import {
  MemoryExecutionHistoryStore,
  runPocWorkflow,
  submitActivityOutcome,
} from "../packages/engine/src/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const vectorsRoot = path.join(__dirname, "vectors");

/**
 * @typedef {{
 *   id: string;
 *   description?: string;
 *   kind: "schema" | "replay";
 *   definition: string;
 *   input?: Record<string, unknown>;
 *   historyPrefix?: Array<{
 *     kind: "command" | "event";
 *     name: string;
 *     payload?: Record<string, unknown>;
 *   }>;
 *   activityExecutionMode?: "in_process" | "host_mediated";
 *   activitySubmissions?: Array<{
 *     nodeId: string;
 *     outcome:
 *       | { ok: true; result?: Record<string, unknown> }
 *       | { ok: false; error: string; code?: string };
 *     expectedParallelSpan?: {
 *       parallelNodeId: string;
 *       joinTargetId: string;
 *       branchName: string;
 *       branchEntryNodeId: string;
 *     };
 *     expectFailure?: { code: string };
 *   }>;
 *   expect:
 *     | {
 *         ok: boolean;
 *         diagnostics?: Array<{
 *           instancePath?: string;
 *           keyword?: string;
 *           messageIncludes?: string;
 *         }>;
 *       }
 *     | {
 *         status: "completed" | "failed" | "interrupted" | "awaiting_activity";
 *         tailCommands?: Array<{
 *           name: string;
 *           nodeId?: string;
 *         }>;
 *         mismatch?: {
 *           messageIncludes?: string;
 *           expected?: { name?: string; nodeId?: string };
 *           actual?: { name?: string; nodeId?: string };
 *         };
 *       };
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
 * @param {import("../packages/engine/src/persistence/types.mjs").HistoryRow} row
 * @returns {{ name: string; nodeId?: string }}
 */
function commandIdentity(row) {
  return {
    name: row.name,
    ...(typeof row.payload?.nodeId === "string" ? { nodeId: row.payload.nodeId } : {}),
  };
}

/**
 * @param {{ name?: string; nodeId?: string } | undefined} expected
 * @param {{ name?: string; nodeId?: string } | undefined} actual
 * @returns {boolean}
 */
function commandIdentityMatches(expected, actual) {
  if (!expected || !actual) return false;
  if (expected.name !== undefined && expected.name !== actual.name) return false;
  if (expected.nodeId !== undefined && expected.nodeId !== actual.nodeId) return false;
  return true;
}

/**
 * @param {ConformanceVector} vector
 */
async function runReplayVector(vector) {
  const definitionPath = path.resolve(repoRoot, vector.definition);
  const definition = JSON.parse(readFileSync(definitionPath, "utf8"));
  const validation = validateWorkflowDefinition(definition);
  if (!validation.ok) {
    return {
      passed: false,
      reason: "Replay vector definition failed schema validation.",
      context: {
        definition: vector.definition,
        errors: validation.errors?.slice(0, 5) ?? [],
      },
    };
  }

  const executionId = `${vector.id}::exec`;
  const store = new MemoryExecutionHistoryStore();
  const prefix = Array.isArray(vector.historyPrefix) ? vector.historyPrefix : [];
  for (const row of prefix) {
    store.append(executionId, {
      kind: row.kind,
      name: row.name,
      payload: { executionId, ...(row.payload ?? {}) },
    });
  }

  const beforeCount = store
    .listByExecution(executionId)
    .filter((row) => row.kind === "command").length;

  const activityExecutionMode = vector.activityExecutionMode ?? "in_process";
  const activitySubmissions = Array.isArray(vector.activitySubmissions) ? vector.activitySubmissions : [];

  let run = await runPocWorkflow({
    definition,
    input: vector.input ?? {},
    executionId,
    store,
    activityExecutionMode,
  });

  for (const step of activitySubmissions) {
    const sub = await submitActivityOutcome({
      definition,
      executionId,
      store,
      input: vector.input ?? {},
      nodeId: step.nodeId,
      outcome: step.outcome,
      ...(step.expectedParallelSpan ? { expectedParallelSpan: step.expectedParallelSpan } : {}),
      activityExecutionMode,
    });
    if (step.expectFailure) {
      if (sub.status !== "failed" || sub.code !== step.expectFailure.code) {
        return {
          passed: false,
          reason: `Expected activity submit failure with code "${step.expectFailure.code}" but got status "${sub.status}"${
            sub.status === "failed" && "code" in sub && sub.code ? ` (code ${sub.code})` : ""
          }.`,
          context: { definition: vector.definition },
        };
      }
    } else {
      run = sub;
    }
  }

  const expect =
    vector.expect && "status" in vector.expect
      ? /** @type {{ status: "completed" | "failed" | "interrupted" | "awaiting_activity"; tailCommands?: Array<{ name: string; nodeId?: string }>; mismatch?: { messageIncludes?: string; expected?: { name?: string; nodeId?: string }; actual?: { name?: string; nodeId?: string } } }} */ (vector.expect)
      : undefined;
  if (!expect) {
    return {
      passed: false,
      reason:
        'Replay vectors require expect.status ("completed" | "failed" | "interrupted" | "awaiting_activity").',
      context: { definition: vector.definition },
    };
  }

  if (run.status !== expect.status) {
    return {
      passed: false,
      reason: `Expected replay status "${expect.status}" but got "${run.status}".`,
      context: { definition: vector.definition },
    };
  }

  const allRows = store.listByExecution(executionId);
  const tailCommands = allRows
    .filter((row) => row.kind === "command")
    .slice(beforeCount)
    .map(commandIdentity);

  if (Array.isArray(expect.tailCommands)) {
    const expectedTail = expect.tailCommands;
    if (tailCommands.length !== expectedTail.length) {
      return {
        passed: false,
        reason: `Tail command length mismatch: expected ${expectedTail.length}, got ${tailCommands.length}.`,
        context: {
          expectedTail,
          actualTail: tailCommands,
        },
      };
    }
    for (let i = 0; i < expectedTail.length; i++) {
      if (!commandIdentityMatches(expectedTail[i], tailCommands[i])) {
        return {
          passed: false,
          reason: `Tail command mismatch at index ${i + 1}.`,
          context: {
            expectedTail,
            actualTail: tailCommands,
          },
        };
      }
    }
  }

  if (expect.mismatch) {
    const failedEvent = [...allRows]
      .reverse()
      .find((row) => row.kind === "event" && row.name === "ExecutionFailed");
    const context = failedEvent?.payload?.context;
    const expectedIdentity =
      context && typeof context === "object" && context.expected && typeof context.expected === "object"
        ? /** @type {{ name?: string; nodeId?: string }} */ (context.expected)
        : undefined;
    const actualIdentity =
      context && typeof context === "object" && context.actual && typeof context.actual === "object"
        ? /** @type {{ name?: string; nodeId?: string }} */ (context.actual)
        : undefined;
    const message = typeof failedEvent?.payload?.error === "string" ? failedEvent.payload.error : run.error ?? "";
    const mismatchPoint = message.match(/command index (\d+)/i);

    if (
      expect.mismatch.messageIncludes &&
      !message.toLowerCase().includes(expect.mismatch.messageIncludes.toLowerCase())
    ) {
      return {
        passed: false,
        reason: "Mismatch diagnostic message did not include expected fragment.",
        context: {
          expectedMessageIncludes: expect.mismatch.messageIncludes,
          actualMessage: message,
        },
      };
    }
    if (expect.mismatch.expected && !commandIdentityMatches(expect.mismatch.expected, expectedIdentity)) {
      return {
        passed: false,
        reason: "Mismatch diagnostic expected identity did not match.",
        context: {
          expected: expect.mismatch.expected,
          actual: expectedIdentity,
        },
      };
    }
    if (expect.mismatch.actual && !commandIdentityMatches(expect.mismatch.actual, actualIdentity)) {
      return {
        passed: false,
        reason: "Mismatch diagnostic actual identity did not match.",
        context: {
          expected: expect.mismatch.actual,
          actual: actualIdentity,
        },
      };
    }

    return {
      passed: true,
      context: {
        replay: {
          prefixCommandCount: beforeCount,
          derivedReplayCursor: beforeCount + 1,
        },
        mismatch: {
          firstMismatchCommandIndex: mismatchPoint ? Number(mismatchPoint[1]) : undefined,
          expected: expectedIdentity,
          actual: actualIdentity,
          message,
        },
      },
    };
  }

  return {
    passed: true,
    context: {
      replay: {
        prefixCommandCount: beforeCount,
        derivedReplayCursor: beforeCount + 1,
      },
    },
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
export async function runVector(discovered) {
  const { file, vector } = discovered;
  if (vector.kind !== "schema" && vector.kind !== "replay") {
    return {
      id: vector.id,
      file: path.relative(repoRoot, file),
      passed: false,
      reason: `Unsupported vector kind "${vector.kind}"`,
    };
  }

  try {
    if (vector.kind === "schema") {
      const execution = runSchemaVector(vector);
      const schemaExpect =
        vector.expect && "ok" in vector.expect
          ? /** @type {{ ok: boolean; diagnostics?: Array<{ instancePath?: string; keyword?: string; messageIncludes?: string }> }} */ (vector.expect)
          : { ok: false, diagnostics: [] };
      const category = schemaExpect.ok ? "schema-pass" : "schema-fail-by-design";
      const diagnosticSignals = schemaExpect.diagnostics ?? [];
      if (!schemaExpect.ok && execution.actualOk === false) {
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
    }

    const execution = await runReplayVector(vector);
    return {
      id: vector.id,
      file: path.relative(repoRoot, file),
      category: execution.passed ? "replay-pass" : "replay-fail-by-design",
      passed: execution.passed,
      ...(execution.reason ? { reason: execution.reason } : {}),
      ...(execution.context ? { context: execution.context } : {}),
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
