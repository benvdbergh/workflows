# Alpha Release Notes (Pre-1.0)

**Last reviewed:** 2026-06-15

**Current published engine:** `@agent-workflow/engine@0.1.4` (tag-triggered publish via `release.yml`; see [release process](README.md)). Prior npm line: `0.1.3`. See [ROADMAP.md](../../ROADMAP.md) for post-alpha sequencing.

Release policy and checklist reference: [alpha-versioning-and-release-commit-flow.md](alpha-versioning-and-release-commit-flow.md)

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

### Internal

- Full tag-triggered release pipeline validated end-to-end (`release.yml` on `v0.1.4`).

### Breaking/Impact Notes

- **Patch (`0.1.4`):** no engine API or schema contract changes.

### Validation run

- `npm run check-engine-schema-sync`
- `npm run validate-workflows`
- `npm run conformance`
- `npm test`
- `npm pack --workspace @agent-workflow/engine`

### Published URLs

- User docs: https://benvdbergh.github.io/workflows/latest/
- Schema mirror: https://benvdbergh.github.io/workflows/schemas/0.1.4/workflow-definition.json

### Publish (maintainers)

1. Merge release commit to `master`; confirm CI green.
2. Push annotated tag **`v0.1.4`** → **`Release (tag)`** workflow runs automatically.
3. Postflight: verify npm `@agent-workflow/engine@0.1.4`, docs URLs, and `gh release view v0.1.4`.

## v0.1.3 — 2026-06-15

### Added

- **Tag-triggered release orchestration** (`.github/workflows/release.yml`): push annotated `v*` tag runs quality gates → npm pack artifact → OIDC npm publish → GitHub Pages docs → GitHub Release.
- **`wf-release` maintainer skill** (`.claude/skills/wf-release/`) for preflight, tag push, postflight, and break-glass routing.
- **Release process overview** (`docs/releases/README.md`).

### Changed

