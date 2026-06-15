# Examples catalog

Golden workflow fixtures live in the [examples/](https://github.com/benvdbergh/workflows/tree/main/examples) directory. Trace companions (`*.trace.*.json`) are informative RFC-04 narratives — **not** schema-validated workflow inputs.

## Core demos

### Lighthouse customer routing

**File:** `lighthouse-customer-routing.workflow.json`

Canonical demo: `llm_call` → `switch` → `tool_call` / `interrupt`.

| Route | Condition |
|-------|-----------|
| `open_ticket` | `intent == "billing"` and `confidence > 0.8` |
| `search_kb` | `intent == "technical"` |
| `human_review` | default (interrupt) |

**Traces:** `lighthouse-customer-routing.trace.happy.json`, `lighthouse-customer-routing.trace.failure-and-retry.json`

### Agentic task intake

**File:** `agentic-task-intake-prompt-improver.workflow.json`

Routes by `execution_mode`:

- `"workflow"` → `workflow.publish_draft`
- Other modes → open-agentic dispatch bridge

### Minimal linear

**File:** `fixtures.valid/minimal-linear.workflow.json`

Smallest valid graph for schema smoke tests.

## Parallel execution (R2)

| File | Scenario |
|------|----------|
| `r2-research-parallel.workflow.json` | Parallel research branches, join `all` |
| `r2-parallel-join-any.workflow.json` | Join when any branch completes |
| `r2-parallel-join-n2-of-3.workflow.json` | `n_of_m` join policy |

## Delegation and composition (R3)

| File | Scenario |
|------|----------|
| `r3-multi-agent-coding.workflow.json` | Multi-agent coding with delegate nodes |
| `r3-unit-tests-child.workflow.json` | Child workflow for subworkflow demos |

## Conformance fixtures

| File | Exercises |
|------|-----------|
| `conformance-agent-delegate-linear.workflow.json` | `agent_delegate` linear path |
| `conformance-subworkflow-parent.workflow.json` | Parent/child subworkflow |
| `conformance-host-activity-linear.workflow.json` | Host-mediated activity submit |
| `conformance-host-activity-parallel.workflow.json` | Parallel host activities |

## Invalid fixtures (must fail validation)

Under `fixtures.invalid/`:

| File | Teaches |
|------|---------|
| `extensions.workflow.json` | Top-level `extensions` rejected |
| `unsupported-node-type.workflow.json` | Unknown `type` rejected |
| `interrupt-in-parallel-branch.workflow.json` | Interrupt-in-parallel refused |
| `agent-delegate-invalid-protocol.workflow.json` | Invalid delegate protocol |

## Validate and run

```bash
npm run validate-workflows
npm run engine:validate -- examples/lighthouse-customer-routing.workflow.json
npm run conformance
```

MCP walkthrough: [Getting started](getting-started.md#4-run-the-lighthouse-fixture-via-mcp).
