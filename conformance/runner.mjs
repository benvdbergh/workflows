import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MemoryExecutionHistoryStore,
  RejectingActivityExecutor,
  RejectingDelegateExecutor,
  RetryCountingStepExecutor,
  resumeGraphWorkflow,
  runGraphWorkflow,
  StepActivityExecutor,
  StepHandlerRegistry,
  submitActivityOutcome,
  validateWorkflowDefinition,
  verifyDefinitionSignature,
} from "../packages/engine/src/index.mjs";
import { loadPublicKeysFromConfig } from "../packages/engine/src/definition-signing.mjs";
import { signDefinitionForTest, TEST_SIGNING_PRIVATE_KEY_PKCS8_B64URL } from "../packages/engine/test/helpers/definition-signing-test-helpers.mjs";
import { runParityVector } from "./parity-runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const vectorsRoot = path.join(__dirname, "vectors");

/**
 * @typedef {{
 *   id: string;
 *   description?: string;
 *   kind: "schema" | "replay" | "parity" | "signing";
 *   definition: string;
 *   input?: Record<string, unknown>;
 *   historyPrefix?: Array<{
 *     kind: "command" | "event";
 *     name: string;
 *     payload?: Record<string, unknown>;
 *   }>;
 *   activityExecutionMode?: "in_process" | "host_mediated";
 *   assertNoActivityExecutorInvocation?: boolean;
 *   stepHandlers?: Record<string, Record<string, unknown>>;
 *   retryCountingExecutor?: { failCount?: number; successOutput?: Record<string, unknown>; errorCode?: string };
 *   assertNoSubworkflowInvocation?: boolean;
 *   assertNoDelegateExecutorInvocation?: boolean;
 *   resumePayload?: Record<string, unknown>;
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
 *     definitionTamper?: Record<string, unknown>;
 *   }>;
 *   resumeDefinitionTamper?: Record<string, unknown>;
 *   signFixture?: boolean;
 *   signingPolicy?: { mode: "optional" | "require" };
 *   publicKeys?: Record<string, string>;
 *   tamperSignatureValue?: boolean;
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
 *         eventCardinality?: Record<string, number | Record<string, number>>;
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
 * @param {Record<string, Record<string, unknown>>} stepHandlers
 * @returns {import("../packages/engine/src/orchestrator/step-activity-executor.mjs").StepActivityExecutor}
 */
function buildConformanceStepActivityExecutor(stepHandlers) {
  const registry = new StepHandlerRegistry();
  for (const [urn, output] of Object.entries(stepHandlers)) {
    registry.register(urn, async () => output);
  }
  return new StepActivityExecutor({ registry: registry.createFrozenCopy() });
}

/**
 * @param {object} definition
 * @param {Record<string, unknown> | undefined} tamper
 */
function definitionWithTamper(definition, tamper) {
  if (!tamper || typeof tamper !== "object") {
    return definition;
  }
  return JSON.parse(JSON.stringify({ ...definition, ...tamper }));
}

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
 * @param {ConformanceVector} vector
 */
