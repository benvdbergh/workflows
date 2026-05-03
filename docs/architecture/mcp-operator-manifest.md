# MCP operator manifest (engine reference)

Last updated: 2026-05-04

## Purpose

Define a **single, documented JSON shape** for operator-supplied MCP **stdio** server definitions so the reference engine can align with common IDE host manifests (Cursor-style `mcp.json` under `mcpServers`) without inventing a parallel undocumented format. Normative security and trust expectations for **engine-direct** execution are in [ADR-0003](adr/ADR-0003-engine-direct-mcp-activity-execution.md).

## Schema

- **JSON Schema (Draft 2020-12):** `packages/engine/schemas/mcp-operator-manifest.json`
- **Validation API:** `@agent-workflow/engine` exports `validateMcpOperatorManifest`, `readAndValidateMcpOperatorManifestFile`, `resolveMcpOperatorManifestPath`, and `normalizeMcpOperatorManifest` (see package `src/index.mjs`).

The schema accepts **only** this top-level shape:

- Required property: `mcpServers` — object whose keys are server labels and values are **stdio** definitions.
- Each server **MUST** include `command` (non-empty string).
- Optional: `args` (array of strings), `env` (object with string values only).
- **No** additional properties are allowed on the root or on each server entry (unknown keys fail validation with AJV instance paths).

## Resolution order (file path)

When code or tooling needs a manifest path without an explicit caller argument, resolution is:

1. **Explicit path** passed by the caller (for example a future CLI flag or host integration).
2. Environment variable **`AGENT_WORKFLOW_MCP_MANIFEST`**: path to a JSON file (relative paths are resolved from `process.cwd()` unless absolute).
3. **Default file:** `<cwd>/.agent-workflow/mcp.json` if that path exists on disk.

If none of the above apply, `resolveMcpOperatorManifestPath` returns `null` (no implicit manifest).

## CLI validation

From the repository root (after `npm install`):

```bash
npm run engine:validate -- path/to/workflow.json
node packages/engine/src/cli.mjs mcp-manifest validate path/to/mcp.json
```

Or with the published bin:

```bash
workflows-engine mcp-manifest validate path/to/mcp.json
```

Exit codes mirror workflow validate: `0` valid, `1` schema failure, `2` usage or I/O error.

## Vendor alignment and deliberate divergence

Many hosts use a JSON file with a top-level **`mcpServers`** map; this repository **matches that key** and the common **`command` / `args` / `env`** fields for **stdio** transports.

**Not supported in this manifest schema (validation will reject or ignore at boundary):**

| Vendor / product concept | Notes |
|--------------------------|--------|
| **`url` / SSE / HTTP MCP transports** | Omitted from this schema; use stdio `command`/`args` or a separate integration path. |
| **`disabled`, `alwaysAllow`, tool allowlists** | Host UX and policy; not part of the engine operator manifest contract. Re-introduce only with a versioned schema extension. |
| **`resource` roots, nested includes, `$ref` between files** | Not implemented; there is **no** include graph—**circular includes do not apply**. One JSON document per validated file. |
| **Non-string `env` values** | Rejected; normalize to string env for subprocess compatibility. |

Operators should **trim** vendor-only keys when translating a desktop `mcp.json` into a file validated by this schema, or maintain a dedicated engine manifest that lists only the stdio servers the automation profile may invoke.

## Secret handling

Follow [RFC-07](../RFC/rfc-07-security-model.md) and ADR-0003: prefer environment injection by a process supervisor, restrict file permissions on manifest paths, and avoid committing real secrets (use placeholders in examples and tests).

## References

- [ADR-0002](adr/ADR-0002-host-mediated-activity-execution.md), [ADR-0003](adr/ADR-0003-engine-direct-mcp-activity-execution.md)
- [RFC-06 §6.1](../RFC/rfc-06-interoperability.md#61-composing-mcp)
- `docs/governance/spec-architecture-governance.md`
