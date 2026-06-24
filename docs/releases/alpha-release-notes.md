# Alpha changelog (pre-1.0)

**Last reviewed:** 2026-06-24

**Current engine:** `@agent-workflow/engine@1.0.0` (GA v1). Maintainer process: [release-process.md](../governance/release-process.md). Roadmap: [ROADMAP.md](../../ROADMAP.md). Migration from alpha: [migration-alpha-to-ga.md](../migration-alpha-to-ga.md).

## v1.0.0 — 2026-06-24

### Added

- **GA v1 conformance profile** — `npm run conformance:v1` gates tagged releases; 60 vectors pass under `profile: "v1"` (BEN-89, BEN-112).
- **Lighthouse E2E** — `npm run e2e:lighthouse` exercises host-mediated activity completion on `examples/lighthouse-customer-routing.workflow.json` (BEN-111).
- **R3 delegation E2E** — `npm run e2e:r3` exercises real `A2ADelegateExecutor` against mock A2A server on `examples/r3-multi-agent-coding.workflow.json` (BEN-113).
- **REST/OpenAPI control plane** — `workflows-engine-rest` bin and RFC-05 adapter (BEN-84, BEN-97).
- **`@agent-workflow/sdk`** — TypeScript client with REST and in-process port parity (BEN-84, BEN-98).
- **Control plane MCP tools** — `workflow_signal`, `workflow_cancel`, `workflow_list`; `wait(kind=signal)` runtime (BEN-85).
- **Security v1** — `secret_ref` resolver at activity boundary, JWS Ed25519 definition signing, scoped MCP/REST auth tokens (BEN-86).
- **Orchestration policy** — node `retry` and `timeout` enforcement in graph walker (BEN-87).
- **Composition** — HTTP/URI `workflow_ref` registry, `llm_call` `output_schema` validation at activity boundary, optional SQLite-backed MCP store (BEN-88).

### Changed

- **npm `latest`** promotes `@agent-workflow/engine@1.0.0` on tag `v1.0.0` (non-alpha baseline).
- Release automation runs `conformance:v1` (not full alpha conformance) when `promote_latest` is true.
- GA preflight checklist documents real-path audit gates (`docs/governance/ga-release-checklist.md`).

### Fixed

- Lighthouse parity stub aligned with `output_schema` validation (BEN-109).
- `workflow_ref` fetch cache invalidates on re-register (BEN-108).

### Docs

- [Migration: alpha → GA](../migration-alpha-to-ga.md) updated for v1 operator path.
- E2E runbooks: [lighthouse host-mediated](../architecture/arc42-assets/runbooks/lighthouse-e2e-host-mediated.md), [R3 multi-agent delegation](../architecture/arc42-assets/runbooks/r3-multi-agent-delegation-e2e.md).

### Breaking/Impact Notes

- **Major (`1.0.0`):** first stable semver for `@agent-workflow/engine`. Alpha `0.1.x` adopters should pin `1.0.0`, re-validate workflows against the canonical schema URI, and review [migration-alpha-to-ga.md](../migration-alpha-to-ga.md). Default MCP stdio wiring still requires operator config for production executors; stubs remain for smoke tests only.

### Validation run

- `npm run check-engine-schema-sync`
- `npm run validate-workflows`
- `npm run conformance:v1` — `status: "pass"`, `profile: "v1"`, 60/60 vectors
- `npm run e2e:lighthouse`
- `npm run e2e:r3`
- `npm test` — 318 tests
- `npm pack --dry-run --workspace @agent-workflow/engine`
- `npm audit --audit-level=high` — 0 vulnerabilities

### Published URLs

- User docs: https://benvdbergh.github.io/workflows/latest/
- Schema mirror: https://benvdbergh.github.io/workflows/schemas/1.0.0/workflow-definition.json

## v0.1.5 — 2026-06-17

### Added

- **`LlmActivityExecutor`** — engine-direct `llm_call` with OpenAI-compatible provider wiring and structured output validation (BEN-93).
- **`StepHandlerRegistry` / `StepActivityExecutor`** — pluggable in-process `step` handlers (BEN-90).
- **`CompositeActivityExecutor`** — routes activities by node type; MCP stdio production wiring for `tool_call` (BEN-91).
- **Host-mediated `agent_delegate` lifecycle** — correlation-aware delegate status projection (BEN-95).
- **Production delegate executors** — `A2ADelegateExecutor`, `McpDelegateExecutor`, `SdkDelegateExecutor`, and `CompositeDelegateExecutor` (BEN-94, BEN-96).
- **MCP operator manifest validation** — CLI and library exports for Cursor-style `mcpServers` manifests.

### Changed

- MCP stdio adapter can wire composite activity and delegate executors for production operator profiles.
- Integration parity matrix documents R2/R3 conformance vectors and normalized snapshot format.

### Fixed

- LLM runner integration test aligned with workflow edge schema (BEN-93).
- **`hono`** dependency bump to satisfy npm audit gate.

### Docs

