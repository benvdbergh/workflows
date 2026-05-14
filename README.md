# Agent Workflow Protocol

> **Status: Working draft** — protocol name, schema URIs, and governance home are TBD. Breaking changes may occur in any pre-1.0 revision.
>
> **Alpha evaluation focus:** this repository now packages a practical alpha narrative for external evaluators. Start with the quickstart and release notes, then dive into architecture and conformance details.

**Last reviewed:** 2026-05-04  
**Review cadence:** every 30 days while alpha scope is evolving

A vendor-neutral, declarative standard for **stateful, multi-step AI agent workflow execution** with deterministic replay, durable checkpoints, human-in-the-loop interrupts, and MCP-compatible tool integration.

## Alpha quickstart and docs map

Use README for onboarding, and `docs/` for deeper architecture and operations content.

- Quickstart validation commands: [POC schema and validation](#poc-schema-and-validation)
- Alpha release notes (highlights, caveats, known limitations): [docs/releases/alpha-release-notes.md](docs/releases/alpha-release-notes.md)
- No-install MCP quickstart and publish/operator runbook: [docs/releases/alpha-release-notes.md#no-install-mcp-quickstart-npx](docs/releases/alpha-release-notes.md#no-install-mcp-quickstart-npx)
- MCP host wiring: **operator setup** (default) runs the published engine via `npx`; **development setup** points the host at `packages/engine/src/mcp-stdio-server.mjs` in a clone — [walkthrough](docs/architecture/lighthouse-mcp-host-guided-demo-walkthrough.md), [smoke runbook](docs/architecture/mcp-stdio-host-smoke.md)
- Alpha versioning and final release commit flow: [docs/releases/alpha-versioning-and-release-commit-flow.md](docs/releases/alpha-versioning-and-release-commit-flow.md)
- Alpha CI/CD packaging governance (workflow map, checks, permissions): [docs/releases/alpha-ci-cd-packaging-governance.md](docs/releases/alpha-ci-cd-packaging-governance.md)
- Community launch playbook (channels, templates, triage SLAs): [docs/community-launch-playbook.md](docs/community-launch-playbook.md)
- Security policy and disclosure process: [SECURITY.md](SECURITY.md)
- Alpha security baseline posture and gap register: [docs/security/alpha-security-baseline.md](docs/security/alpha-security-baseline.md)
- Documentation index (information architecture): [docs/README.md](docs/README.md)
- Guided architecture walkthrough: [docs/architecture/lighthouse-mcp-host-guided-demo-walkthrough.md](docs/architecture/lighthouse-mcp-host-guided-demo-walkthrough.md)
- Conformance harness guide: [conformance/README.md](conformance/README.md)
- Contributor guide and intake policy: [CONTRIBUTING.md](CONTRIBUTING.md)
- Support boundaries and channels: [SUPPORT.md](SUPPORT.md)

---

## Contribute and feedback routing (alpha)

To keep alpha feedback actionable and sustainable, use this intake path:

- Changes and proposals: open an issue following `CONTRIBUTING.md`.
- Usage questions and help requests: use `SUPPORT.md` channels.
- Security vulnerabilities: report privately via `SECURITY.md` (do not open a public issue).

The triage loop, expected response windows, and escalation path for critical findings are documented in [docs/community-launch-playbook.md](docs/community-launch-playbook.md).

---

## Why this exists

Agentic platforms deliver strong model reasoning and tool use, but they lack a shared standard for what happens *after* a model chooses a multi-step plan: coordinating steps, branching, parallel execution, human review pauses, crash recovery, and cross-platform reuse.

The emerging agent stack has a gap at the orchestration layer:

| Layer | Role | Examples |
|-------|------|----------|
| Knowledge / behavior | Skills, agent instructions | Agent Skills, AGENTS.md |
| Agent-to-agent | Delegation, tasks | A2A |
| **Workflow orchestration** | **Stateful plans — this protocol** | **(gap)** |
| Tool connectivity | Atomic capabilities | MCP |
| Infrastructure | Discovery, identity, observability | AGNTCY |

This protocol fills that gap — sitting **between** atomic MCP tool calls and multi-agent coordination — while composing both rather than replacing them.

---

## What the protocol defines

- **Declarative workflow definition** — canonical JSON (YAML authoring supported), versioned, signable, portable across engines
- **Event-sourced execution model** — append-only history of Commands and Events enabling deterministic replay after process failure
- **Eleven node types** — `start`, `end`, `step`, `llm_call`, `tool_call`, `switch`, `parallel`, `interrupt`, `agent_delegate`, `subworkflow`, `wait`, `set_state`
- **State reducers** — `overwrite`, `append`, `merge` policies applied when node outputs merge into workflow state
- **Retry and timeout policies** as first-class data on any node
- **Integration interfaces** — MCP stdio adapter, REST/OpenAPI, Python and TypeScript SDKs compiling to the same canonical JSON
- **Security model** — authentication, authorization, secret handling, and audit logging as first-class concerns

---

## Quick example

```yaml
document:
  schema: "https://example.org/agent-workflow/v1"
  name: "customer-support"
  version: "1.0.0"

state_schema:
  type: object
  properties:
    intent:     { type: string }
    confidence: { type: number }

nodes:
  - id: classify
    type: llm_call
    config:
      model: "claude-sonnet-4-20250514"
      system_prompt: "Classify the user intent"
      output_schema:
        type: object
        properties:
          intent:     { type: string }
          confidence: { type: number }
    retry:   { max_attempts: 3, backoff_coefficient: 2 }
    timeout: "30s"

  - id: route
    type: switch
    config:
      cases:
        - when: '.intent == "billing" and .confidence > 0.8'
          target: billing_handler
        - when: '.intent == "technical"'
          target: tech_handler
      default: human_review

  - id: human_review
    type: interrupt
    config:
      prompt: "Agent is unsure — please review and classify."
      timeout: "24h"
      resume_schema:
        type: object
        properties:
          intent: { type: string }

  - id: billing_handler
    type: tool_call
    config: { tool: "create_ticket", server: "support-mcp" }

  - id: tech_handler
    type: tool_call
    config: { tool: "search_kb", server: "support-mcp" }

edges:
  - { source: __start__, target: classify }
  - { source: classify,  target: route }
```

Workflow definitions must be normalized to canonical JSON before validation or execution. YAML is a supported authoring form.

---

## Repository layout

```
docs/RFC/          # Full protocol specification (9 sections)
docs/poc-scope.md  # POC subset — what the first engine milestone must support
schemas/           # JSON Schema Draft 2020-12 bundle for the POC subset
examples/          # Golden fixtures: workflow + RFC-04 trace companions
conformance/       # Conformance harness vectors + deterministic runner entrypoint
packages/engine/   # POC Node.js engine — validation, history store, orchestration (see package README)
scripts/           # validate-workflows.mjs (AJV, CI-aligned)
.github/workflows/ # CI: validate-workflows
```

---

## Specification

| § | Document | Summary |
|---|----------|---------|
| 0 | [Overview](docs/RFC/rfc-00-overview.md) | Entry point and executive summary |
| 1 | [Abstract and Motivation](docs/RFC/rfc-01-abstract-motivation.md) | Problem statement, standards stack, opportunity |
| 2 | [Design Principles](docs/RFC/rfc-02-design-principles.md) | Eight non-negotiable principles |
| 3 | [Workflow Definition Schema](docs/RFC/rfc-03-workflow-definition-schema.md) | Document format, node types, edges, reducers, retry |
| 4 | [Execution Model](docs/RFC/rfc-04-execution-model.md) | Commands, events, replay, parallelism, interrupts, checkpoints |
| 5 | [Integration Interfaces](docs/RFC/rfc-05-integration-interfaces.md) | MCP, REST, Python/TypeScript SDKs, wire protocol |
| 6 | [Interoperability](docs/RFC/rfc-06-interoperability.md) | MCP, A2A, LangGraph import, pluggable backends |
| 7 | [Security Model](docs/RFC/rfc-07-security-model.md) | AuthZ, secrets, audit logging, LLM risk surface |
| 8 | [Reference Implementation Plan](docs/RFC/rfc-08-reference-implementation.md) | MVP engine (Rust/Go), SQLite checkpoints, conformance suite |
| 9 | [Governance and Adoption](docs/RFC/rfc-09-governance-adoption.md) | License (Apache-2.0), versioning, foundation path |

---

## POC schema and validation

The [`schemas/`](schemas/) directory contains the **workflow JSON Schema bundle** (Draft 2020-12) for the profile in [`docs/poc-scope.md`](docs/poc-scope.md) (POC nodes plus R2 `parallel`, `wait`, and `set_state`). `agent_delegate` and `subworkflow` remain out of scope until R3.

Validate all golden fixtures locally (Node.js 20+). **CI** uses Node.js **24** with `actions/checkout@v5` and `actions/setup-node@v5` per [GitHub’s Node 20 deprecation on runners](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/).

```bash
npm ci
npm run validate-workflows
npm run conformance
```

Before opening a PR, run the same conformance command used by CI from the repository root:

```bash
npm run conformance
```

This validates every `*.workflow.json` under `examples/`, the minimal schema smoke instance, and asserts that a deliberately invalid fixture (containing the out-of-scope `extensions` field) is correctly rejected.

The [`examples/`](examples/) directory contains the canonical lighthouse fixture and RFC-04 trace companions (happy path and failure/retry) used as golden test vectors.

---

## Design principles

1. **Vendor-neutral** — canonical JSON independent of any SDK or runtime
2. **Declarative-first** — YAML/SDK authoring compiles to the same canonical form; no semantics unavailable declaratively
3. **Deterministic replay** — orchestration logic is pure; non-determinism is confined to recorded activities
4. **Checkpointable** — durable resume after process failure without re-executing completed activities
5. **MCP-compatible** — `tool_call` nodes align with MCP semantics for portable cross-platform execution
6. **Security first** — auth, secrets, and audit are in scope from version one
7. **Composability** — composes with MCP, A2A, and existing durable workflow backends rather than replacing them
8. **Small surface** — bounded node set, single expression language (jq), clear command/event model

---

## Reference implementation

**In this repository (POC + R2 core, Node.js):** [`packages/engine/`](packages/engine/README.md) (`@agent-workflow/engine`) implements definition validation for the profile in [`docs/poc-scope.md`](docs/poc-scope.md), an append-only command/event history (`SqliteExecutionHistoryStore` via `node:sqlite` or in-memory), orchestration including `parallel` / `wait` / `set_state`, `switch`, `interrupt` / resume, host-mediated and engine-direct `tool_call` activity paths, checkpoint policies, and the MCP stdio adapter. The [`conformance/`](conformance/) harness exercises schema and replay vectors in CI. Requires Node.js **≥ 22.5.0** (see root `package.json` `engines`).

**Longer term (RFC-08):** [RFC-08](docs/RFC/rfc-08-reference-implementation.md) still describes a production-style MVP: **core binary** (Rust or Go), **Python SDK**, and **REST/SDK surfaces** at parity with the reference adapter set. `agent_delegate` and `subworkflow` are planned for R3; see [`ROADMAP.md`](ROADMAP.md).

---

## License

Apache-2.0 (per [RFC-09 §9.1](docs/RFC/rfc-09-governance-adoption.md#91-license)).
