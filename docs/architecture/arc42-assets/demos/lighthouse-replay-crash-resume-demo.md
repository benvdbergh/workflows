# Lighthouse replay crash-resume demo

This runbook demonstrates durable replay value for the lighthouse workflow with a deterministic crash-and-restart flow.

## Purpose

- Show that a mid-run crash does not lose completed work.
- Prove that restart converges to the same final result as uninterrupted execution.
- Provide objective, machine-checkable evidence that replay skips already-completed activity work.

## Prerequisites

- Node.js `>=22.5.0`
- Dependencies installed at repository root:

```bash
npm install
```

## 1) Validate the lighthouse definition

```bash
npm run engine:validate -- examples/lighthouse-customer-routing.workflow.json
```

Expected: exit code `0` and no schema errors.

## 2) Run the replay crash-resume script

```bash
node scripts/demo-lighthouse-replay-crash-resume.mjs
```

Expected output includes:

- `Lighthouse replay demo: PASS`
- `baseline result` and `recovered result` with equal values
- `restart live activity calls: 1` (only `search_kb` executes after restart)
- Tail summary ending in `event:ExecutionCompleted`

## 3) Evidence interpretation

The script validates these invariants:

- Baseline uninterrupted run completes.
- Crash is injected after deterministic history persistence.
- Restarted run reuses persisted `classify` completion (marked `replayed: true`).
- Restarted run only performs one live activity execution (`search_kb`).
- Restarted run reaches the same terminal result as baseline.

## Failure modes and operator recovery

### Stale or unknown execution id

Symptom:

- Status queries or resumes fail with `EXECUTION_NOT_FOUND`.

Recovery:

- Verify the execution id from the run output.
- Re-run with a fresh execution id if the previous store file was removed.
- For MCP-hosted demos, use `workflow_start` response `execution_id` as source of truth.

### Invalid interrupt resume payload

Symptom:

- Resume fails with `INVALID_RESUME_PAYLOAD` (MCP) or `resume_validation_failed` in engine history.

Recovery:

- Re-submit payload that matches interrupt `resume_schema`.
- For lighthouse `human_review`, include at least `{ "intent": "<value>" }`.

## Related references

- `examples/lighthouse-customer-routing.workflow.json`
- `examples/lighthouse-customer-routing.trace.happy.json`
- `examples/lighthouse-customer-routing.trace.failure-and-retry.json`
- `packages/engine/README.md`
