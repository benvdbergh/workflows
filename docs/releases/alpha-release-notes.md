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

## Upgrade caveats for upcoming stories

- Versioning policy and final release commit flow are being formalized in Story 7-2.
- Security baseline hardening and CI/CD release packaging are tracked in Stories 7-3 and 7-4.
- Community rollout operations are tracked in Story 7-5.

## Getting help and context

- Root onboarding and quick commands: [../../README.md](../../README.md)
- Docs information architecture index: [../README.md](../README.md)
