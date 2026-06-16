import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPendingActivityCompletionContinuation,
  verifyHostContinuationInput,
} from "../src/orchestrator/workflow-graph-walker-support.mjs";

describe("host-mediated continuation support", () => {
  it("detects pending completion when ActivityCompleted lacks CompleteNode", () => {
    const rows = [
      { seq: 1, kind: "event", name: "ExecutionStarted", payload: { inputKeys: [] } },
      {
        seq: 2,
        kind: "event",
        name: "ActivityCompleted",
        payload: { nodeId: "work", nodeType: "tool_call", result: {} },
      },
    ];
    assert.equal(isPendingActivityCompletionContinuation(rows), true);
  });

  it("detects pending completion when ActivityCompleted lacks CompleteNode for agent_delegate", () => {
    const rows = [
      { seq: 1, kind: "event", name: "ExecutionStarted", payload: { inputKeys: [] } },
      {
        seq: 2,
        kind: "event",
        name: "ActivityCompleted",
        payload: { nodeId: "implement", nodeType: "agent_delegate", result: { patch: "x" } },
      },
    ];
    assert.equal(isPendingActivityCompletionContinuation(rows), true);
  });

  it("returns false when CompleteNode already follows ActivityCompleted", () => {
    const rows = [
      { seq: 1, kind: "event", name: "ActivityCompleted", payload: { nodeId: "work" } },
      { seq: 2, kind: "command", name: "CompleteNode", payload: { nodeId: "work" } },
    ];
    assert.equal(isPendingActivityCompletionContinuation(rows), false);
  });

  it("verifyHostContinuationInput rejects mismatched input keys", () => {
    const rows = [
      { seq: 1, kind: "event", name: "ExecutionStarted", payload: { inputKeys: ["a"] } },
      { seq: 2, kind: "event", name: "StateUpdated", payload: { nodeId: "start", state: { a: 1 } } },
    ];
    const check = verifyHostContinuationInput(rows, { b: 2 });
    assert.equal(check.ok, false);
  });
});
