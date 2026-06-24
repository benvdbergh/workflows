# R3 multi-agent delegation E2E

This runbook documents the scripted end-to-end path for the `r3-multi-agent-coding` golden fixture using **real A2A delegation** via `A2ADelegateExecutor` (not `MockA2ADelegateExecutor` or stub-only in-process paths).

## Scope and non-goals

- **Scope:** Prove `agent_delegate` with `protocol: "a2a"` submits to an HTTP A2A endpoint, polls until terminal, and persists `externalTaskId` / `delegateCorrelationId` on `ActivityCompleted`; then continues through the `verify` subworkflow to the `review` interrupt.
- **Non-goals:** Production A2A agent hosts, MCP/SDK delegate paths, or human resume after `review` (covered by unit tests and conformance vectors).

## Prerequisites

- Node.js `>=22.5.0`
- Repository clone with dependencies installed:

```bash
npm install
```

## Run the E2E script

From repository root:

```bash
npm run e2e:r3
```

Or directly:

```bash
node scripts/e2e-r3-multi-agent-delegation.mjs
```

## What the script does

1. Loads and validates `examples/r3-multi-agent-coding.workflow.json` via `validateWorkflowDefinition`.
2. Registers child workflow `urn:awp:wf:unit-tests` from `examples/r3-unit-tests-child.workflow.json`.
3. Starts an in-process mock A2A HTTP server (`packages/engine/test/helpers/a2a-mock-http-server.mjs`) on `127.0.0.1`.
4. Runs the parent workflow with `A2ADelegateExecutor` pointed at the mock server and `stubActivityOutputs.run_tests` for the child `tool_call` (subworkflow verify path only).
5. Asserts:
   - `implement` `ActivityCompleted` includes `externalTaskId: "a2a-task-1"` and expected `delegateCorrelationId`.
   - Mock server received exactly one delegated task.
   - Workflow reaches `status: "interrupted"` at node `review` with `patch` and `tests_passed: true` in state.
   - `InterruptRaised` for `review` is present in history.

Exit code `0` on success; non-zero on any assertion failure.

## Expected output (success)

```
R3 multi-agent delegation E2E: PASS
- execution_id: e2e-r3-multi-agent-delegation
- status: interrupted at node review
- external_task_id: a2a-task-1
- patch: // A2A patch for: fix bug...
```

## How this proves the real delegation path

| Check | Why it matters |
|-------|----------------|
| `A2ADelegateExecutor` (not mock executor) | Exercises HTTP submit + poll transport and credential resolution. |
| In-process A2A mock server | Deterministic external task lifecycle without a live agent host. |
| `externalTaskId` on `ActivityCompleted` | Confirms GA correlation fields for native `agent_delegate`. |
| Subworkflow + interrupt continuation | Shows delegate completion feeds verify/review graph, not an isolated delegate unit test. |

Related coverage: `packages/engine/test/a2a-delegate-executor.test.mjs` ("runs r3-multi-agent-coding implement step via A2A against mock server"). This E2E script mirrors that test as a standalone CI gate.

## CI

`npm run e2e:r3` runs in the reusable validation workflow (`.github/workflows/reusable-validate-and-test.yml`) after `e2e:lighthouse` on pull requests and pushes to `master`.
