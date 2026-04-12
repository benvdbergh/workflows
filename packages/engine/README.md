# `@agent-workflow-protocol/engine`

Private workspace package: **definition-time** validation for Agent Workflow Protocol POC workflow documents. Persistence, orchestration, and graph walking are out of scope here (later epics).

## Entrypoint (CLI)

From the repository root (after `npm install`):

```bash
node packages/engine/src/cli.mjs validate path/to/workflow.json
```

Or use the package bin name when linked:

```bash
npx workflows-engine validate path/to/workflow.json
```

- **File argument:** Path to a file containing **canonical JSON** (RFC-03: normalized JSON, not YAML at runtime).
- **Stdin:** Omit the file argument or pass `-` to read JSON from stdin.

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | Document is valid against the POC schema. |
| 1 | JSON parsed but schema validation failed (details on stderr). |
| 2 | Usage error, I/O failure, or JSON parse error. |

On validation failure, stderr lists each AJV error with `instancePath`, `keyword`, `schemaPath`, `params`, and `message` where present so documents can be fixed without guessing.

## Library API

The package exports:

- `validateWorkflowDefinition(data)` — returns `{ ok: true }` or `{ ok: false, errors }` where `errors` is AJV’s `ErrorObject[]` (includes `instancePath`, `keyword`, `schemaPath`, etc.).
- `compileWorkflowValidator()` — returns a reusable `(data) => { ok: true } | { ok: false, errors }` function; the compiled schema is cached per process.
- `findWorkflowRepoRoot(startDir?)` — locates the checkout root that contains `schemas/workflow-definition-poc.json` (used to resolve the schema path).

Example:

```js
import { validateWorkflowDefinition } from "@agent-workflow-protocol/engine";
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("workflow.json", "utf8"));
const result = validateWorkflowDefinition(data);
if (!result.ok) console.error(result.errors);
```

## Stable “valid definition” boundary (for STORY-2-2+)

- **Schema contract:** The engine validates against the same file as CI and `scripts/validate-workflows.mjs`: **`schemas/workflow-definition-poc.json`** (JSON Schema Draft 2020-12).
- **Ajv options:** `allErrors: true`, `strict: false` — identical to `scripts/validate-workflows.mjs` to avoid drift from “repo truth.”
- **Engine-specific limits:** None beyond the schema and JSON parse rules. The engine does **not** enforce file size limits, `document.schema` version bumps, or trace companions; only the POC workflow **definition** JSON shape is checked.
- **Resolution rule:** The schema file is found by walking upward from `packages/engine/src/` until a directory containing `schemas/workflow-definition-poc.json` is found. Running the CLI or library **outside** this repository layout will throw or fail until that layout exists.

## Tests

```bash
npm test --workspace=@agent-workflow-protocol/engine
```
