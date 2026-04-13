# Alpha Release Notes (Pre-1.0)

**Last reviewed:** 2026-04-13 

Release policy and checklist reference: [alpha-versioning-and-release-commit-flow.md](alpha-versioning-and-release-commit-flow.md)

## Audience and intent

These notes are for external evaluators and early adopters validating the current proof-of-concept protocol and engine behavior. This is not a production readiness statement.

## Highlights for this alpha phase

- Protocol-first repository with a structured RFC set under `docs/RFC/`.
- POC JSON Schema contract in `schemas/workflow-definition-poc.json`.
- Golden workflow fixtures and trace companions in `examples/`.
- Deterministic conformance harness entrypoint via `npm run conformance`.
- Node.js engine package with validation, append-only execution history, `switch`, and `interrupt`/resume support.

## Known limitations

- POC node support is intentionally limited. Deferred types include `parallel`, `agent_delegate`, `subworkflow`, `wait`, and `set_state`.
- Some RFC sections describe long-term direction that extends beyond the current POC engine implementation.
- Trace companion files are illustrative execution narratives and are not schema-validated executable workflow inputs.
- Contracts and naming are still pre-1.0 and may change with limited backward compatibility guarantees.

## Usage caveats

- Treat all workflows as alpha artifacts; validate definitions before execution.
- Use canonical JSON as execution input. YAML authoring is acceptable only when normalized before validation/run.
- Align local checks with CI by running `npm run validate-workflows` and `npm run conformance` from repo root.
- Node runtime expectations differ by context:
  - Repository CI currently runs on Node.js 24.
  - Engine package requires Node.js >= 22.5.0.

## No-install MCP quickstart (npx)

Use the published package directly from npm without cloning this repository.

**Operator vs development MCP wiring:** treat the **operator setup** (published `@agent-workflow/engine` via `npx`, below) as the default for MCP-capable hosts and demos. Use a **development setup** (absolute path to `packages/engine/src/mcp-stdio-server.mjs` in your clone) only when you are modifying the engine or MCP adapter. Step-by-step host guides: [MCP stdio host smoke](../architecture/mcp-stdio-host-smoke.md), [Lighthouse MCP walkthrough](../architecture/lighthouse-mcp-host-guided-demo-walkthrough.md).

The package is published under the npm organization scope **`@agent-workflow`** ([npm org](https://www.npmjs.com/org/agent-workflow)), not a separate `agent-workflow-protocol` scope.

Because the package exposes **two** CLI bins (`workflows-engine` and `workflows-engine-mcp`), use **`-p` / `--package`** so `npx` knows which package to install and which bin name to run. Omitting `-p` can yield `npm error could not determine executable to run` (npm treats the invocation as ambiguous).

### Fast channel install (moving alpha tag)

```bash
npx -y -p @agent-workflow/engine@alpha workflows-engine-mcp
```

### Reproducible install (exact pinned version)

```bash
npx -y -p @agent-workflow/engine@0.0.2 workflows-engine-mcp
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
        "@agent-workflow/engine@0.0.2",
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
     - `also_point_latest_dist_tag`: `true` (default) runs `npm dist-tag add @agent-workflow/engine@<version> latest` after publish so **`alpha` and `latest` both resolve to the same tarball** (typical for a promoted patch like `0.0.2`). Set `false` if you intentionally want `latest` left on an older build.
3. Post-publish smoke test:
   - `npx -y -p @agent-workflow/engine@alpha workflows-engine-mcp --help`
   - `npx -y -p @agent-workflow/engine@0.0.2 workflows-engine-mcp --help`
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
