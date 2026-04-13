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
