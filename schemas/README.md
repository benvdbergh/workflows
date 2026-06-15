# JSON Schema bundle

Machine-readable contract for the **reference engine workflow definition** profile. Human-readable scope and semantics:

- [docs/engine-profile.md](../docs/engine-profile.md) — authoritative engine profile (`parallel`, `wait`, `set_state`, `agent_delegate`, `subworkflow`, …)
- [docs/RFC/rfc-03-workflow-definition-schema.md](../docs/RFC/rfc-03-workflow-definition-schema.md) — normative protocol text

## Entry schema

| Artifact | Role |
|----------|------|
| [workflow-definition.json](./workflow-definition.json) | **Entry schema** (`$id`: `https://agent-workflow.dev/schemas/workflow-definition.json`). Validates canonical **JSON** documents; internal `$defs` hold node shapes. See [v1 profile model](../docs/releases/profile-model.md). |

**JSON Schema dialect:** [Draft 2020-12](https://json-schema.org/draft/2020-12/json-schema-core.html) (`$schema` on the entry file).

**Contract hygiene (architecture):**

- Stable **`$id`** on the entry schema for tooling, documentation links, and future registry publication.
- **`additionalProperties: false`** on the workflow root rejects top-level fields not in the engine profile surface (including **`extensions`**, which is out of scope per [docs/engine-profile.md](../docs/engine-profile.md)).
- **`oneOf` node discriminated union** rejects unknown `type` values not defined in the schema bundle (including `agent_delegate` and `subworkflow` when present in the profile).

**Limits:** `state_schema` is validated as a non-empty object only; nested `reducer: custom` is called out in the schema description as needing extra checks if you require it. Unique `nodes[].id` values are not expressible in JSON Schema alone—enforce in the engine or a small custom lint.

## Validate an instance (CLI)

Authoring in YAML is fine for humans; **normalize to JSON** before validation (per [RFC-03 §3.1](../docs/RFC/rfc-03-workflow-definition-schema.md)).

### Repository command (CI and local)

From the repo root (see [README.md](../README.md)):

```bash
npm ci
npm run validate-workflows
```

This validates every `examples/*.workflow.json`, the minimal instance under `schemas/examples/`, and checks that `examples/fixtures.invalid/extensions.workflow.json` is **rejected** (top-level `extensions` is out of engine profile scope).

### One-off validation with ajv-cli

Using [ajv-cli](https://github.com/ajv-validator/ajv-cli) (no project install required):

```bash
npx --yes ajv-cli@5 validate -s schemas/workflow-definition.json -d path/to/workflow.json --spec=draft2020
```

On Windows PowerShell, the same command works from the repository root.

## Golden fixtures

Validated example workflows and RFC-04 trace companions: [examples/README.md](../examples/README.md).

## Versioning

Bump **`document.schema`** in workflow instances and revise this bundle together when the engine profile contract changes; keep [docs/engine-profile.md](../docs/engine-profile.md) and these files aligned in the same change set where possible.
