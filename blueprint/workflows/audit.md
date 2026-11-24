# Audit: report where the blueprint and the code disagree

**Run:** weekly, as a scheduled agent task, or on demand.
**Changes:** nothing. This task is read-only.
**Ends with:** a health report as your final message (and as an issue, if the task asks for one).

## Goal

Give the team an honest picture of how well the blueprint matches the product today, so they can decide what to fix. `sync` handles recent changes one by one; the audit looks at the whole thing, including gaps that built up slowly. Find the few mismatches that matter most; don't list everything that could be better.

## Steps

1. Read `blueprint/README.md`, `00-product-core.md` and `07-roadmap.md` to know what the product is meant to be and do.
2. Compare, sampling the code with search rather than reading all of it:
   - **Features ↔ code.** For each feature spec that is `approved`, `in-progress` or `implemented`: does the behaviour exist? Are there significant screens, routes, endpoints or tables that no document or feature describes?
   - **UX (02) ↔ UI.** Routes in the router against the screen inventory; components or styles that bypass the design system.
   - **Architecture and data (03, 04) ↔ code.** Module boundaries, dependencies and accepted ADRs against the imports and packages actually used; migrations and schema against the domain model.
   - **Interfaces and deployment (05, 06) ↔ code and config.** Endpoints, integrations, environments and secrets by name.
   - **Tests ↔ acceptance criteria.** Criteria of `implemented` features that no test refers to by ID (`AC-nnn.n`).
   - **Housekeeping.** Documents with `last_reviewed` older than 90 days, deviations past their `review_by`, ADRs still `proposed`, the roadmap's status against feature status, IDs that are referenced but don't exist.
3. Rate each area: 🟢 matches · 🟡 drifting · 🔴 contradicts an approved requirement or is a security or data risk · ⚪ can't be assessed yet (say why).

## Report

```
# Blueprint health report · <date> · <short commit>

| Area | Status | Summary |
|---|---|---|
| Features ↔ code | 🟡 | … |
| … | | |

## Findings (most important first, at most 10)
1. **<title>** · <area> · 🔴/🟡
   Evidence: <file:line, document section>
   Action: fix code | update blueprint (run sync, or edit <doc>) | record deviation | decide (<who, from the authority column in blueprint/README.md>)
```

Every finding needs evidence and one action. If a fix is small and clear, include the proposed text. Keep the report under about 80 lines; if there is more, say how many minor findings you left out.

If you have a previous report (the last issue titled "Blueprint health report", when you can read issues), add one line on what improved and what got worse.