- [Host-mediated activities](https://benvdbergh.github.io/workflows/latest/user/host-mediated-activities/) guide and lighthouse parity (BEN-92).
- Operator manifest contract and as-built architecture diagram updates.

### Breaking/Impact Notes

- **Minor (`0.1.5`):** no schema or engine-profile contract changes; new executors are opt-in via application port / MCP wiring. Default in-process stub behavior remains for smoke tests.

### Published URLs

- User docs: https://benvdbergh.github.io/workflows/latest/
- Schema mirror: https://benvdbergh.github.io/workflows/schemas/0.1.5/workflow-definition.json

## v0.1.4 — 2026-06-15

### Added

- (none — pipeline validation cut)

### Changed

- (none — engine package unchanged)

### Fixed

- **Release docs deploy:** `release.yml` and `docs-publish.yml` fetch `gh-pages` before mike deploy to avoid push races.
- **`create-github-release`** no longer blocked when docs deploy fails after a successful npm publish.

### Docs

- Release notes for pipeline validation cut.

### Breaking/Impact Notes

- **Patch (`0.1.4`):** no engine API or schema contract changes.

### Published URLs

- User docs: https://benvdbergh.github.io/workflows/latest/
- Schema mirror: https://benvdbergh.github.io/workflows/schemas/0.1.4/workflow-definition.json

## v0.1.3 — 2026-06-15

### Added

- **Tag-triggered release orchestration** (`.github/workflows/release.yml`): push annotated `v*` tag runs quality gates → npm pack artifact → OIDC npm publish → GitHub Pages docs → GitHub Release.
- **`wf-release` maintainer skill** (`.claude/skills/wf-release/`) for preflight, tag push, postflight, and break-glass routing.
- **Release process overview** ([docs/governance/release-process.md](../governance/release-process.md)).

### Changed

- Release governance docs updated: tag push is the primary path; manual packaging/publish/docs workflows are **break-glass** only.
- Product documentation publishing workflow and end-user docs site build path on `master`.
- POC terminology renamed to **engine profile** across docs and skills (#89).

### Fixed

- (none called out separately for this cut)

### Docs

- Governance docs aligned to tag-triggered automation; `CLAUDE.md`, `README.md`, and wf skills updated for `wf-release`.

### Breaking/Impact Notes

- **Patch (`0.1.3`):** no engine API or schema contract changes; release operators should use tag push instead of manual workflow dispatch for routine cuts.

### Published URLs

- User docs: https://benvdbergh.github.io/workflows/latest/
- Schema mirror: https://benvdbergh.github.io/workflows/schemas/0.1.3/workflow-definition.json

## v0.1.2 — 2026-05-17

### Added

- Native **`agent_delegate`** and **`subworkflow`** node types in the engine profile, schema bundle, and graph walker.
- In-process **mock A2A** delegate lifecycle for `agent_delegate` with `config.protocol: "a2a"`.
- **Subworkflow nesting depth limit** (default max depth 4).

### Changed

- Engine profile and product documentation aligned: delegation and composition are **in scope** for `@agent-workflow/engine@0.1.2`.

### Docs

- End-user documentation site sources under `docs/user/`.

### Breaking/Impact Notes

- **Patch (`0.1.2`):** new node types and commands/events; consumers on `0.1.1` should re-validate workflows against the bundled schema before upgrade.
- **`subworkflow` workflow refs:** packaged installs must register child definitions via `registerWorkflowRef(urn, definition)`; URNs are not auto-discovered from the npm tarball alone.

### Published URLs

- User docs: https://benvdbergh.github.io/workflows/latest/
- Schema mirror: https://benvdbergh.github.io/workflows/schemas/0.1.2/workflow-definition.json

## v0.1.1 — 2026-05-17

### Added

- Unified **workflow graph walker** as the single orchestration path for linear, `switch`, `interrupt`/resume, and R2 nodes (`parallel`, `wait`, `set_state`).
- **Parallel join runtime** with graph invariants and walker support modules.

### Changed

- **Linear runner** and application/MCP layers route through the graph walker (removed legacy `poc-runner` entrypoints).
- Conformance harness uses `runGraphWorkflow` from the public engine API.

### Breaking/Impact Notes

- **Import/path:** consumers that imported `poc-runner` or `poc-runner-r2-parallel` must use `runGraphWorkflow` / `createLinearRunner` from `@agent-workflow/engine`.

## Known limitations

- **`agent_delegate`:** reference engine uses **mock A2A** only; production A2A/MCP/SDK adapters are not bundled (see [engine-profile.md](../engine-profile.md), [ADR-0004](../architecture/adr/ADR-0004-r3-delegation-and-subworkflow.md)).
- **`subworkflow` workflow refs:** child definitions must be registered (e.g. `registerWorkflowRef`); built-in URNs load from `examples/` only in a monorepo checkout, not from the npm tarball ([engine README](../../packages/engine/README.md#workflow-references)).
- **Wait `signal`:** requires a host; the bare engine fails this path at runtime.
- Contracts and naming are pre-1.0; breaking changes may occur before `1.0.0`.
- Conformance **deferrals** are listed in `conformance/README.md`.

## Usage caveats

- Treat all workflows as alpha artifacts; validate definitions before execution.
- Use canonical JSON as execution input.
- Align local checks with CI: `npm run validate-workflows` and `npm run conformance`.
- Node.js **≥ 22.5.0** for the engine; repository CI uses Node.js **24**.
- MCP operator wiring: [mcp-operator-guide.md](../user/mcp-operator-guide.md) ([GitHub Pages](https://benvdbergh.github.io/workflows/latest/mcp-operator-guide/)).
