# Workflow authoring

## Required document shape

Every workflow document validated by the bundled schema **must** include:

- `document` — at least `schema`, `name`, `version`; optional `description` (use it to record **non-obvious runtime semantics**, e.g. that reference `parallel` branches may run in branch list order on shared state).
- `state_schema` — JSON Schema for workflow state; drives validation after merges. Keep it **permissive enough** for intermediate keys (`*_raw`, digests) you assign via `set_state`.
- `nodes` — non-empty; each node has `id`, `type`, optional `config`, `retry`, `timeout`, `metadata`.
- `edges` — directed pairs `source` → `target`; synthetic `__start__` allowed for entry.

The root workflow object uses **`additionalProperties: false`**. **Do not** add top-level fields such as `extensions` — validation rejects them.

Optional **`checkpointing`** is allowed; see the schema `checkpointing` property description.

## Schema identity and versioning

Set `document.schema` to the URI or label your organization uses for this workflow definition format; bump `document.version` when you change the definition in ways that affect execution or validation.

## Validation

**Engine CLI** (uses the same rules as the published package):

```bash
npx -y -p @agent-workflow/engine@alpha workflows-engine validate path/to/workflow.json
```

Validate an operator MCP manifest (stdio `mcpServers`):

```bash
npx -y -p @agent-workflow/engine@alpha workflows-engine mcp-manifest validate path/to/mcp.json
```

**Standalone AJV** (no engine install), from the directory that contains this skill’s `assets/` folder:

```bash
npx --yes ajv-cli@5 validate -s assets/workflow-definition-schema.json -d path/to/workflow.json --spec=draft2020
```

Adjust `-s` to the absolute path of `assets/workflow-definition-schema.json` if your working directory differs.

## State and reducers

`state_schema` properties may declare reducers: `overwrite` (default), `append`, `merge`. **`custom` is not supported** — documents using it should be rejected by tooling.

After node outputs and `set_state` merges, engines **should** validate state when validation is enabled.

## jq usage

- `switch` cases: `when` is a **jq expression string**.
- `end` node: `output_mapping` values are jq strings evaluated against **current state** to build the workflow **`result`**.
- `set_state` `config.assignments`: each value is `{ "jq": "..." }` or `{ "literal": ... }`. Assignments for one `set_state` step see the **same** pre-step state; results merge according to reducers.

The exact **jq binding** (root object shape passed to expressions) is defined by the engine; infer from engine docs for your package version or from small experimental workflows.

## Graph hygiene

- One `start` entry; terminal `end` nodes.
- For `switch`, prefer **`config.cases` / `default`** over ambiguous duplicate static edges unless your engine documents precedence.
- For `parallel`, exactly **one** edge leaves the parallel node to the **join target**; each branch is a linear chain from `branch.entry` to that target.

## Bundled JSON Schema

Machine-readable contract: **`../assets/workflow-definition-schema.json`**. Replace this file when upgrading `@agent-workflow/engine` so definitions stay aligned with the runner you use.
