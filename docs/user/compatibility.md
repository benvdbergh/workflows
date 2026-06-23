# Compatibility matrix

What the reference engine (`@agent-workflow/engine`) supports today versus what the schema accepts or defers to hosts.

**Tier legend:**

- **Core** — required for profile conformance; supported in reference engine
- **Optional** — allowed in documents; engine may or may not implement
- **Refused** — schema may accept shape but engine rejects at validate or runtime

## Feature matrix

| Feature | Tier | Engine `0.1.5` | Notes |
|---------|------|----------------|-------|
| `document`, `state_schema`, `nodes`, `edges` | Core | Supported | No top-level `extensions` |
| `start`, `end`, `step`, `llm_call`, `tool_call`, `switch`, `interrupt` | Core | Supported | Graph walker + linear runner |
| `parallel`, `wait` (duration/until), `set_state` | Core | Supported | `wait.until` uses engine clock |
| `agent_delegate`, `subworkflow` | Core | Supported | Mock A2A; child refs via `registerWorkflowRef` |
| `switch` via `config.cases` / `default` | Core | Supported | Prefer over static edges from switch |
| Reducers: `overwrite`, `append`, `merge` | Core | Supported | `custom` rejected |
| jq on switch, set_state, mappings | Core | Supported | [Subset documented](state-jq-reducers.md) |
| Checkpointing + `definitionHash` | Core | Supported | Resume/submit verify definition |
| `interrupt` in `parallel` branch | Refused | Validate + runtime refuse | `INTERRUPT_IN_PARALLEL_BRANCH` |
| `wait` `kind: signal` | Optional (host) | Runtime error without host | Needs `workflow_signal` host |
| Per-node `retry` / `timeout` | Optional | **Applied** | Walker honors `retry.max_attempts`, backoff, and per-node `timeout` |
| `tool_call` delegation bridge | Optional (legacy) | Supported | Prefer `agent_delegate` |
| Definition signing | Optional | Not implemented | R4 security story |
| REST / SDK parity | Optional | Partial | MCP stdio is reference surface |

## Author guidance

1. **Validates ≠ runs** — `wait.signal` may pass schema but fail at runtime without a signal host. `retry` and `timeout` are applied for activity nodes.
2. **Register subworkflow refs** — packaged npm installs do not auto-discover child URNs from disk.
3. **Delegate protocols** — production A2A, MCP, and SDK delegate executors ship in the package; wire via application port or MCP operator profile. Mock A2A remains the zero-config default.

Full developer reference: [profile model](https://github.com/benvdbergh/workflows/blob/main/docs/profile-model.md).
