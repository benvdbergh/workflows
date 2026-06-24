# Lighthouse host-mediated E2E

This runbook documents the scripted end-to-end path for the lighthouse golden fixture using **host-mediated** activity completion (not stub-only `in_process` execution).

## Scope and non-goals

- **Scope:** Prove the real `ActivityRequested` → host `submitActivityOutcome` → `ActivityCompleted` continuation path for lighthouse `classify` (`llm_call`) and `search_kb` (`tool_call`) on the **technical** routing branch.
- **Non-goals:** MCP stdio host wiring (see [mcp-stdio-host-smoke.md](./mcp-stdio-host-smoke.md)), engine-direct MCP `tools/call`, production auth, or billing/interrupt paths (covered by conformance parity vectors).

## Prerequisites

- Node.js `>=22.5.0`
- Repository clone with dependencies installed:

```bash
npm install
```

## Run the E2E script

From repository root:

```bash
npm run e2e:lighthouse
```

Or directly:

```bash
node scripts/e2e-lighthouse-host-mediated.mjs
```

## What the script does

1. Loads and validates `examples/lighthouse-customer-routing.workflow.json` via `validateWorkflowDefinition`.
2. Starts execution with `activityExecutionMode: "host_mediated"` and input `{ "ticket_text": "My API returns 500 on /payments endpoint." }`.
3. Asserts the walker yields `awaiting_activity` at node `classify` (no in-process stub completion).
4. Submits host outcomes:
   - `classify` → `{ intent: "technical", confidence: 0.9 }` (passes `output_schema` validation).
   - `search_kb` → `{ snippets: [{ id: "kb-42", title: "Payments API 500" }] }`.
5. Asserts `status: "completed"` with result `{ intent: "technical", confidence: 0.9 }`.
6. Asserts routing: `NodeScheduled` includes `search_kb` and excludes `human_review` and `open_ticket`.
7. Asserts append-only history contains `ActivityCompleted` for both activities (not replay-only stubs) and ends with `ExecutionCompleted`.

Exit code `0` on success; non-zero on any assertion failure.

## Expected output (success)

```
Lighthouse host-mediated E2E: PASS
- execution_id: e2e-lighthouse-host-mediated-tech
- result: {"intent":"technical","confidence":0.9}
- routed nodes: search_kb (technical path)
```

## How this proves the real activity path

| Check | Why it matters |
|-------|----------------|
| `activityExecutionMode: "host_mediated"` on start | Walker emits `ActivityRequested` and returns without calling `StubActivityExecutor` for pending nodes. |
| Two `submitActivityOutcome` calls | Host supplies activity results at the boundary; engine appends `ActivityCompleted` and continues the graph. |
| `output_schema` on `classify` submit | Validates host-mediated `llm_call` completion semantics (see `packages/engine/test/workflow-graph-walker.test.mjs`). |
| Technical branch scheduling | Confirms `switch` routing after host classify, not a single-shot stub run. |
| History assertions | Ensures completions are persisted events, not replay markers from stub-only paths. |

Related conformance coverage: `parity.r2.host_mediated_lighthouse_classify` (billing path via `open_ticket`). This E2E complements that vector with the **technical** path via `search_kb`.

## CI

`npm run e2e:lighthouse` runs in the reusable validation workflow (`.github/workflows/reusable-validate-and-test.yml`) after conformance on pull requests and pushes to `master`.
