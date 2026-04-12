# POC scope — first engine milestone

This note is the **authoritative subset** of the Agent Workflow Protocol RFCs that the POC execution contract (schema bundle, fixtures, first engine milestone) **MUST** support. It does **not** replace the RFCs; where this document is silent, do **not** assume full RFC behavior.

**Normative sources (read in full for semantics):**

| Document | Sections this POC subsets |
|----------|---------------------------|
| [Workflow Definition Schema](rfc-03-workflow-definition-schema.md) | §3.1–§3.8 (representation, top-level shape, jq, state/reducers, nodes, edges, node types listed below, retry/timeout) |
| [Execution Model](rfc-04-execution-model.md) | §4.2–§4.6, §4.8 (phases, command/event subsets below, state updates and reducers, interrupt/resume) |

---

## 1. Workflow document surface (in scope)

Per [RFC-03 §3.2](rfc-03-workflow-definition-schema.md#32-top-level-document-structure), POC documents **MUST** include:

- `document` (including `schema`, `name`, `version`; optional `description`)
- `state_schema` (JSON Schema for workflow state)
- `nodes` (non-empty array)
- `edges` (array; may be empty only if the graph is fully implied by a node type that carries its own routing — **not** the case for the POC node set below, so in practice edges are required for a valid runnable graph)

**Optional top-level fields for POC:**

- `checkpointing` — **allowed** in documents; engines **MAY** implement persistence later (see §5). Validators **SHOULD** still accept the block if present.

**Out of scope (top-level):**

- `extensions` — **not** supported in POC; documents that include `extensions` **SHOULD** be rejected by POC validation, or engines **MUST** reject unknown extension semantics.

---

## 2. Node `type` values (in scope)

These discriminators **MUST** be supported by the POC schema bundle and honored by the first engine milestone (naming matches [RFC-03 §3.7](rfc-03-workflow-definition-schema.md#37-node-types-normative)):

| `type` | POC notes |
|--------|-----------|
| `start` | At most one per document; entry binding per RFC. |
| `end` | Terminal; `output_schema` / `output_mapping` **MAY** be used if present. |
| `step` | Deterministic activity boundary; `config` **MUST** include an implementation reference (e.g. `handler` / `code_ref`) per RFC; exact registry is profile-specific. |
| `llm_call` | Non-deterministic model invocation; **MAY** be stubbed with a fixed transcript in early demos without changing document shape. |
| `tool_call` | External tool; **SHOULD** be MCP-shaped (`server`, `tool`, `arguments`) for portable POC fixtures. |
| `switch` | Conditional routing via `config.cases` (`when` jq expression, `target` node id) and optional `config.default`. |
| `interrupt` | Human-in-the-loop; `config` **MUST** include `resume_schema` and **MUST** include `prompt` or a resolvable reference per RFC; optional `timeout`. |

Common node fields [RFC-03 §3.5](rfc-03-workflow-definition-schema.md#35-node-object-common-fields): `id`, `type`, optional `config`, `retry`, `timeout`, `metadata` — all **in scope** where applicable.

### 2.1 Node `type` values (explicitly out of scope for POC)

Implementers **MUST NOT** infer support from the full RFC for:

- `parallel`
- `agent_delegate`
- `subworkflow`
- `wait`
- `set_state`

POC validators **MUST** reject unknown `type` values (including the above until promoted into a future scope revision).

---

## 3. Edges (in scope)

Per [RFC-03 §3.6](rfc-03-workflow-definition-schema.md#36-edges):

- Edges are directed: `{ "source": "<node_id_or___start__>", "target": "<node_id>" }`.
- Synthetic source `__start__` **MAY** be used for the unique entry edge to the `start` node’s successor (or as specified in golden fixtures).
- For `switch`, outgoing routing **MAY** be expressed only via `config.cases` / `default`; static `edges` from the `switch` node **MAY** coexist only if the engine documents precedence. **POC recommendation:** prefer `cases` + `default` for switch successors; avoid duplicate routing channels until conformance tests lock precedence.

**Out of scope:**

- Graph patterns that require `parallel` join semantics or nested subgraph wiring per `parallel` (deferred with the `parallel` type).

---

## 4. Expressions (`jq`) and state reducers (in scope)

### 4.1 jq

Per [RFC-03 §3.3](rfc-03-workflow-definition-schema.md#33-expression-language-jq):

- `switch` `when` expressions and any `end` `output_mapping` **MUST** be jq strings.
- The exact **jq conformance subset** and the **execution-state binding** (root object shape) **MUST** be documented by the engine and reflected in fixtures; POC schema validation alone **MAY** be limited to syntactic presence.

### 4.2 Reducers

Per [RFC-03 §3.4](rfc-03-workflow-definition-schema.md#34-state-schema-and-reducers) and [RFC-04 §4.6](rfc-04-execution-model.md#46-state-updates-and-reducers), POC **MUST** support these `state_schema` property annotations when merging node outputs into state:

| Reducer | In POC |
|---------|--------|
| `overwrite` | Yes (default behavior when omitted). |
| `append` | Yes. |
| `merge` | Yes. |
| `custom` | **No** — unsupported; documents **SHOULD** be rejected if `custom` appears. |

After reducer application, engines **SHOULD** validate state against `state_schema` when validation is enabled ([RFC-04 §4.6](rfc-04-execution-model.md#46-state-updates-and-reducers)).

---

## 5. Retry, timeout, checkpointing

- **Retry and timeout** on nodes follow [RFC-03 §3.8](rfc-03-workflow-definition-schema.md#38-retry-and-timeout); POC **MUST** accept at least `retry.max_attempts` (≥ 1) and common duration forms the engine documents.
- **Checkpointing** ([RFC-03 §3.9](rfc-03-workflow-definition-schema.md#39-checkpointing-block), [RFC-04 §4.10](rfc-04-execution-model.md#410-checkpointing)) — optional for the earliest runnable milestone; when not implemented, engines **MUST** document that limitation while still accepting definitions that include `checkpointing` if listed as allowed above.

---

## 6. Execution model subset (commands and events)

The full taxonomies are [RFC-04 §4.4](rfc-04-execution-model.md#44-command-taxonomy-normative) and [§4.5](rfc-04-execution-model.md#45-event-taxonomy-normative). For the **POC graph subset** (no `parallel`, `subworkflow`, `wait`):

**Commands — in scope**

- `ScheduleNode`, `CompleteNode`, `FailNode`
- `RaiseInterrupt`, `ResumeInterrupt`

**Commands — out of scope (deferred with node types above)**

- `StartParallel`, `JoinParallel`
- `StartTimer`, `CancelTimer`
- `StartSubworkflow`, `CompleteSubworkflow`
- `EmitSignal`

**Events — in scope (minimum observable history)**

- `ExecutionStarted`
- `NodeScheduled`
- `ActivityRequested`, `ActivityCompleted`, `ActivityFailed`
- `StateUpdated` (or equivalent embedding per engine profile, per [RFC-04 §4.6](rfc-04-execution-model.md#46-state-updates-and-reducers))
- `InterruptRaised`, `InterruptResumed`
- `ExecutionCompleted`, `ExecutionFailed`

**Events — optional / phased**

- `CheckpointWritten` — required once checkpointing is claimed as supported ([RFC-04 §4.10](rfc-04-execution-model.md#410-checkpointing)).

**Out of scope (deferred)**

- `SubworkflowStarted`, `SubworkflowCompleted`

Lifecycle phases [RFC-04 §4.2](rfc-04-execution-model.md#42-phases) **MUST** be respected at a high level: validate → start → walk graph → complete or fail; interrupt transitions per [§4.8](rfc-04-execution-model.md#48-interrupt-and-resume-protocol). Deterministic replay [§4.3](rfc-04-execution-model.md#43-deterministic-replay) is **normative for the protocol** but **MAY** land in a later milestone than the first runnable scheduler; this document still lists the command/event shapes the POC definition is intended to align with.

---

## 7. Alignment with lighthouse (Epic 6)

The [Lighthouse demo workflow](epics/Epic-6-Lighthouse-demo-workflow.md) is expected to exercise **`llm_call`**, **`switch`**, **`interrupt`**, and MCP-shaped **`tool_call`** within this POC scope. This note **does not** narrow away that vertical; timeline cuts **MUST** be explicit in a revised scope if they occur.

---

## 8. Change control

Updates to this file **SHOULD** be paired with schema bundle version bumps and fixture updates ([STORY-1-2](stories/Story-1-2-Publish-POC-JSON-Schema-bundle-under-schemas.md) and following stories).
