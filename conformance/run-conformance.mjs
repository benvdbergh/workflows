import { discoverVectors, runVector } from "./runner.mjs";
import { runSdkParitySmoke } from "./sdk-parity-smoke.mjs";
import { runSqliteStoreSmoke } from "./sqlite-store-smoke.mjs";

/**
 * @returns {string | undefined}
 */
function parseProfile() {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--profile=")) {
      return arg.slice("--profile=".length);
    }
  }
  const envProfile = process.env.CONFORMANCE_PROFILE;
  return envProfile && envProfile.length > 0 ? envProfile : undefined;
}

const profile = parseProfile();
const discovered = discoverVectors({ profile });
if (profile && discovered.length === 0) {
  console.error(`FAIL [profile] No conformance vectors match profile "${profile}"`);
  console.log(JSON.stringify({ status: "fail", profile, total: 0, passed: 0, failed: 1, reason: "no_vectors_for_profile" }, null, 2));
  process.exitCode = 1;
  process.exit(1);
}
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
const sqliteSmoke = await runSqliteStoreSmoke();
if (sqliteSmoke.passed) {
  console.error("PASS [sqlite-store-smoke] SqliteExecutionHistoryStore persistence");
} else {
  console.error(`FAIL [sqlite-store-smoke] ${sqliteSmoke.reason}`);
  results.push({
    id: "sqlite-store-smoke",
    file: "conformance/sqlite-store-smoke.mjs",
    category: "sqlite-store-fail",
    passed: false,
    reason: sqliteSmoke.reason,
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
  profile: profile ?? null,
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
    sqliteStoreFail: results.filter((result) => result.category === "sqlite-store-fail").length,
    unexpected: results.filter((result) => result.category === "unexpected").length,
  },
  vectors: results,
};

console.log(JSON.stringify(summary, null, 2));
process.exitCode = failed.length === 0 ? 0 : 1;
