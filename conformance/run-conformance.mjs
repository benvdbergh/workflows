import { discoverVectors, runVector } from "./runner.mjs";
import { runSdkParitySmoke } from "./sdk-parity-smoke.mjs";

const discovered = discoverVectors();
const results = await Promise.all(discovered.map(runVector));
const sdkSmoke = await runSdkParitySmoke();
if (sdkSmoke.passed) {
  console.error("PASS [sdk-parity-smoke] WorkflowClient REST transport");
} else {
  console.error(`FAIL [sdk-parity-smoke] ${sdkSmoke.reason}`);
  results.push({
    id: "sdk-parity-smoke",
    file: "conformance/sdk-parity-smoke.mjs",
    category: "sdk-parity-fail",
    passed: false,
    reason: sdkSmoke.reason,
  });
}
const failed = results.filter((result) => !result.passed);

for (const result of results) {
  if (result.passed) {
    console.error(`PASS [${result.category}] ${result.id} (${result.file})`);
    continue;
  }

  console.error(`FAIL [${result.category ?? "unexpected"}] ${result.id} (${result.file})`);
  console.error(`  reason: ${result.reason}`);
  if (result.context?.definition) {
    console.error(`  definition: ${result.context.definition}`);
  }
  if (Array.isArray(result.context?.errors) && result.context.errors.length > 0) {
    for (const error of result.context.errors) {
      const message = error.message ? ` - ${error.message}` : "";
      console.error(`  ajv: ${error.instancePath} [${error.keyword}]${message}`);
    }
  }
}

const summary = {
  status: failed.length === 0 ? "pass" : "fail",
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  counts: {
    schemaPass: results.filter((result) => result.category === "schema-pass").length,
    schemaFailByDesign: results.filter((result) => result.category === "schema-fail-by-design").length,
    replayPass: results.filter((result) => result.category === "replay-pass").length,
    replayFailByDesign: results.filter((result) => result.category === "replay-fail-by-design").length,
    parityPass: results.filter((result) => result.category === "parity-pass").length,
    parityPending: results.filter((result) => result.category === "parity-pending").length,
    parityFail: results.filter((result) => result.category === "parity-fail").length,
    sdkParityFail: results.filter((result) => result.category === "sdk-parity-fail").length,
    unexpected: results.filter((result) => result.category === "unexpected").length,
  },
  vectors: results,
};

console.log(JSON.stringify(summary, null, 2));
process.exitCode = failed.length === 0 ? 0 : 1;
