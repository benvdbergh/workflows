# Workflows

Repository for the **Agent Workflow Protocol** POC: scope notes, JSON Schema, golden examples, and validation tooling.

## Validate workflow definitions (under two minutes)

1. Install [Node.js](https://nodejs.org/) 18+.
2. From the repository root:

```bash
npm ci
npm run validate-workflows
```

This checks every STORY-1-3 golden `*.workflow.json` under `examples/` plus the minimal schema smoke instance, and asserts that an intentionally invalid fixture (top-level `extensions`) is **rejected**.

More detail: [schemas/README.md](schemas/README.md) and [examples/README.md](examples/README.md).
