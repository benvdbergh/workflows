import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { validateWorkflowDefinition } from "../src/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

describe("validateWorkflowDefinition", () => {
  it("accepts lighthouse POC fixture", () => {
    const file = path.join(repoRoot, "examples", "lighthouse-customer-routing.workflow.json");
    const data = JSON.parse(readFileSync(file, "utf8"));
    const result = validateWorkflowDefinition(data);
    assert.equal(result.ok, true);
  });

  it("rejects extensions top-level (invalid fixture)", () => {
    const file = path.join(repoRoot, "examples", "fixtures.invalid", "extensions.workflow.json");
    const data = JSON.parse(readFileSync(file, "utf8"));
    const result = validateWorkflowDefinition(data);
    assert.equal(result.ok, false);
    assert.ok(result.errors && result.errors.length > 0);
  });
});
