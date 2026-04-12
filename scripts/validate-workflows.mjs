/**
 * Validates golden workflow JSON instances against schemas/workflow-definition-poc.json (JSON Schema Draft 2020-12).
 * Run: npm run validate-workflows
 */
import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const schemaPath = path.join(root, "schemas", "workflow-definition-poc.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

const examplesDir = path.join(root, "examples");
/** Golden workflow definitions: every `*.workflow.json` directly under `examples/` (STORY-1-3). */
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

const invalidFixture = path.join(
  root,
  "examples",
  "fixtures.invalid",
  "extensions.workflow.json"
);

function checkValid(filePath) {
  const data = JSON.parse(readFileSync(filePath, "utf8"));
  const ok = validate(data);
  if (!ok) {
    console.error(`FAIL (expected valid): ${path.relative(root, filePath)}`);
    console.error(validate.errors);
    process.exit(1);
  }
  console.log(`ok: ${path.relative(root, filePath)}`);
}

function checkInvalid(filePath) {
  const data = JSON.parse(readFileSync(filePath, "utf8"));
  const ok = validate(data);
  if (ok) {
    console.error(
      `FAIL (expected invalid): ${path.relative(root, filePath)} — schema incorrectly accepted document`
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
checkInvalid(invalidFixture);

console.log("All workflow schema checks passed.");
