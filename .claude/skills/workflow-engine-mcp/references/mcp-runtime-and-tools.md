# MCP runtime, tools, and operator manifest

## Starting the adapter

**Published package (typical):**

```bash
npx -y -p @agent-workflow/engine@alpha workflows-engine-mcp
```

Pin a specific version for reproducibility:

```bash
npx -y -p @agent-workflow/engine@0.1.0-alpha.3 workflows-engine-mcp
```

**From a local engine source tree:** run the package’s MCP stdio entrypoint with `node` (exact path depends on your clone layout).

**Node.js:** `>=22.5.0` is required for current reference engines using `node:sqlite`. Treat **stderr** as logs, not protocol.

## Engine-direct operator manifest

To execute real **`tool_call`** nodes against stdio MCP servers:

- Set **`WORKFLOW_ENGINE_MCP_CONFIG`** to a JSON file path, **or**
- Pass **`--mcp-config <path>`** after the bin (CLI overrides env when both set).

The file uses **`mcpServers`** (Cursor-style): each entry has `command`, optional `args` / `env`. Validate with:

```bash
npx -y -p @agent-workflow/engine@alpha workflows-engine mcp-manifest validate path/to/mcp.json
```

If the manifest is missing or invalid, the process **exits before serving MCP** (errors on stderr).

**Security / trust boundary:** Environment variables for **child** MCP processes come **only** from the manifest entries (`env` on each server) — the host shell environment is **not** automatically merged into child servers. **Never** commit secrets into shared manifests; use private env injection or local untracked config files.

## Tool: `workflow_start`

- **Required:** `definition`, `input`
- **Optional:** `execution_id` (server generates UUID if omitted), `activity_execution_mode`

**Returns (success):** `execution_id`, `status`, optional `result`, `final_state`, `node_id`, `state`, `parallel_span`, … — prefer **`structuredContent`**; many hosts also mirror JSON into **`content[0].text`**.

**Terminal vs suspended:**

- Normal completion: `status` terminal with `result` from `end.output_mapping` when configured.
- **`host_mediated`:** may return **`awaiting_activity`** with pending **`node_id`** (and **`parallel_span`** under parallel) — host must call `workflow_submit_activity`.

## Tool: `workflow_status`

- **Required:** `execution_id`
- **Returns:** `phase`, `current_node_id`, `last_error`, … — **phase-oriented projection** from history.

**Important:** Do not assume `workflow_status` replays full terminal **`result`** / **`final_state`**; for terminal payloads, use the **`workflow_start`** completion object (unless your engine version documents richer status).

## Tool: `workflow_resume`

- **Required:** `execution_id`, `definition`, `resume_payload`
- **Optional:** `activity_execution_mode`

Payload must satisfy the interrupt node’s **`resume_schema`**. Stale or invalid resumes → **`INVALID_RESUME_PAYLOAD`**.

## Tool: `workflow_submit_activity`

- **Required:** `execution_id`, `definition`, `input`, `node_id`, `outcome`
- **Optional:** `parallel_span`, `activity_execution_mode`

**Replay rule:** `definition` and **`input` must match** the original `workflow_start` (store replay semantics).

**Parallel:** When the pending activity is under a parallel branch, include **`parallel_span`** exactly as returned by the engine on the pending activity.

## Activity execution modes

| Mode | Behavior |
|------|-----------|
| `in_process` (default) | After `ActivityRequested`, the engine runs the configured executor immediately (stub or engine-direct MCP) and continues in the same run. |
| `host_mediated` | Stops after `ActivityRequested`; host performs work, then **`workflow_submit_activity`** supplies the outcome. Use when the trust boundary requires the **host** to own side effects or LLM calls. |

## In-memory vs persisted store

Default MCP stdio setups often use **in-memory** history — treat `execution_id` as **ephemeral** unless the host configures persistent storage in the engine.