function runSigningVector(vector) {
  const definitionPath = path.resolve(repoRoot, vector.definition);
  let definition = JSON.parse(readFileSync(definitionPath, "utf8"));
  if (vector.signFixture === true) {
    definition = signDefinitionForTest(definition, TEST_SIGNING_PRIVATE_KEY_PKCS8_B64URL);
  }
  if (vector.tamperSignatureValue === true && definition.document?.signature) {
    definition.document.signature.value = definition.document.signature.value.replace(/.$/, "X");
  }
  const policy = vector.signingPolicy ?? { mode: "optional" };
  const publicKeysById = loadPublicKeysFromConfig(vector.publicKeys ?? {});
  const result = verifyDefinitionSignature(definition, { policy, publicKeysById });
  const expect = /** @type {{ ok: boolean; verified?: boolean }} */ (vector.expect);
  const passed =
    result.ok === expect.ok &&
    (expect.verified === undefined || (result.ok && result.verified === expect.verified));
  return {
    passed,
    result,
    expect,
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
  const assertNoActivityExecutorInvocation = vector.assertNoActivityExecutorInvocation === true;
  const assertNoSubworkflowInvocation = vector.assertNoSubworkflowInvocation === true;
  const assertNoDelegateExecutorInvocation = vector.assertNoDelegateExecutorInvocation === true;
  let activityExecutor = assertNoActivityExecutorInvocation ? new RejectingActivityExecutor() : undefined;
  if (
    !activityExecutor &&
    vector.retryCountingExecutor &&
    typeof vector.retryCountingExecutor === "object" &&
    !Array.isArray(vector.retryCountingExecutor)
  ) {
    activityExecutor = new RetryCountingStepExecutor(vector.retryCountingExecutor);
  }
  if (
    !activityExecutor &&
    vector.stepHandlers &&
    typeof vector.stepHandlers === "object" &&
    !Array.isArray(vector.stepHandlers)
  ) {
    activityExecutor = buildConformanceStepActivityExecutor(vector.stepHandlers);
  }
  const delegateExecutor = assertNoDelegateExecutorInvocation ? new RejectingDelegateExecutor() : undefined;

  let run = await runGraphWorkflow({
    definition,
    input: vector.input ?? {},
    executionId,
    store,
    activityExecutionMode,
    ...(activityExecutor ? { activityExecutor } : {}),
    ...(delegateExecutor ? { delegateExecutor } : {}),
    ...(assertNoSubworkflowInvocation ? { assertNoSubworkflowInvocation: true } : {}),
    ...(assertNoDelegateExecutorInvocation ? { assertNoDelegateExecutorInvocation: true } : {}),
  });

  for (const step of activitySubmissions) {
    const submitDefinition = definitionWithTamper(definition, step.definitionTamper);
    const sub = await submitActivityOutcome({
      definition: submitDefinition,
      executionId,
      store,
      input: vector.input ?? {},
      nodeId: step.nodeId,
      outcome: step.outcome,
      ...(step.expectedParallelSpan ? { expectedParallelSpan: step.expectedParallelSpan } : {}),
      activityExecutionMode,
      ...(activityExecutor ? { activityExecutor } : {}),
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

  if (vector.resumePayload && typeof vector.resumePayload === "object" && !Array.isArray(vector.resumePayload)) {
    const resumeDefinition = definitionWithTamper(
      definition,
      /** @type {{ resumeDefinitionTamper?: Record<string, unknown> }} */ (vector).resumeDefinitionTamper
    );
    run = await resumeGraphWorkflow({
      definition: resumeDefinition,
      executionId,
      store,
      resumePayload: vector.resumePayload,
      ...(activityExecutor ? { activityExecutor } : {}),
      ...(delegateExecutor ? { delegateExecutor } : {}),
      ...(assertNoSubworkflowInvocation ? { assertNoSubworkflowInvocation: true } : {}),
      ...(assertNoDelegateExecutorInvocation ? { assertNoDelegateExecutorInvocation: true } : {}),
    });
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

  if (expect.eventCardinality && typeof expect.eventCardinality === "object") {
    const events = allRows.filter((row) => row.kind === "event");
    for (const [eventName, expectedCount] of Object.entries(expect.eventCardinality)) {
      if (typeof expectedCount === "number") {
        const actual = events.filter((row) => row.name === eventName).length;
        if (actual !== expectedCount) {
          return {
            passed: false,
            reason: `Event cardinality mismatch for "${eventName}": expected ${expectedCount}, got ${actual}.`,
            context: { definition: vector.definition, eventName, expectedCount, actual },
          };
        }
        continue;
      }
      if (expectedCount && typeof expectedCount === "object") {
        for (const [nodeId, perNodeExpected] of Object.entries(expectedCount)) {
          const actual = events.filter(
            (row) => row.name === eventName && row.payload?.nodeId === nodeId
          ).length;
          if (actual !== perNodeExpected) {
            return {
              passed: false,
              reason: `Event cardinality mismatch for "${eventName}" node "${nodeId}": expected ${perNodeExpected}, got ${actual}.`,
              context: { definition: vector.definition, eventName, nodeId, expectedCount: perNodeExpected, actual },
            };
          }
        }
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
  if (vector.kind !== "schema" && vector.kind !== "replay" && vector.kind !== "parity" && vector.kind !== "signing") {
    return {
      id: vector.id,
      file: path.relative(repoRoot, file),
      passed: false,
      reason: `Unsupported vector kind "${vector.kind}"`,
    };
  }

  try {
    if (vector.kind === "parity") {
      const execution = await runParityVector(
        /** @type {import("./parity-runner.mjs").ParityVector} */ (vector),
        repoRoot
      );
      const category = execution.category ?? (execution.passed ? "parity-pass" : "parity-fail");
      return {
        id: vector.id,
        file: path.relative(repoRoot, file),
        category,
        passed: execution.passed,
        ...(execution.reason ? { reason: execution.reason } : {}),
        ...(execution.context ? { context: execution.context } : {}),
      };
    }

    if (vector.kind === "signing") {
      const execution = runSigningVector(vector);
      const category = execution.passed ? "signing-pass" : "signing-fail-by-design";
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
        reason: `Expected ok=${execution.expect.ok} verified=${execution.expect.verified ?? "any"} but got ${JSON.stringify(execution.result)}`,
        context: {
          definition: vector.definition,
        },
      };
    }

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
