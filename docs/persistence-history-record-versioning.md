# History record schema_version (persistence envelope)

**Scope:** This note governs **`record_schema_version`** on append-only **execution history** rows stored via `ExecutionHistoryStore` (SQLite column `record_schema_version`; in-memory rows expose `recordSchemaVersion`). It is **not** a substitute for:

- **`document.schema`** in workflow definitions ([RFC-03](RFC/rfc-03-workflow-definition-schema.md)) — that versions the **workflow JSON contract**.
- **Command/event names** in the execution model ([RFC-04 §4.4–4.5](RFC/rfc-04-execution-model.md)) — those are protocol taxonomies; persistence may carry them in `kind` + `name` without encoding the taxonomy version in this field.

The history **envelope** is the adapter’s row shape (columns, JSON payload wrapping rules, and any future normalization). Bump `CURRENT_HISTORY_RECORD_SCHEMA_VERSION` in `packages/engine/src/persistence/history-record-schema-version.mjs` when a change requires replay or migration logic that an older engine cannot apply safely.

## Current version

- **Value:** `1` — first numbered envelope (adds an explicit persisted version; payloads unchanged from prior POC rows).
- **Engine API:** `CURRENT_HISTORY_RECORD_SCHEMA_VERSION`, `assertHistoryReadableByEngine`, `recordSchemaVersionOf` (exported from `@agent-workflow/engine`).

## Read policy (forward compatibility)

1. **Missing or unknown on read:** Treat as version **1** (legacy rows pre–column and in-memory clones without the field).
2. **Row version newer than engine support:** `hydrateReplayContext`, `getWorkflowStatus`, and any path that loads full history **fail fast** with a clear error so hosts can upgrade the package rather than silently corrupting replay.
3. **Row version ≤ engine support:** Readers **must** accept all versions the engine advertises support for (future: optional shims per version).

Orchestration (`runPocWorkflow`, `resumePocWorkflow`) and the MCP application port **must not** embed SQL or storage-specific I/O; they only call `ExecutionHistoryStore`. Only adapters implement persistence.

## SQLite

New databases create `history` with `record_schema_version`. Existing databases without the column get `ALTER TABLE … ADD COLUMN … DEFAULT 1` on store open (no row rewrite).

## Related

- Store port JSDoc: `packages/engine/src/persistence/types.mjs`
- Operator overview: `packages/engine/README.md` (Execution history section)
