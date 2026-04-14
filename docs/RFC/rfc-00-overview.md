# Agent Workflow Protocol — RFC (draft)

**File:** `docs/rfc-00-overview.md` — canonical entry point for this specification set.  
**Status:** Working draft · series name and schema URI **TBD** (see [Governance and Adoption](rfc-09-governance-adoption.md))  
**Canonical entry:** this file — use it as the **single link** into the specification; sections below are the normative and informative body.

---

## Relationship to the founding brief

The landscape analysis, gap framing, adoption playbook, and the **original nine-section outline** live in **[`analysis-brief.md`](analysis-brief.md)**. This RFC set **implements** that outline as sharded Markdown: same scope (declarative workflow protocol, execution model, MCP/REST/SDK surfaces, security, reference implementation, governance), with **`analysis-brief.md`** kept as **supporting context** (market narrative, quantitative claims to verify separately).

---

## Executive summary

This specification defines a **vendor-neutral workflow protocol** for AI agent systems: a **canonical workflow definition** (JSON, with YAML and SDK authoring paths), an **event-sourced execution model** with **deterministic replay** and **checkpoints**, **eleven conceptual node kinds** (twelve `type` discriminators) including LLM, tools, parallelism, interrupts, and agent delegation, plus **integration interfaces** (MCP, REST/OpenAPI, Python and TypeScript SDKs). It is positioned **between** atomic tool connectivity (e.g. MCP) and agent-to-agent coordination (e.g. A2A), as described in [Abstract and Motivation](rfc-01-abstract-motivation.md).

---

## Specification sections

Read in order for a full pass; deep links jump to detail.

| § | Document | Focus |
|---|----------|--------|
| 1 | [Abstract and Motivation](rfc-01-abstract-motivation.md) | Problem, standards stack, opportunity, roadmap |
| 2 | [Design Principles](rfc-02-design-principles.md) | P1–P8 non-negotiables; traceability to later sections |
| 3 | [Workflow Definition Schema](rfc-03-workflow-definition-schema.md) | Canonical document, jq, reducers, node types, edges, retries, examples |
| 4 | [Execution Model](rfc-04-execution-model.md) | Commands, events, replay, parallelism, interrupts, sub-workflows, checkpoints |
| 5 | [Integration Interfaces](rfc-05-integration-interfaces.md) | Core + adapters, MCP, REST, SDKs, wire protocol |
| 6 | [Interoperability](rfc-06-interoperability.md) | MCP, A2A, platforms, LangGraph import, backends |
| 7 | [Security Model](rfc-07-security-model.md) | AuthZ, secrets, audit, LLM risks, transport |
| 8 | [Reference Implementation Plan](rfc-08-reference-implementation.md) | MVP engine, conformance tests, examples |
| 9 | [Governance and Adoption](rfc-09-governance-adoption.md) | License, maintainers, foundation path, adoption bar |

---

## Diagrams

Several sections include **Mermaid** figures (stack, architecture, replay, interrupt flow, etc.). Open the linked files in a Mermaid-capable viewer (e.g. GitHub or VS Code preview).

---

## Quick links (all section files)

- [rfc-01-abstract-motivation.md](rfc-01-abstract-motivation.md)  
- [rfc-02-design-principles.md](rfc-02-design-principles.md)  
- [rfc-03-workflow-definition-schema.md](rfc-03-workflow-definition-schema.md)  
- [rfc-04-execution-model.md](rfc-04-execution-model.md)  
- [rfc-05-integration-interfaces.md](rfc-05-integration-interfaces.md)  
- [rfc-06-interoperability.md](rfc-06-interoperability.md)  
- [rfc-07-security-model.md](rfc-07-security-model.md)  
- [rfc-08-reference-implementation.md](rfc-08-reference-implementation.md)  
- [rfc-09-governance-adoption.md](rfc-09-governance-adoption.md)  
- [analysis-brief.md](analysis-brief.md) — founding analysis and RFC outline source  
