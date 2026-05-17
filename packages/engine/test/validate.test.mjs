import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { compileWorkflowValidator, validateWorkflowDefinition } from "../src/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

describe("validateWorkflowDefinition", () => {
  it("accepts lighthouse customer-routing fixture", () => {
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

  it("compileWorkflowValidator returns reusable validator with stable outcomes", () => {
    const validate = compileWorkflowValidator();
    const file = path.join(repoRoot, "examples", "lighthouse-customer-routing.workflow.json");
    const valid = JSON.parse(readFileSync(file, "utf8"));

    const ok = validate(valid);
    const bad = validate({ document: { name: "bad" }, nodes: [], edges: [] });

    assert.equal(ok.ok, true);
    assert.equal(bad.ok, false);
    assert.ok(Array.isArray(bad.errors));
  });
});