- Release governance docs updated: tag push is the primary path; manual packaging/publish/docs workflows are **break-glass** only.
- Product documentation publishing workflow and end-user docs site build path on `master` (since `v0.1.2`).
- POC terminology renamed to **engine profile** across docs and skills (#89).

### Fixed

- (none called out separately for this cut)

### Docs

- `alpha-versioning-and-release-commit-flow.md` and `alpha-ci-cd-packaging-governance.md` aligned to tag-triggered automation.
- `CLAUDE.md`, `README.md`, and `wf-plan` / `wf-execute` escalation updated for `wf-release`.

### Internal

- CI dependency bumps (GitHub Actions v6/v7, ajv, zod).
- R4 GA protocol stabilization and CI gate hardening (#81).

### Breaking/Impact Notes

- **Patch (`0.1.3`):** no engine API or schema contract changes; release operators should use tag push instead of manual workflow dispatch for routine cuts.

### Validation run

- `npm run check-engine-schema-sync`
- `npm run validate-workflows`
- `npm run conformance`
- `npm test`
- `npm pack --workspace @agent-workflow/engine`

### Published URLs

- User docs: https://benvdbergh.github.io/workflows/latest/
- Schema mirror: https://benvdbergh.github.io/workflows/schemas/0.1.3/workflow-definition.json

### Publish (maintainers)

1. Merge release commit to `master`; confirm CI green.
2. Push annotated tag **`v0.1.3`** → **`Release (tag)`** workflow runs automatically.
3. Postflight: verify npm `@agent-workflow/engine@0.1.3`, docs URLs, and `gh release view v0.1.3`.

## v0.1.2 — 2026-05-17

### Added

- Native **`agent_delegate`** and **`subworkflow`** node types in the engine profile, schema bundle, and graph walker (`delegate-executor.mjs`, `subworkflow-runtime.mjs`, `workflow-ref-resolver.mjs`).
- In-process **mock A2A** delegate lifecycle (`submitted` → `working` → `completed`) for `agent_delegate` with `config.protocol: "a2a"`.
- **Subworkflow nesting depth limit** (default max depth 4; configurable via walker options).

### Changed

- Engine profile and product documentation aligned: delegation and composition are **in scope** for `@agent-workflow/engine@0.1.2` (patch bump per alpha SemVer policy).

### Fixed

- (none called out separately for this cut)

### Docs

- Release notes, `CLAUDE.md`, arc42 product sections, and `docs/engine-profile.md` scrubbed of stale “out of scope” delegation/composition language; capability terms replace release-milestone labels in product docs.
- End-user documentation site sources under `docs/user/`; publish via **Docs publish (manual)** workflow.

### Published URLs

- User docs: https://benvdbergh.github.io/workflows/latest/
- Schema mirror: https://benvdbergh.github.io/workflows/schemas/0.1.2/workflow-definition.json

### Internal

- Conformance and engine tests extended for delegate/subworkflow replay paths.

### Breaking/Impact Notes

- **Patch (`0.1.2`):** new node types and commands/events; consumers on `0.1.1` should re-validate workflows against the bundled schema before upgrade.
- **`subworkflow` workflow refs:** packaged installs must register child definitions via `registerWorkflowRef(urn, definition)` (or equivalent host wiring); URNs in `config.workflow_ref` are not auto-discovered from the filesystem in the published tarball alone.

### Validation run

- `npm run check-engine-schema-sync`
- `npm run validate-workflows`
- `npm run conformance`
- `npm test`
- `npm pack --workspace @agent-workflow/engine`

### Publish (maintainers)

1. Merge to `main`, tag **`v0.1.2`**, push tag.
2. Confirm **Validate workflow definitions** passed on the release commit.
3. Trigger **Release npm publish (manual)** with `release_ref`: `v0.1.2`:
   - **Default channel:** `dist_tag`: `latest` (single OIDC publish; no extra dist-tag step).
   - **Alpha channel:** `dist_tag`: `alpha`, `also_point_latest_dist_tag`: `false` unless repository secret **`NPM_TOKEN`** is configured (OIDC publish + `npm dist-tag add` often fails with `E401`).
4. To point **`latest`** at an already-published version (e.g. after alpha-only publish): `npm dist-tag add @agent-workflow/engine@0.1.2 latest` locally, or re-run the workflow with `NPM_TOKEN` set and `also_point_latest_dist_tag` true.

## v0.1.1 — 2026-05-17

### Added

- Unified **workflow graph walker** (`workflow-graph-walker.mjs`) as the single orchestration path for linear, `switch`, `interrupt`/resume, and R2 nodes (`parallel`, `wait`, `set_state`).
- **Parallel join runtime** (`parallel-join-runtime.mjs`) with graph invariants and walker support modules.
- Engine tests: `workflow-graph-walker.test.mjs`, `parallel-join-runtime.test.mjs`.

### Changed

- **Linear runner** and application/MCP layers route through the graph walker (removed legacy `poc-runner` / `poc-runner-r2-parallel` entrypoints).
- Conformance harness uses `runGraphWorkflow` from the public engine API.
- CI: **Validate workflow definitions** runs on every branch push and supports `workflow_dispatch` (PRs still gate on `main` / `master`).

### Fixed

- (none called out separately — treat this cut as orchestration consolidation plus regression coverage)

### Docs

- Release notes and pinned `npx` examples updated for `0.1.1`.

### Internal

- Walker node execution extracted to `workflow-node-execution.mjs`; validation and MCP adapter aligned with the unified runner.

### Breaking/Impact Notes

- **Import/path:** consumers that imported `poc-runner` or `poc-runner-r2-parallel` must use `runGraphWorkflow` / `createLinearRunner` from `@agent-workflow/engine` (see package exports in `packages/engine/src/index.mjs`).

### Validation run

- `npm run check-engine-schema-sync`
- `npm run validate-workflows`
- `npm run conformance`
- `npm test`
- `npm pack --workspace @agent-workflow/engine`

### Publish (maintainers)

1. Merge to `main`, tag **`v0.1.1`**, push tag.
2. Confirm **Validate workflow definitions** passed on the release commit.
3. Trigger **Release npm publish (manual)** with `release_ref`: `v0.1.1`:
   - **Default channel:** `dist_tag`: `latest` (single OIDC publish; no extra dist-tag step).
   - **Alpha channel:** `dist_tag`: `alpha`, `also_point_latest_dist_tag`: `false` unless repository secret **`NPM_TOKEN`** is configured (OIDC publish + `npm dist-tag add` often fails with `E401`).
4. To point **`latest`** at an already-published version (e.g. after alpha-only publish): `npm dist-tag add @agent-workflow/engine@0.1.1 latest` locally, or re-run the workflow with `NPM_TOKEN` set and `also_point_latest_dist_tag` true.

## Audience and intent

These notes are for external evaluators and early adopters validating the current proof-of-concept protocol and engine behavior. This is not a production readiness statement.

## Highlights for this alpha phase

- Protocol-first repository with a structured RFC set under `docs/RFC/`.
- JSON Schema contract in `schemas/workflow-definition.json` for the **engine profile** in [`docs/engine-profile.md`](../engine-profile.md) (core orchestration, `parallel`, `wait`, `set_state`, **`agent_delegate`**, **`subworkflow`**).
- Golden workflow fixtures and trace companions in `examples/`, including parallel and research-style fixtures.
- Deterministic conformance harness entrypoint via `npm run conformance` (schema, replay, host-activity, and engine-direct replay invariants).
- Node.js engine package with validation, append-only execution history, `switch`, `interrupt`/resume, parallel join policies, `wait` duration/until, `set_state`, delegation and nested workflows, checkpoint policy hooks, **host-mediated** and **engine-direct** `tool_call` activity execution (see [ADR-0003](../architecture/adr/ADR-0003-engine-direct-mcp-activity-execution.md)), and MCP stdio adapter.

## Known limitations

- **`agent_delegate`:** reference engine uses **mock A2A** only; production A2A/MCP/SDK adapters are not bundled (see `docs/engine-profile.md`, [ADR-0004](../architecture/adr/ADR-0004-r3-delegation-and-subworkflow.md)).
- **`subworkflow` workflow refs:** child definitions must be registered (e.g. `registerWorkflowRef`); built-in URNs load from `examples/` only in a monorepo checkout, not from the npm tarball ([engine README](../../packages/engine/README.md#workflow-references), [arc42 §8.8](../architecture/arc42/08-cross-cutting-concepts.md#88-workflow-reference-resolution-subworkflow)).
- **Wait `signal`:** requires a host; the bare engine fails this path at runtime (see `docs/engine-profile.md`).
- Some RFC sections describe long-term direction (e.g. REST/SDK parity, core binary) that extends beyond this Node.js reference package.
- Trace companion files are illustrative execution narratives and are not schema-validated executable workflow inputs.
- Contracts and naming are still pre-1.0 and may change with limited backward compatibility guarantees.
- Conformance **deferrals** (e.g. full reducer matrix, full parallel join policy matrix, MCP tool mock roundtrip) are listed in `conformance/README.md` — behavior is still covered in part by engine tests and fixtures.

## Usage caveats

- Treat all workflows as alpha artifacts; validate definitions before execution.
- Use canonical JSON as execution input. YAML authoring is acceptable only when normalized before validation/run.
- Align local checks with CI by running `npm run validate-workflows` and `npm run conformance` from repo root.
- Node runtime expectations differ by context:
  - Repository CI currently runs on Node.js 24.
  - Engine package requires Node.js >= 22.5.0.

## No-install MCP quickstart (npx)

Use the published package directly from npm without cloning this repository.

**Operator vs development MCP wiring:** treat the **operator setup** (published `@agent-workflow/engine` via `npx`, below) as the default for MCP-capable hosts and demos. Canonical guide: [docs/user/mcp-operator-guide.md](../user/mcp-operator-guide.md) ([GitHub Pages](https://benvdbergh.github.io/workflows/latest/mcp-operator-guide/)). Use a **development setup** (absolute path to `packages/engine/src/mcp-stdio-server.mjs` in your clone) only when you are modifying the engine or MCP adapter. Deep-dive walkthroughs: [MCP stdio host smoke](../architecture/arc42-assets/runbooks/mcp-stdio-host-smoke.md), [Lighthouse MCP walkthrough](../architecture/arc42-assets/demos/lighthouse-mcp-host-guided-demo-walkthrough.md).

The package is published under the npm organization scope **`@agent-workflow`** ([npm org](https://www.npmjs.com/org/agent-workflow)), not a separate `agent-workflow-protocol` scope.

Because the package exposes **two** CLI bins (`workflows-engine` and `workflows-engine-mcp`), use **`-p` / `--package`** so `npx` knows which package to install and which bin name to run. Omitting `-p` can yield `npm error could not determine executable to run` (npm treats the invocation as ambiguous).

### Fast channel install (moving alpha tag)

```bash
npx -y -p @agent-workflow/engine@alpha workflows-engine-mcp
```

### Reproducible install (exact pinned version)

```bash
npx -y -p @agent-workflow/engine@0.1.2 workflows-engine-mcp
```

### Provider-neutral MCP client configuration examples

Generic JSON-style client configuration:

```json
{
  "mcpServers": {
    "agent-workflow-engine": {
      "command": "npx",
      "args": [
        "-y",
        "-p",
        "@agent-workflow/engine@alpha",
        "workflows-engine-mcp"
      ]
    }
  }
}
```

Pinned, immutable client configuration:

```json
{
  "mcpServers": {
    "agent-workflow-engine": {
      "command": "npx",
      "args": [
        "-y",
        "-p",
        "@agent-workflow/engine@0.1.2",
        "workflows-engine-mcp"
      ]
    }
  }
}
```

Use `@alpha` for fast feedback loops and exact pinned versions for reproducible bug reports, demos, and incident triage.

## Operator runbook (publish to announce)

Run this sequence for every alpha publish event.

1. Package verify:
   - `npm ci`
   - `npm pack --dry-run --workspace @agent-workflow/engine`
2. Publish dispatch:
   - Trigger `Release npm publish (manual)` in GitHub Actions.
   - Inputs:
     - `release_ref`: release tag, branch, or SHA.
     - `dist_tag`: `alpha` for pre-release channel (use `latest` only if you want the publish step itself to target `latest`).
     - `also_point_latest_dist_tag`: `false` by default. Set `true` only when you need **`alpha` and `latest`** on the same version; requires repository secret **`NPM_TOKEN`** or the promotion step may fail with `E401` under OIDC-only auth. Prefer `dist_tag: latest` when the default npm channel should move.
3. Post-publish smoke test:
   - `npx -y -p @agent-workflow/engine@alpha workflows-engine-mcp --help`
   - `npx -y -p @agent-workflow/engine@0.1.2 workflows-engine-mcp --help`
4. Announcement update:
   - Update launch templates and release notes with the published version.
   - Publish channel posts from `docs/community-launch-playbook.md`.

## Early alpha rollback and unpublish incident note

If an alpha release is broken or mislabeled:

- Stop ongoing promotion and update launch threads with a short incident note.
- If not yet broadly consumed, deprecate the affected version on npm and announce the replacement version.
- If channel tagging is wrong, publish a corrected build and move follow-up guidance to the corrected tag/version.
- Keep a public incident summary in release notes with:
  - impacted version and dist-tag,
  - operator action taken (deprecate or supersede),
  - safe replacement command for users.

## Upgrade caveats for upcoming stories

- Versioning policy and final release commit flow are being formalized in Story 7-2.
- Security baseline hardening and CI/CD release packaging are tracked in Stories 7-3 and 7-4.
- Community rollout operations are tracked in Story 7-5.

## Getting help and context

- Root onboarding and quick commands: [../../README.md](../../README.md)
- Docs information architecture index: [../README.md](../README.md)
