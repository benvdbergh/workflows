import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalJsonStringify, sortJsonKeysDeep } from "../src/canonical-json.mjs";
import { checkpointDefinitionMeta } from "../src/orchestrator/workflow-graph-walker-support.mjs";

describe("canonical JSON", () => {
  it("sorts object keys recursively for stable stringify", () => {
    const input = { z: 1, a: { y: 2, b: 3 }, m: [1, { c: 4, a: 5 }] };
    assert.equal(canonicalJsonStringify(input), '{"a":{"b":3,"y":2},"m":[1,{"a":5,"c":4}],"z":1}');
    assert.deepEqual(sortJsonKeysDeep(input), { a: { b: 3, y: 2 }, m: [1, { a: 5, c: 4 }], z: 1 });
  });

  it("checkpointDefinitionMeta is insensitive to property insertion order", () => {
    const base = {
      document: { schema: "s", name: "n", version: "1" },
      state_schema: { type: "object" },
      nodes: [{ id: "start", type: "start" }],
      edges: [{ source: "__start__", target: "start" }],
    };
    const reordered = {
      edges: base.edges,
      nodes: base.nodes,
      state_schema: base.state_schema,
      document: { version: "1", name: "n", schema: "s" },
    };
    assert.equal(
      checkpointDefinitionMeta(base).definitionHash,
      checkpointDefinitionMeta(reordered).definitionHash
    );
  });
});
