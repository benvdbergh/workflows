# Merge and QA checklist (post–Wave 4)

Use after `docs/rfc-00-overview.md` and `docs/rfc-01-abstract-motivation.md` … `docs/rfc-09-governance-adoption.md` exist. Master agent ticks items when satisfied.

## Cross-references

- [x] Every RFC file links to related sections with **working** relative Markdown links. *(Verified: all `](rfc-*.md)` and `](analysis-brief.md)` targets resolve under `docs/`.)*  
- [x] No broken `rfc-NN-*.md` filenames; overview lives in **`rfc-00-overview.md`**.  
- [x] `document.schema` placeholder URI consistent across examples (or explicitly “TBD”). *(`https://example.org/agent-workflow/v1` in §3 prose + three YAML examples; final URI TBD per governance.)*

## Terminology (`temp/handoff-glossary.md`)

- [x] Node `type` discriminators match §3 list (twelve values; eleven conceptual kinds per founding brief).  
- [x] Command/Event names consistent between §4 and §5 (streaming payloads). *(§5.3 streaming: “SHOULD mirror the Event taxonomy” in [Execution Model](../docs/rfc-04-execution-model.md).)*  
- [x] “Activity” vs “node” usage consistent. *(Activities are non-deterministic units; nodes are graph elements — aligned in §4 and glossary.)*

## Traceability from principles

- [x] Each **P*** in [rfc-02](../docs/rfc-02-design-principles.md) has a home in §3–§7 (matrix in §2 is accurate).

## Normative vs informative

- [x] Examples marked informative where appropriate. *(§3 diagrams/examples labeled informative; Mermaid figures labeled in overview.)*  
- [x] OpenAPI / MCP tool names flagged if illustrative vs final registry. *(§5.2: “names illustrative — governance registers final names”.)*

## Security

- [x] §7 covers auth, secrets, audit, injection — aligned with §5 MCP/REST surfaces. *(§5.2 references §7; §7 covers transport + MCP considerations.)*

## Open gaps (intentional)

- [x] JSON Schema bundle URL noted as governance deliverable, not missing by accident. *(§3.10: “Governance SHALL publish…”.)*  
- [x] `step` handler registry marked TBD/profile. *(§3 `step` node.)*

## Optional follow-ups

- [ ] Add `docs/rfc-appendix-sources.md` with citations.  
- [x] Inline **Mermaid** diagrams added across RFC sections (GitHub / VS Code preview). Optional: mirror as `.drawio` under `docs/diagrams/` via draw.io extension.

---

## Validation run log

| Check | Date | Result |
|-------|------|--------|
| Path alignment: `brief.md` → `analysis-brief.md`, `rfc.md` → `rfc-00-overview.md` | 2026-04-12 | **Pass** — repo-wide grep; all section headers + `temp/` handoffs + overview quick links updated. |
| `temp/rfc-authoring-plan.md` §2 output table | 2026-04-12 | **Pass** — row **0** = `docs/rfc-00-overview.md`; canonical narrative = `docs/analysis-brief.md`. |
| Internal doc link targets | 2026-04-12 | **Pass** — 11 files in `docs/`; no stale `brief.md` / `rfc.md` links remain. |
| Done criteria §5 in authoring plan | 2026-04-12 | **Pass** — S3/S4/S5 content present per plan. |

**Status:** Merge checklist satisfied for repository consistency and cross-links. Optional appendix sources still open. Final editorial review by humans remains useful before external publication.
