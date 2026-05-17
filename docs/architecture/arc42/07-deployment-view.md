# 7. Deployment View

## 7.1 Infrastructure / process topology (as-is)

| Deployment unit | How it runs | Typical backing store |
|-----------------|------------|------------------------|
| **MCP stdio server** | Host spawns `workflows-engine-mcp` (published npx) or `node packages/engine/src/mcp-stdio-server.mjs` | In-memory store by default in reference bin; SQLite optional per integration wiring |
| **Validation CLI** | `workflows-engine validate …` | N/A |
| **CI worker** | GitHub Actions Node 24 job | Ephemeral; conformance + tests + validate-workflows |
| **Library consumers** | `import … from '@agent-workflow/engine'` in Node ESM | Caller-selected store |

**Diagram:** [`../arc42-assets/diagrams/as-built-views.drawio`](../arc42-assets/diagrams/as-built-views.drawio) — **`AS-IS Deployment View`**.

Represented deployment storylines (**draw.io** annotations defer non-shipping capabilities explicitly):

| Mode | What happens |
|------|--------------|
| **Operator MCP host** | IDE/automation launches published **`workflows-engine-mcp`** (**`npx -y -p …`**) over **stdio**. Reference wiring defaults to **in-memory** `ExecutionHistoryStore`; operators may inject **SQLite** when composing `createWorkflowApplicationPort` externally. |
| **Local developer** | Host invokes `node packages/engine/src/mcp-stdio-server.mjs` (or **`npm run engine:mcp:stdio`**) — same MCP JSON-RPC choreography with repo-local artifacts. Optional SQLite-backed history when wired by integrators. |
| **CI worker** | `npm run validate-workflows`, `npm run conformance`, `npm test` exercise the identical validation/orchestration modules without shipping MCP unless a test launches the adapter deliberately. |

Operator runbook: [`../arc42-assets/runbooks/mcp-stdio-host-smoke.md`](../arc42-assets/runbooks/mcp-stdio-host-smoke.md).

## 7.2 Network and IPC boundaries

| Channel | Data exchanged | Notes |
|---------|----------------|-------|
| **stdio MCP** | JSON-RPC MCP messages | Primary integration path for hosts |
| **Optional stdio MCP to upstream servers** | Engine-direct invocation | Operator-supplied manifest; see ADR-0003 |

## 7.3 Artifact distribution

| Artifact | Destination | Mechanism |
|----------|-------------|-----------|
| **npm tarball** `@agent-workflow/engine` | npm registry (`alpha` dist-tag per repository guidance) | `prepack` runs schema sync into package |
| **Spec PDFs / prose** *(out of npm)* | Repo `docs/` | Version control |

## 7.4 Configuration knobs (representative)

| Variable / flag | Purpose |
|-----------------|---------|
| `WORKFLOW_ENGINE_MCP_CONFIG` / `--mcp-config` | Engine-direct MCP operator manifest wiring |
| `npm run engine:mcp:stdio` | Local MCP server bootstrap |

---

**Improvement candidates**

1. **Documented Helm/K8s** only when REST/service wrapper exists—avoid implying cluster deployment today.
2. **SQLite persistence** path for published MCP bin: clarify recommended production wiring in application port/host examples (beyond smoke doc).
3. Add **diagram diff review** guideline when deployment assumptions change (`drawio` + this section).
