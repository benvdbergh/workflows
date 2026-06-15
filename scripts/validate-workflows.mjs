/**
 * Validates golden workflow JSON instances via @agent-workflow/engine (schema + profile invariants).
 * Run: npm run validate-workflows
 *
 * Profile invariants (e.g. interrupt-in-parallel) are enforced here — not by AJV alone.
 * Runtime-only limits (e.g. reducer: "custom") are documented in docs/user/compatibility.md.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateWorkflowDefinition } from "@agent-workflow/engine";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const examplesDir = path.join(root, "examples");
/** Golden workflow definitions: every `*.workflow.json` directly under `examples/`. */
const goldenWorkflows = readdirSync(examplesDir)
  .filter((name) => name.endsWith(".workflow.json"))
  .map((name) => path.join(examplesDir, name));
if (goldenWorkflows.length === 0) {
  console.error("No *.workflow.json files found in examples/");
  process.exit(1);
}

/** @type {string[]} Additional valid smoke instances (optional regression targets). */
const additionalValid = [
  path.join(root, "schemas", "examples", "minimal-valid.workflow.json"),
];

const invalidDir = path.join(root, "examples", "fixtures.invalid");
const invalidFixtures = readdirSync(invalidDir)
  .filter((name) => name.endsWith(".workflow.json"))
  .map((name) => path.join(invalidDir, name));

function checkValid(filePath) {
  const data = JSON.parse(readFileSync(filePath, "utf8"));
  const result = validateWorkflowDefinition(data);
  if (!result.ok) {
    console.error(`FAIL (expected valid): ${path.relative(root, filePath)}`);
    console.error(result.errors);
    process.exit(1);
  }
  console.log(`ok: ${path.relative(root, filePath)}`);
}

function checkInvalid(filePath) {
  const data = JSON.parse(readFileSync(filePath, "utf8"));
  const result = validateWorkflowDefinition(data);
  if (result.ok) {
    console.error(
      `FAIL (expected invalid): ${path.relative(root, filePath)} — validation incorrectly accepted document`,
    );
    process.exit(1);
  }
  console.log(`ok (rejected as expected): ${path.relative(root, filePath)}`);
}

for (const f of goldenWorkflows) {
  checkValid(f);
}
for (const f of additionalValid) {
  checkValid(f);
}
for (const f of invalidFixtures) {
  checkInvalid(f);
}

console.log("All workflow validation checks passed.");
