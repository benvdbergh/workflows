# 11. Risks and Technical Debt

| Risk | Impact | Mitigation / notes |
|------|--------|---------------------|
| **Conformance coverage gaps vs RFC-08** | Regression blind spots outside vectors | Extend vectors when changing semantics; tag vectors to RFC sections |
| **Engine-direct MCP trust expansion** | Operator misconfiguration may invoke unintended tooling | Mandatory manifest validation + operator docs; revisit before GA posture |
| **Public export surface breadth** | `index.mjs` re-exports many internals; accidental coupling risk | Publish **tier-1 API** subset in README; semver discipline |
| **`interrupt` placement edge cases inside `parallel`** | Resume safety constraints per profile | Document + test refusal paths for unsupported compositions |
| **Documentation drift** *(meta)* | Narrative contradicts walker code | Maintain arc42 + draw.io cross-links each release |
| **Engine-direct ergonomics mismatch** | Integrators omit manifest wiring | MCP stdio binary defaults **`in_process` stub executor** unless operators supply **`WORKFLOW_ENGINE_MCP_CONFIG` / `--mcp-config`** or inject a bespoke **`ActivityExecutor`**—easily mistaken for broken tool execution (**ADR-0003**) |
| **Security posture POC-level** | Local stdio MCP trust assumptions bleed into unattended automation | Elevate manifests + scopes before scaling engine-direct footprints (**ADR-0002**, **ADR-0003**) |
| **Delegate/subworkflow status not on `workflow_status`** | Operators read full history for correlation ids | [#8](https://github.com/benvdbergh/workflows/issues/8) |
| **Mock A2A only in R3 RC** | Production A2A interop not proven in CI | Real adapter + phase events in R4+ |

## Debt register snippets (engineering)

1. Observability primitives are POC-level (**stdout/err**)—insufficient alone for noisy production triage without host cooperation.
2. REST/SDK parity **deferred** (see `ROADMAP.md`).
3. Subpath exports **unset** (`package.json` only `"."`): intentional simplicity vs integrator ergonomics tension.
4. Conformance breadth vs **`docs/RFC/rfc-08-reference-implementation.md`** remains intentionally partial (**Section 3.5**) until milestone-driven expansion lands.

---

**Improvement candidate:** Migrate this table entries to tracked GitHub epics tied to conformance milestones when debt becomes actionable.
