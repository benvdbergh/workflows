# MCP adapter error codes

Structured failures use **`structuredContent.error`** (and mirrored text) with stable **`code`** strings. Use codes for branching retries vs fixing inputs.

| Code | Meaning | Typical agent action |
|------|---------|----------------------|
| `VALIDATION_ERROR` | MCP arguments failed contract validation | Fix DTO shape; re-read tool schema. |
| `EXECUTION_NOT_FOUND` | Unknown `execution_id` for status / resume / submit | Re-start or verify store and id. |
| `INVALID_RESUME_PAYLOAD` | Resume JSON invalid vs `resume_schema` or stale interrupt | Re-collect human input; ensure interrupt still active. |
| `ACTIVITY_SUBMIT_NOT_AWAITING` | Submit when no pending `ActivityRequested` | Call `workflow_status`; align with last `workflow_start` / submit. |
| `ACTIVITY_SUBMIT_NODE_MISMATCH` | `node_id` ≠ pending activity | Pass exact `node_id` from awaiting response. |
| `ACTIVITY_SUBMIT_PARALLEL_MISMATCH` | Missing/wrong `parallel_span` for branched activity | Copy `parallel_span` from engine awaiting payload. |
| `SUBMIT_VALIDATION_ERROR` | Submit failed validation before append | Fix replay inputs (`definition` / `input` / outcome shape). |
| `ENGINE_FAILURE` | Workflow failed inside engine (non-adapter contract) | Inspect `last_error` / history; fix definition or tool behavior. |
| `INTERNAL_ERROR` | Unexpected adapter failure | Report upstream; retry only if transient. |

These codes are defined by the `@agent-workflow/engine` MCP adapter layer; newer engine versions may add codes—check release notes if you see an unfamiliar value.
