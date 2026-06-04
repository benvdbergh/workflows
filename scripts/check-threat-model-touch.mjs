/**
 * Path-based gate: security-sensitive engine/MCP surfaces must update the threat-model
 * regression checklist in the same change set.
 *
 * Usage:
 *   node scripts/check-threat-model-touch.mjs
 *   node scripts/check-threat-model-touch.mjs --base-ref origin/master
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const CHECKLIST = "docs/security/threat-model-regression-checklist.md";

/** Repo-relative prefixes; any changed path under these triggers the gate. */
const SENSITIVE_PREFIXES = [
  "packages/engine/src/adapters/mcp/",
  "packages/engine/src/orchestrator/mcp-stdio-activity-executor.mjs",
  "packages/engine/src/orchestrator/workflow-graph-walker.mjs",
  "packages/engine/src/orchestrator/workflow-node-execution.mjs",
  "docs/security/engine-direct-manifest-policy.md",
];

function parseArgs() {
  const args = process.argv.slice(2);
  let baseRef = process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : "origin/master";
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--base-ref" && args[i + 1]) {
      baseRef = args[i + 1];
      i += 1;
    }
  }
  return { baseRef };
}

/**
 * @param {string} baseRef
 * @returns {string[]}
 */
function changedFiles(baseRef) {
  try {
    const out = execFileSync("git", ["diff", "--name-only", `${baseRef}...HEAD`], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    try {
      const out = execFileSync("git", ["diff", "--name-only", "HEAD~1..HEAD"], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      return out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }
}

/**
 * @param {string} file
 */
function isSensitive(file) {
  const normalized = file.replace(/\\/g, "/");
  return SENSITIVE_PREFIXES.some(
    (prefix) => normalized === prefix.replace(/\/$/, "") || normalized.startsWith(prefix)
  );
}

const { baseRef } = parseArgs();
const changed = changedFiles(baseRef);
const touchedSensitive = changed.filter(isSensitive);
const touchedChecklist = changed.some((f) => f.replace(/\\/g, "/") === CHECKLIST);

if (touchedSensitive.length === 0) {
  console.log("Threat-model touch gate: no sensitive paths changed.");
  process.exit(0);
}

if (touchedChecklist) {
  console.log(
    `Threat-model touch gate: OK (${touchedSensitive.length} sensitive path(s), checklist updated).`
  );
  process.exit(0);
}

console.error("Threat-model regression gate failed.");
console.error(`Sensitive paths changed (${touchedSensitive.length}) without updating ${CHECKLIST}:`);
for (const f of touchedSensitive) {
  console.error(`  - ${f}`);
}
console.error("");
console.error("Review the checklist and mark applicable rows (or N/A with rationale) in the same PR.");
process.exit(1);
