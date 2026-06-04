# Threat-model regression checklist

Use this checklist when changing MCP adapter surfaces, engine-direct activity execution, or graph walker node execution. CI (`scripts/check-threat-model-touch.mjs`) requires this file to be updated in the same PR when those paths change.

**Last reviewed:** 2026-06-04 (BEN-11)

## Scope triggers

| Area | Paths |
|------|--------|
| MCP adapter | `packages/engine/src/adapters/mcp/` |
| Engine-direct executor | `packages/engine/src/orchestrator/mcp-stdio-activity-executor.mjs` |
| Walker / node execution | `packages/engine/src/orchestrator/workflow-graph-walker.mjs`, `workflow-node-execution.mjs` |
| Operator manifest policy | `docs/security/engine-direct-manifest-policy.md` |

## Checklist (mark in PR description or execution comment)

- [ ] **Trust boundary** — Host vs engine-direct vs in-process activity modes remain explicit; no silent default change to `host_mediated`.
- [ ] **Subprocess / MCP stdio** — Command allowlist, env injection, and manifest validation still enforced for engine-direct tools.
- [ ] **Transport limits** — Definition/input/resume payload size caps unchanged or documented if changed.
- [ ] **Definition binding** — `definitionHash` verification on resume, submit, and continuation unchanged or migration noted.
- [ ] **Secret handling** — History redaction and logging paths reviewed; no new secret fields in events without redaction.
- [ ] **Parallel / interrupt** — Branch correlation (`parallel_span`) and interrupt-in-parallel refusal behavior unchanged or conformance updated.
- [ ] **Error surface** — MCP adapter error codes remain stable or listed in release notes.
- [ ] **Conformance** — New or updated vectors under `conformance/vectors/` for behavior changes.

## N/A

If a PR only touches comments or formatting in a sensitive path, note **N/A** with rationale in the PR / Linear execution update.

## References

- `docs/security/alpha-security-baseline.md`
- `docs/security/engine-direct-manifest-policy.md`
- ADR-0002 host-mediated activity execution
- ADR-0003 engine-direct MCP activity execution
