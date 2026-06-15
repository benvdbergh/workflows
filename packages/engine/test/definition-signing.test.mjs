import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractDefinitionSignature,
  verifyDefinitionSignature,
} from "../src/definition-signing.mjs";

describe("definition signing stub", () => {
  it("unsigned definitions pass verification", () => {
    const r = verifyDefinitionSignature({
      document: { schema: "https://agent-workflow.dev/schemas/workflow-definition.json", name: "x", version: "1" },
      nodes: [],
      edges: [],
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.verified, false);
      assert.equal(r.signaturePresent, false);
    }
  });

  it("signed definitions pass stub verify hook", () => {
    const definition = {
      document: {
        schema: "https://agent-workflow.dev/schemas/workflow-definition.json",
        name: "signed",
        version: "1",
        signature: { alg: "none", value: "stub" },
      },
      nodes: [],
      edges: [],
    };
    assert.ok(extractDefinitionSignature(definition));
    const r = verifyDefinitionSignature(definition);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.signaturePresent, true);
      assert.equal(r.verified, false);
    }
  });
});
