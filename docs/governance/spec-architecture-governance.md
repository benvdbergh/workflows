# Specification and architecture governance

**Last reviewed:** 2026-06-15  
**Status:** Alpha design-first policy (lightweight gates)

This document defines how specification, architecture, and implementation changes stay aligned in the workflows repository during alpha.

## Gate A — Intake and scope

Before significant work:

1. Confirm alignment with [ROADMAP.md](../../ROADMAP.md) and Linear milestone intent.
2. Classify change: protocol contract, engine profile, reference implementation, or documentation only.
3. For contract changes, identify required updates to schema, fixtures, conformance vectors, and [engine-profile.md](../engine-profile.md).

## Gate B — Design evidence

Before implementation of non-trivial features:

1. Update or cite relevant [arc42](../architecture/arc42/README.md) sections.
2. Record consequential decisions in [ADRs](../architecture/adr/README.md) when trade-offs are non-obvious.
3. Use [as-built diagrams](../architecture/arc42-assets/diagrams/as-built-views.drawio) for current-state evidence.
4. Target-state sketches (when used) belong under [archive/target-state](../architecture/arc42-assets/archive/target-state/) and must not be cited as as-built baseline.

## Gate C — Contract and quality

Before merge / release:

1. `npm run validate-workflows` and `npm run conformance` pass.
2. Schema sync: `npm run check-engine-schema-sync`.
3. Engine tests: `npm test`.
4. Release notes updated when consumer-visible behavior changes.
5. End-user docs source updated in `docs/user/` when operator or author guidance changes; publish via **Docs publish (manual)** workflow.

## Traceability

| Artifact | Role |
|----------|------|
| [RFC shards](../RFC/rfc-00-overview.md) | Normative protocol text |
| [engine-profile.md](../engine-profile.md) | Reference engine subset |
| [profile-model.md](../releases/profile-model.md) | Core vs optional matrix |
| [schemas/workflow-definition.json](../../schemas/workflow-definition.json) | Machine-readable contract |
| [conformance/](../../conformance/README.md) | Deterministic behavior vectors |

## Documentation tiers

| Audience | Location |
|----------|----------|
| End users | [GitHub Pages](https://benvdbergh.github.io/workflows/) (built from `docs/user/`) |
| Developers / AI | [docs/README.md](../README.md) (in-repo) |
| Narrative | [whitepaper](../whitepaper/agent-workflow-protocol.md) |
