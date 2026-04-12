# Example workflow fixtures

Golden definitions and **trace companions** for the POC contract ([docs/poc-scope.md](../docs/poc-scope.md), [schemas/](../schemas/)).

| File | Purpose |
|------|---------|
| [lighthouse-customer-routing.workflow.json](./lighthouse-customer-routing.workflow.json) | Canonical **JSON** workflow (lighthouse / customer-routing shape: `llm_call`, `switch`, `interrupt`, `tool_call`). |
| [lighthouse-customer-routing.trace.happy.json](./lighthouse-customer-routing.trace.happy.json) | Expected **command** and **event** prefixes for a happy-path technical route ([RFC-04](../docs/RFC/rfc-04-execution-model.md) §4.4–4.5). |
| [lighthouse-customer-routing.trace.failure-and-retry.json](./lighthouse-customer-routing.trace.failure-and-retry.json) | **Retry** (failed `classify` activity) and **failure** (invalid interrupt resume) prefix narratives. |

## Validate the workflow JSON

From the repository root (same as [schemas/README.md](../schemas/README.md)):

```bash
npx --yes ajv-cli@5 validate -s schemas/workflow-definition-poc.json -d examples/lighthouse-customer-routing.workflow.json --spec=draft2020
```

Trace companion files are informative and are **not** validated by the workflow schema.
