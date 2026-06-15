/**
 * Fails when the workflow definition schema changes in ways that break existing documents
 * without an explicit acknowledgment (document.schema / $id bump policy).
 *
 * Usage:
 *   node scripts/check-schema-breaking-change.mjs
 *   node scripts/check-schema-breaking-change.mjs --base-ref origin/master
 *   SCHEMA_BREAKING_CHANGE_ACK=1 node scripts/check-schema-breaking-change.mjs
 *
 * CI (pull_request): compares HEAD schema to merge-base schema from --base-ref.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const schemaPath = "schemas/workflow-definition.json";
const ackEnv = process.env.SCHEMA_BREAKING_CHANGE_ACK === "1";
const ackFile = join(repoRoot, "schemas", ".schema-breaking-change-ack");

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
 * @param {unknown} node
 * @param {string} pathPrefix
 * @param {Set<string>} out
 */
function collectRequiredPaths(node, pathPrefix, out) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return;
  }
  const obj = /** @type {Record<string, unknown>} */ (node);
  if (Array.isArray(obj.required)) {
    for (const key of obj.required) {
      if (typeof key === "string") {
        out.add(pathPrefix ? `${pathPrefix}.${key}` : key);
      }
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (key === "required" || key === "$defs") {
      continue;
    }
    if (value && typeof value === "object") {
      collectRequiredPaths(value, pathPrefix ? `${pathPrefix}.${key}` : key, out);
    }
  }
  if (obj.$defs && typeof obj.$defs === "object" && !Array.isArray(obj.$defs)) {
    for (const [defName, defValue] of Object.entries(
      /** @type {Record<string, unknown>} */ (obj.$defs)
    )) {
      collectRequiredPaths(defValue, `$defs.${defName}`, out);
    }
  }
}

/**
 * @param {string} ref
 * @returns {object | null}
 */
function readSchemaAtGitRef(ref) {
  try {
    const raw = execFileSync("git", ["show", `${ref}:${schemaPath}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readHeadSchema() {
  const full = join(repoRoot, schemaPath);
  if (!existsSync(full)) {
    console.error(`Missing schema: ${full}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(full, "utf8"));
}

function hasAcknowledgment() {
  return ackEnv || existsSync(ackFile);
}

const { baseRef } = parseArgs();
const headSchema = readHeadSchema();
const baseSchema = readSchemaAtGitRef(baseRef);

if (!baseSchema) {
  console.log(
    `Schema breaking-change check skipped: could not load base schema at ${baseRef}:${schemaPath} (first introduction or shallow clone).`
  );
  process.exit(0);
}

/** @type {string[]} */
const violations = [];

const baseId = typeof baseSchema.$id === "string" ? baseSchema.$id : "";
const headId = typeof headSchema.$id === "string" ? headSchema.$id : "";
if (baseId !== headId) {
  violations.push(`$id changed: "${baseId}" → "${headId}"`);
}

const baseRequired = new Set();
const headRequired = new Set();
collectRequiredPaths(baseSchema, "", baseRequired);
collectRequiredPaths(headSchema, "", headRequired);

for (const path of headRequired) {
  if (!baseRequired.has(path)) {
    violations.push(`new required field: ${path}`);
  }
}

if (violations.length === 0) {
  console.log("workflow schema breaking-change check: no breaking deltas detected.");
  process.exit(0);
}

if (hasAcknowledgment()) {
  console.warn("workflow schema breaking-change acknowledged; violations:");
  for (const v of violations) {
    console.warn(`  - ${v}`);
  }
  process.exit(0);
}

console.error("workflow schema breaking-change gate failed:");
for (const v of violations) {
  console.error(`  - ${v}`);
}
console.error("");
console.error("Breaking changes require an explicit bump policy:");
console.error("  - Set document.schema / profile version in workflow instances, and");
console.error("  - Acknowledge with SCHEMA_BREAKING_CHANGE_ACK=1 in CI, or");
console.error(`  - Add ${schemaPath.replace("workflow-definition.json", ".schema-breaking-change-ack")} with rationale.`);
process.exit(1);
