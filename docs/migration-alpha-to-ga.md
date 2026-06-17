# Migration: alpha (`@agent-workflow/engine@0.1.5`) → GA v1

**Last reviewed:** 2026-06-16  
**Status:** Stub — expanded as R4 GA approaches.  
**Profile model:** [profile-model.md](./profile-model.md)  
**Alpha changelog:** [releases/alpha-release-notes.md](releases/alpha-release-notes.md)

This guide helps operators and workflow authors move from the **alpha reference engine** to the **GA v1** contract (schema URI, conformance tag, and engine semver `1.x` when published).

---

## 1. Schema and document metadata

| Alpha (legacy URIs) | Current canonical URI |
|----------------------|-------------------------|
| `https://example.org/agent-workflow/poc/v1/workflow-definition` or `https://example.org/agent-workflow/v1` | `https://agent-workflow.dev/schemas/workflow-definition.json` |
| JSON Schema file `$id` (legacy) | `https://agent-workflow.dev/schemas/workflow-definition.json` |

**Actions:**

1. Re-validate all workflow JSON against the bundled schema after upgrade (`npm run engine:validate -- path/to/workflow.json` or `npm run validate-workflows`).
2. Update `document.schema` to the canonical URI in each workflow instance.
3. Run `npm run check-engine-schema-sync` in CI to ensure the engine package copies the root schema.

**On-disk entry schema:** `schemas/workflow-definition.json` (bundled under `packages/engine/schemas/`).

---

## 2. `tool_call` → `agent_delegate` bridge

Alpha milestones often modeled agent work as MCP-shaped **`tool_call`** nodes (`agent.execute`, status polling tools, etc.). GA core profile prefers native **`agent_delegate`** with explicit protocol and correlation fields.

| Concern | `tool_call` (bridge) | `agent_delegate` (native) |
|---------|----------------------|---------------------------|
| Identity | `config.server` + `config.tool` | `config.agent_id` + `config.protocol` (`a2a` \| `mcp` \| `sdk`) |
| Inputs | Tool arguments / host payload | `config.input_mapping` (jq / literals) |
| Correlation | Ad hoc in tool results | `delegateCorrelationId`, `externalTaskId` on `ActivityRequested` / `ActivityCompleted` |

**Migration steps:**

1. For each delegation `tool_call`, add an equivalent `agent_delegate` node with the same observable activity lifecycle (requested → completed/failed).
2. Map `input_mapping` from prior argument shapes; reuse jq expressions where they already read parent state (see [jq-conformance-subset.md](./jq-conformance-subset.md)).
3. Re-run conformance/replay fixtures; event prefixes should remain valid when lifecycle timing is preserved (`docs/engine-profile.md` §2.2).
4. Keep `tool_call` for non-agent tools (CRM, search, calculators); remove agent-shaped tools once hosts support delegate.

Reference engine: in-process mock A2A for `protocol: "a2a"`; MCP/SDK paths may still use host-mediated activities.

---

## 3. Engine package and MCP adapter

| Step | Detail |
|------|--------|
| Pin version | Move from `@agent-workflow/engine@alpha` / `0.x` to GA `1.x` when released. |
| MCP config | Update `npx -p @agent-workflow/engine@<ga>` in MCP server definitions. |
| Breaking checks | Review [alpha-release-notes.md](releases/alpha-release-notes.md) per release; GA will publish a compatibility matrix. |

**Already in alpha (no GA re-work required for these):**

- `definitionHash` on checkpoints — callers must pass the same canonical `definition` on resume, `workflow_submit_activity`, and continuation (BEN-78).
- `workflow_start` idempotency when `execution_id` already exists (documented on MCP port).
- Refusal of `interrupt` inside `parallel` branches (BEN-77).

---

## 4. Optional features to plan for

| Feature | Alpha behavior | GA expectation |
|---------|----------------|----------------|
| `wait.signal` | Fails in bare engine | Host implements signal delivery |
| `retry` / `timeout` | Ignored by walker | Implement or mark optional in profile |
| Signing / scoped auth | Not in engine | BEN-10 security baseline |

---

## 5. Validation checklist (pre-GA cutover)

```bash
npm run check-engine-schema-sync
npm run validate-workflows
npm test
npm run conformance
```

Record conformance summary JSON in release notes when tagging GA artifacts.

---

## Open items (stub)

- [ ] Published GA semver and npm dist-tag policy  
- [ ] Conformance profile name and badge (`passes-v1-core`)  
- [ ] Changelog entries for any breaking MCP error code changes  
- [ ] HTTP version negotiation (deferred; see [profile-model.md](./profile-model.md))
