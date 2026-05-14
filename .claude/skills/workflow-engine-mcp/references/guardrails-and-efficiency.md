# Guardrails and efficiency

These are **operational practices** for the engine MCP and workflow graphs. They complement—not replace—the JSON Schema and engine behavior.

## When structured workflows earn their keep

Prefer explicit graphs when:

- Outcomes must be **auditable** and **reproducible** (clear node history vs opaque reasoning chains).
- **Cost predictability** matters — bounded steps and fewer “infinite rethink” loops.
- **Validation** before execution is part of your delivery bar.

Avoid **over-orchestrating** one-off, highly exploratory tasks where a single agent with a fresh context is simpler.

## Token and context discipline

- **Keep MCP / chat payloads small:** stash large tool outputs under distinct state keys, then use **`set_state` + jq** to build a compact digest; use **`end.output_mapping`** for a minimal **`result`**. Shrink or clear transient keys **before** `end` if **`final_state`** must be small too.
- **Avoid last-writer-wins on tool output:** many MCP tools return a single `text` field — sequential `tool_call` nodes that all write the same reducer/key leave only the **last** payload. Mitigate with **per-call distinct keys** or **`parallel` branches** each ending in a branch-local `set_state` before join.
- **Stage-local context:** treat each node as a stage that only needs **its** inputs — avoid pushing entire histories into prompts when jq can select fields.

## `parallel` expectations

Reference engine **`join: all`** runs branches **sequentially in branch list order** on **shared state** — deterministic, not necessarily concurrent. Record that in `document.description` if operators might assume true parallelism.

## jq robustness

- Sample real tool JSON **before** hard-coding paths (arrays vs `{ items: [] }`, alternate id fields).
- Defensive filters (e.g. accept `items`, `issues`, `results`, nested `data.*`, id fields `id` / `issueId` / `uuid`) reduce “empty preview despite huge payload” surprises.

## Secrets and manifests

- **Never** commit API keys, tokens, or production endpoints into **shared** workflow repos or **checked-in** operator manifests.
- Use **local private** manifest files and environment only on the operator machine, or a secret store your organization approves.
- When you change the workflow definition or schema version, bump **`document.schema` / `document.version`** consistently with your team’s release practice.

## Host UI limitations

Some hosts surface only **`content` text**. The adapter may mirror structured results into text for discoverability — still prefer parsing **`structuredContent`** when available for stable `error.code` handling.

## Testing pyramid

1. **Schema + CLI validate** — fast fail on graph/jq typos.  
2. **Stub or offline runs** — exercise graph logic without live MCP where the engine allows it.  
3. **Engine-direct integration** — operator manifest + real child server.
