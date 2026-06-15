# Getting started

This guide walks through validating a workflow and running the **lighthouse** demo with the reference engine.

**Prerequisites:** Node.js 22.5+ (CI uses 24). For MCP execution, an MCP-capable host (Cursor, Claude Desktop, etc.).

## 1. Install the engine (operators)

No repository clone required:

```bash
npx -y -p @agent-workflow/engine@0.1.4 workflows-engine --help
```

Pin `@alpha` for the moving pre-release channel, or an exact version for reproducible demos.

## 2. Clone and validate (authors)

```bash
git clone https://github.com/benvdbergh/workflows.git
cd workflows
npm ci
npm run validate-workflows
```

This validates every `examples/*.workflow.json`, the minimal schema example, and confirms every file under `examples/fixtures.invalid/` is rejected (schema and profile invariants via the engine validator). For the full conformance matrix, run `npm run conformance`.

Validate a single file:

```bash
npm run engine:validate -- examples/lighthouse-customer-routing.workflow.json
```

## 3. Understand a minimal workflow

See `examples/fixtures.valid/minimal-linear.workflow.json` for the smallest runnable graph: `start` → `step` → `end`.

Every workflow document includes:

```json
{
  "document": {
    "schema": "https://agent-workflow.dev/schemas/workflow-definition.json",
    "name": "my-workflow",
    "version": "1.0.0"
  },
  "state_schema": { "type": "object", "properties": {} },
  "nodes": [],
  "edges": []
}
```

Author in YAML if you prefer, but **normalize to JSON** before validation and execution.

## 4. Run the lighthouse fixture via MCP

1. Configure your MCP host — see [Run with MCP](mcp-operator-guide.md).
2. Start the engine stdio server (or let `npx` spawn it).
3. Call `workflow_start` with the lighthouse definition and input `{ "ticket_text": "..." }`.
4. Poll `workflow_status` until the run completes or interrupts.
5. If interrupted at `human_review`, call `workflow_resume` with `{ "intent": "billing" }` or `{ "intent": "technical" }`.

Expected routing:

- `intent == "billing"` with `confidence > 0.8` → `open_ticket`
- `intent == "technical"` → `search_kb`
- No match → `human_review` (interrupt)

Full fixture details: [Examples](examples.md#lighthouse-customer-routing).

## 5. Next steps

| Goal | Read |
|------|------|
| Wire MCP in your host | [Run with MCP](mcp-operator-guide.md) |
| Author workflows | [Authoring overview](authoring-workflows.md) |
| Check engine support | [Compatibility matrix](compatibility.md) |
| Download JSON Schema | [Schema](schema/index.md) |
| Protocol narrative | [Whitepaper](whitepaper.md) |
