---
id: "07"
title: Roadmap & Delivery
status: proposed
owner: Product management
last_reviewed: 2026-11-24
---

# 07 · Roadmap & Delivery

> **Authority:** Product management. **AI policy:** agents propose new features (`workflows/define-feature.md`) and delivery-status updates (`workflows/sync.md`). Priorities are never reordered by an agent without approval.
> **Drift audit:** `workflows/audit.md` compares the status here with feature spec status and the code.
>
> **Sources:** [ROADMAP.md](../ROADMAP.md), [docs/releases/alpha-release-notes.md](../docs/releases/alpha-release-notes.md), Linear [workflows project](https://linear.app/ben-van-den-bergh/project/workflows-a5eb475ff80e/overview). No `blueprint/features/` yet — release horizons below mirror ROADMAP; owner should confirm Now/Next/Later labels.

## Now

| Feature / theme | Milestone | Status | Notes |
|---|---|---|---|
| Post-GA adoption & runway carryovers | R4 complete → ops focus | implemented / monitoring | v1.0.0 delivered; keep contract stable |
| R5 planning readiness | R5 1.1 | proposed (backlog) | Linear BEN-6, BEN-7, BEN-9, BEN-12 — **Backlog**; owner prioritizes |

## Next

| Feature | Why next |
|---|---|
| R5 scale & operations (worker pools, throughput targets, alternate stores, tenancy/policy, observability, DR) | ROADMAP next planning focus after v1 freeze |
| Runway items (e.g. Linear BEN-118 class) | Carry to post-GA without destabilizing v1 |

*(Owner should reorder; agents must not.)*

## Later

| Feature / idea | Notes |
|---|---|
| Standards alignment (e.g. CNCF Serverless Workflow mapping) | Future prospects in ROADMAP |
| Foundation / neutral governance home | After sustained multi-platform adoption |
| Policy-as-code / extension registry | Without fragmenting core semantics |
| Geo-distributed control plane topologies | After single-region operational maturity |

## Milestones

| Milestone | Goal | Target date | Status |
|---|---|---|---|
| POC alpha | RFC subset, reference engine, MCP stdio, lighthouse | — | done |
| R2 Beta | Full core orchestration (`parallel`, `wait`, `set_state`) | 2026-05 (v0.1.1) | done |
| R3 RC | Delegation & composition; REST/SDK; A2A | through v1.0.0 line | done |
| R4 GA 1.0 | Protocol/runtime freeze, security v1, conformance bar | 2026-06-24 (v1.0.0) | done |
| R5 1.1 | Scale and operations | TBD | planned (Linear 0%) |

## Delivery log

High-signal recent delivery from git history / ROADMAP (not a full changelog — see [docs/releases/alpha-release-notes.md](../docs/releases/alpha-release-notes.md)):

| Date | Feature | PR | Note |
|---|---|---|---|
| 2026-06-24 | R4 GA 1.0 / v1.0.0 | #101 / release | Contract freeze, security, conformance |
| 2026-06 | GA release gate E2E + v1 conformance tag | #100 | BEN-89 tree |
| 2026-06 | Composition validation / subworkflow registry | #99 | BEN-88 |
| 2026-06 | Node retry/timeout enforcement | #98 | BEN-87 |
| 2026-06 | Security v1 (secret_ref, signing, MCP auth) | #97 | BEN-86 |
| 2026-06 | Control plane signal/cancel/list | #96 | BEN-85 |
| 2026-06 | REST/SDK interop | #95 area / #93 | BEN-84 |
