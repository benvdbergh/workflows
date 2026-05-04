# Node types and orchestration

Supported `type` values are fixed by the schema **`oneOf` union** — **unknown types are rejected**. Types not in the schema (e.g. reserved for future protocol versions such as `agent_delegate`, `subworkflow`) must not be used until your engine version explicitly supports them.

## Core nodes

| Type | Use when | Notes |
|------|-----------|--------|
| `start` | Single entry | At most one per document. |
| `end` | Terminal completion | Optional `output_schema` / **`output_mapping`** (jq) to shape **`result`**. |
| `step` | Deterministic handler boundary | `config` must carry an implementation reference (`handler` or `code_ref` per RFC-03); registry is engine-specific. |
| `llm_call` | Model invocation | May be stubbed in tests; prompts and model config live in `config`. |
| `tool_call` | External MCP tool | **MCP-shaped:** `config.server` (operator-manifest key), `config.tool`, `config.arguments` (**static JSON** — no state interpolation in the reference engine). |
| `switch` | Branch on state | `config.cases`: `{ when: "<jq>", target: "<node id>" }`, optional `config.default`. |
| `interrupt` | Human-in-the-loop | `resume_schema` required; `prompt` or equivalent per RFC-03. **Avoid `interrupt` inside `parallel` branches** when you need safe resume: correlation for that combination is not modeled in the conservative profile—keep interrupts on the main path until your engine documents otherwise. |

## Orchestration nodes

### `parallel`

- **Intent:** Fork/join in the **protocol** sense: separate branch paths before a **single join target**, distinct stash keys per branch, join policies (`all` | `any` | `n_of_m` with `n`).
- **Reference engine behavior:** `join: all` walks branches in **list order** on **one shared state** — deterministic, **not** guaranteed OS-level parallelism. Still useful to avoid last-writer-wins on a single tool output key (e.g. each branch writes `issues_raw`, `projects_raw`, then the join step builds `digest`).
- **Graph rule:** One static edge from the `parallel` node to the join target; each branch reaches that target via its own chain.

### `wait`

- `config.kind`: `duration` (`duration_ms` or parseable `duration` string), `until` (ISO timestamp), or `signal`.
- **`signal`:** requires host support; may fail at runtime in a bare engine if not implemented.

### `set_state`

- **Intent:** Deterministic state transforms without an external call — **jq** or literals to build digests, normalize IDs, clear large transient keys before `end`.
- **Pattern:** After `tool_call`, map or trim payloads into stable keys so **`final_state`** and **`result`** stay small for MCP responses and chat UIs.

## Delegation without native delegate nodes

Until `agent_delegate` exists in your engine version, you may **bridge** with `tool_call` to an agent API (e.g. execute/status tools), keeping lifecycle in execution history so definitions can migrate later with minimal edits.

## Checkpointing (optional)

Top-level `checkpointing` may tune checkpoint density (`after_each_node`, `every_n_nodes`, `disabled`). Checkpoints taken inside parallel branches may include **`parallelSpan`** metadata so readers can correlate state with branch context.
