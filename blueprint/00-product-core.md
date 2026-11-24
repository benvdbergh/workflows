---
id: "00"
title: Product Core
status: proposed
owner: Product owner
last_reviewed: 2026-11-24
---

# 00 · Product Core

> **Authority:** Product owner. **AI policy:** read-only after approval. Agents may *propose* changes in an issue or PR description; they never edit this file once approved.
> **Changes when:** the product's reason to exist changes. Rarely.
>
> **Draft note:** First migration draft (`status: proposed`). Sources: [README.md](../README.md) ("Why this exists", "What the protocol defines"), [docs/RFC/rfc-01-abstract-motivation.md](../docs/RFC/rfc-01-abstract-motivation.md), [docs/architecture/arc42/01-introduction-and-goals.md](../docs/architecture/arc42/01-introduction-and-goals.md), [docs/RFC/rfc-02-design-principles.md](../docs/RFC/rfc-02-design-principles.md). Sections marked *(inferred)* are synthesized for product-owner review.

This is the most stable document in the blueprint. Everything else is checked against it. If a feature cannot be traced back to something here, either the feature is out of scope or this document is incomplete. Both are worth a conversation.

## Vision

A vendor-neutral, declarative standard for stateful, multi-step AI agent workflow execution — with deterministic replay, durable checkpoints, human-in-the-loop interrupts, and MCP-compatible tool integration — so the same workflow can run across assistants, automation platforms, and embedded SDKs.

## Problem

Agentic platforms deliver strong model reasoning and tool use, but they lack a shared standard for what happens *after* a model chooses a multi-step plan: coordinating steps, branching, parallel execution, human review pauses, crash recovery, and cross-platform reuse. Production systems need durable checkpoint/resume, a clear determinism boundary between orchestration and activities, first-class retry/timeout policies, typed HITL resume, and portable definitions — capabilities that today are fragmented or locked to code-first, ecosystem-specific runtimes.

## Target users

| Persona | Context | Core need |
|---|---|---|
| Protocol authors / maintainers | Spec, schema, and conformance evolution in this repo | Single source of truth for semantics and conformance expectations |
| Engine integrators | MCP hosts, IDEs, automation tooling embedding `@agent-workflow/engine` | Stable integration boundary (application port, MCP/REST tools, error codes) and predictable replay |
| Operators / automation | Unattended or host-mediated runs of workflow definitions | Validate, start, status, resume, and submit activities with durable history |
| CI / QA | Release gates and regression | Deterministic validation and conformance vectors |

*(Personas mapped from arc42 §1.1 stakeholder goals; product labels inferred.)*

## Value proposition

Fills the orchestration-layer gap between atomic MCP tool calls and multi-agent (A2A) coordination: declarative workflow documents, an event-sourced execution model suitable for crash recovery, and integration surfaces (MCP stdio, REST/OpenAPI, SDK) that compose with MCP and A2A rather than replacing them. Unlike code-first graph runtimes, definitions are versionable, signable, and portable across engines that honor the profile.

## Product principles

Drawn from [RFC-02](../docs/RFC/rfc-02-design-principles.md) / README design principles:

1. **Vendor-neutral** — canonical JSON independent of any SDK or runtime; rules out proprietary-only definition formats.
2. **Declarative-first** — YAML/SDK authoring compiles to the same form; rules out semantics that exist only in code.
3. **Deterministic replay** — orchestration is pure; non-determinism stays in recorded activities; rules out unreproducible control flow.
4. **Checkpointable** — durable resume after failure without inconsistently re-running completed activities.
5. **MCP-compatible** — tool invocation aligns with MCP where possible; rules out reinventing the tool layer.
6. **Security first** — auth, secrets, and audit are in scope from v1; rules out "security later."
7. **Composability** — compose with MCP, A2A, and durable backends; rules out competing with those layers.
8. **Small surface** — bounded node set, jq expressions, clear command/event model; rules out unbounded extension dumps at the workflow root.

## Scope boundaries

**In scope:**

- Normative protocol (RFC family under `docs/RFC/`) and narrative whitepaper (cite only; not moved here)
- Authoritative engine profile + JSON Schema (`docs/engine-profile.md`, `schemas/`)
- Reference Node.js engine (`@agent-workflow/engine`): validation, graph orchestration, history store, MCP/REST adapters
- Client SDK (`@agent-workflow/sdk`), golden fixtures (`examples/`), conformance harness (`conformance/`)
- Developer architecture (arc42, ADRs), governance, security baselines, release packaging

**Explicitly out of scope:**

- Replacing MCP, A2A, or agent-skills layers — compose, don't compete *(seen: RFC-01, README)*
- Full RFC surface in every release — profile subsets semantics; silence ≠ full RFC behavior *(seen: engine-profile)*
- End-user docs migration into blueprint — `docs/user/**` and `website/**` remain the published operator/author surface *(decision for this migration)*
- UI product / interactive workflow designer — this is a protocol and reference-engine repo *(inferred)*
- Multi-tenant production control plane and worker pools — R5+ horizon *(seen: ROADMAP.md)*

## Success measures

| Outcome | Metric | Target |
|---|---|---|
| Stable v1 contract | Published `@agent-workflow/engine@1.0.0` + frozen profile/schema | Delivered (R4 GA) *(seen: ROADMAP.md, package.json)* |
| Adopter bar | Conformance harness green for tagged v1 profile | `npm run conformance:v1` in CI *(seen)* |
| Integration clarity | Two independent surfaces run the same canonical JSON | MCP + REST/SDK parity *(seen: arc42, ROADMAP)* |
| Replay fidelity | Deterministic reconstruction from history + definition | Schema + replay vectors under `conformance/vectors/` *(seen)* |
| Adoption DX *(inferred)* | Time to first successful execution | "<5 minutes" quickstart target from R4 scope *(seen in ROADMAP; not independently measured here)* |
