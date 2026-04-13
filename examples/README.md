# Example workflow fixtures

Golden definitions and **trace companions** for the POC contract ([docs/poc-scope.md](../docs/poc-scope.md), [schemas/](../schemas/)).

| File | Purpose |
|------|---------|
| [lighthouse-customer-routing.workflow.json](./lighthouse-customer-routing.workflow.json) | Canonical **JSON** workflow (lighthouse / customer-routing shape: `llm_call`, `switch`, `interrupt`, `tool_call`). |
| [agentic-task-intake-prompt-improver.workflow.json](./agentic-task-intake-prompt-improver.workflow.json) | Agentic intake + prompt improver flow using POC node types only, with mode routing that keeps workflow publication and open-agentic execution as separate routes. |
| [lighthouse-customer-routing.trace.happy.json](./lighthouse-customer-routing.trace.happy.json) | Expected **command** and **event** prefixes for a happy-path technical route ([RFC-04](../docs/RFC/rfc-04-execution-model.md) §4.4–4.5). |
| [lighthouse-customer-routing.trace.failure-and-retry.json](./lighthouse-customer-routing.trace.failure-and-retry.json) | **Retry** (failed `classify` activity) and **failure** (invalid interrupt resume) prefix narratives. |

The folder [fixtures.invalid](./fixtures.invalid/) holds documents that **must not** validate (used by `npm run validate-workflows`).

For the agentic intake fixture, routing semantics are intentionally split:

- `execution_mode == "workflow"` routes to `workflow.publish_draft`.
- Any other mode (including `open_agentic`) routes to an open-agentic dispatch bridge.

## Validate the workflow JSON

Preferred: from the repository root run `npm ci` then `npm run validate-workflows` (see [README.md](../README.md)).

One-off with [ajv-cli](https://github.com/ajv-validator/ajv-cli):

```bash
npx --yes ajv-cli@5 validate -s schemas/workflow-definition-poc.json -d examples/lighthouse-customer-routing.workflow.json --spec=draft2020
```

Trace companion files are informative and are **not** validated by the workflow schema.

## Lighthouse runbook (CLI + MCP)

The lighthouse fixture is `examples/lighthouse-customer-routing.workflow.json`.

### CLI path

Validate only the lighthouse fixture:

```bash
npm run engine:validate -- examples/lighthouse-customer-routing.workflow.json
```

Validate the full examples set (includes invalid-fixture rejection checks):

```bash
npm run validate-workflows
```

### Expected branch behavior

- If classification resolves `intent == "billing"` and `confidence > 0.8`, `switch` routes to `open_ticket`.
- If classification resolves `intent == "technical"`, `switch` routes to `search_kb`.
- If no case matches, `switch.default` routes to `human_review` and the run interrupts for resume input.

### MCP path

Start the MCP stdio server from repository root:

```bash
npm run engine:mcp:stdio
```

From your MCP-capable host, execute:

1. `workflow_start` with `definition = lighthouse-customer-routing.workflow.json` and `input = { "ticket_text": "..." }`
2. `workflow_status` to inspect phase and current node
3. `workflow_resume` when interrupted at `human_review` with `resume_payload = { "intent": "billing" }` or `{ "intent": "technical" }`

Tool contracts and error codes are documented in `packages/engine/README.md`, and an end-to-end host smoke flow is documented in `docs/architecture/mcp-stdio-host-smoke.md`.
Lighthouse-specific host walkthrough: `docs/architecture/lighthouse-mcp-host-guided-demo-walkthrough.md`.

### Crash-resume replay proof

Run the deterministic replay demo script:

```bash
node scripts/demo-lighthouse-replay-crash-resume.mjs
```

Runbook and evidence interpretation: `docs/architecture/lighthouse-replay-crash-resume-demo.md`.
