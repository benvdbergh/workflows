# Engine profile — authoritative reference engine scope

This note is the **authoritative subset** of the Agent Workflow Protocol RFCs that the reference engine schema bundle and `@agent-workflow/engine` **MUST** support. It includes core orchestration node types (`parallel`, `wait`, `set_state`) and related commands/events beyond the first runnable milestone. It does **not** replace the RFCs; where this document is silent, do **not** assume full RFC behavior.

**Normative sources (read in full for semantics):**

| Document | Sections this profile subsets |
|----------|---------------------------|
| [Workflow Definition Schema](rfc-03-workflow-definition-schema.md) | §3.1–§3.8 (representation, top-level shape, jq, state/reducers, nodes, edges, node types listed below, retry/timeout) |
| [Execution Model](rfc-04-execution-model.md) | §4.2–§4.6, §4.8 (phases, command/event subsets below, state updates and reducers, interrupt/resume) |

---

## 1. Workflow document surface (in scope)

Per [RFC-03 §3.2](rfc-03-workflow-definition-schema.md#32-top-level-document-structure), workflow documents in this profile **MUST** include:

- `document` (including `schema`, `name`, `version`; optional `description`)
- `state_schema` (JSON Schema for workflow state)
- `nodes` (non-empty array)
- `edges` (array; may be empty only if the graph is fully implied by a node type that carries its own routing — **not** the case for the profile node set below, so in practice edges are required for a valid runnable graph)

**Optional top-level fields:**

- `checkpointing` — **allowed** in documents; engines **MAY** implement persistence later (see §5). Validators **SHOULD** still accept the block if present.

**Out of scope (top-level):**

- `extensions` — **not** supported in this profile; documents that include `extensions` **SHOULD** be rejected by profile validation, or engines **MUST** reject unknown extension semantics.

---

## 2. Node `type` values (in scope)

These discriminators **MUST** be supported by the workflow schema bundle and honored by the first engine milestone (naming matches [RFC-03 §3.7](rfc-03-workflow-definition-schema.md#37-node-types-normative)):

| `type` | Profile notes |
|--------|-----------|
| `start` | At most one per document; entry binding per RFC. |
| `end` | Terminal; `output_schema` / `output_mapping` **MAY** be used if present. |
| `step` | Deterministic activity boundary; `config` **MUST** include an implementation reference (e.g. `handler` / `code_ref`) per RFC; exact registry is profile-specific. |
| `llm_call` | Non-deterministic model invocation; **MAY** be stubbed with a fixed transcript in early demos without changing document shape. |
| `tool_call` | External tool; **SHOULD** be MCP-shaped (`server`, `tool`, `arguments`) for portable fixtures. |
| `switch` | Conditional routing via `config.cases` (`when` jq expression, `target` node id) and optional `config.default`. |
| `interrupt` | Human-in-the-loop; `config` **MUST** include `resume_schema` and **MUST** include `prompt` or a resolvable reference per RFC; optional `timeout`. |
| `parallel` | Fork/join per RFC-03: `config.join` is `all` \| `any` \| `n_of_m` (with `n`), `config.branches` is `{ name, entry }[]` where `entry` is the first node id of a branch. Exactly **one** static edge leaves the parallel node to the **join target**; each branch must reach that target via its own linear chain (see golden `examples/r2-research-parallel.workflow.json`). |
| `wait` | `config.kind`: `duration` (requires `duration_ms` or parseable `duration` string), `until` (ISO-8601 `until` timestamp), or `signal` (**requires host**; unsupported in bare engine — fails at runtime). |
| `set_state` | `config.assignments`: map of state keys to `{ "jq": "<expr>" }` or `{ "literal": <value> }`; merged with `state_schema` reducers. |
| `subworkflow` | Nested workflow per RFC-03: `config.workflow_ref` (URI/registry id), required `config.input_mapping`; optional `version_pin`. Child runs use a distinct `executionId`; parent merges child `finalState` into parent state. Max nested depth default 4. |
| `agent_delegate` | Delegation per RFC-03: required `config.agent_id`, `config.protocol` (`a2a` \| `mcp` \| `sdk`), required `config.input_mapping`. Engine emits `ActivityRequested` / `ActivityCompleted` with `delegateCorrelationId` and `externalTaskId`. Reference engine includes in-process mock A2A (`submitted` → `working` → `completed`). |

Common node fields [RFC-03 §3.5](rfc-03-workflow-definition-schema.md#35-node-object-common-fields): `id`, `type`, optional `config`, `retry`, `timeout`, `metadata` — all **in scope** where applicable.

### 2.1 Node `type` values (explicitly out of scope for this profile)

Implementers **MUST NOT** infer support from the full RFC for node types not listed in §2.

Validators **MUST** reject unknown `type` values.

### 2.2 Delegation bridge migration (`tool_call` → native)

Prior milestones emulated delegation with `tool_call` to agent-shaped tools (for example `agent.execute` / `agent.status`). Native **`agent_delegate`** is now in profile (§2).

| Bridge (`tool_call`) | Native (`agent_delegate`) |
|----------------------|---------------------------|
| `config.server` + `config.tool` | `config.agent_id` + `config.protocol` |
| Tool arguments / host MCP payload | `config.input_mapping` (jq / literals, same shape as `subworkflow`) |
| Ad-hoc correlation in tool results | `delegateCorrelationId`, `externalTaskId` on `ActivityRequested` / `ActivityCompleted` |

Engines **SHOULD** preserve the same observable activity lifecycle when migrating definitions so replay prefixes remain valid after promotion.

---

## 3. Edges (in scope)

Per [RFC-03 §3.6](rfc-03-workflow-definition-schema.md#36-edges):

- Edges are directed: `{ "source": "<node_id_or___start__>", "target": "<node_id>" }`.
- Synthetic source `__start__` **MAY** be used for the unique entry edge to the `start` node’s successor (or as specified in golden fixtures).
- For `switch`, outgoing routing **MAY** be expressed only via `config.cases` / `default`; static `edges` from the `switch` node **MAY** coexist only if the engine documents precedence. **Profile recommendation:** prefer `cases` + `default` for switch successors; avoid duplicate routing channels until conformance tests lock precedence.

**Parallel:** The parallel node lists branch **entry** node ids; each branch follows static edges until it reaches the parallel node’s unique **join target** (the sole edge leaving the parallel node). Nested `parallel` and `switch` inside branches are allowed; **interrupt inside a parallel branch** is not resume-safe in this profile — avoid until correlation is modeled.

---

## 4. Expressions (`jq`) and state reducers (in scope)

### 4.1 jq

Per [RFC-03 §3.3](rfc-03-workflow-definition-schema.md#33-expression-language-jq):

- `switch` `when` expressions and any `end` `output_mapping` **MUST** be jq strings.
- The exact **jq conformance subset** and the **execution-state binding** (root object shape) **MUST** be documented by the engine and reflected in fixtures; workflow schema validation alone **MAY** be limited to syntactic presence.

### 4.2 Reducers

Per [RFC-03 §3.4](rfc-03-workflow-definition-schema.md#34-state-schema-and-reducers) and [RFC-04 §4.6](rfc-04-execution-model.md#46-state-updates-and-reducers), this profile **MUST** support these `state_schema` property annotations when merging node outputs into state:

| Reducer | In profile |
|---------|--------|
| `overwrite` | Yes (default behavior when omitted). |
| `append` | Yes. |
| `merge` | Yes. |
| `custom` | **No** — unsupported; documents **SHOULD** be rejected if `custom` appears. |

After reducer application, engines **SHOULD** validate state against `state_schema` when validation is enabled ([RFC-04 §4.6](rfc-04-execution-model.md#46-state-updates-and-reducers)).

---

## 5. Retry, timeout, checkpointing

- **Retry and timeout** on nodes follow [RFC-03 §3.8](rfc-03-workflow-definition-schema.md#38-retry-and-timeout); this profile **MUST** accept at least `retry.max_attempts` (≥ 1) and common duration forms the engine documents.
- **Checkpointing** ([RFC-03 §3.9](rfc-03-workflow-definition-schema.md#39-checkpointing-block), [RFC-04 §4.10](rfc-04-execution-model.md#410-checkpointing)) — the reference engine emits `CheckpointWritten` after selected node boundaries (switch completion, interrupt raised, parallel join, wait, `set_state`, and post-resume steps). The optional top-level `checkpointing` object **MAY** set execution policy:
  - `strategy` (or alias `policy`): `after_each_node` (default when omitted or when `checkpointing` is absent), `every_n_nodes` (requires integer `n` ≥ 1), or `disabled` (no checkpoints).
  - For `every_n_nodes`, checkpoint emission uses the same boundary points as `after_each_node`, but only every *n*th opportunity (deterministic ordering of boundaries as implemented by the engine).

---

## 6. Execution model subset (commands and events)

The full taxonomies are [RFC-04 §4.4](rfc-04-execution-model.md#44-command-taxonomy-normative) and [§4.5](rfc-04-execution-model.md#45-event-taxonomy-normative).

**Commands — in scope**

- `ScheduleNode`, `CompleteNode`, `FailNode`
- `RaiseInterrupt`, `ResumeInterrupt`
- `StartParallel`, `JoinParallel`, `CancelParallelBranch`, `StartTimer`
- `StartSubworkflow`, `CompleteSubworkflow`

**Commands — out of scope**

- `CancelTimer` (reserved; not emitted by current reference `wait` paths)
- `EmitSignal`

**Events — in scope (minimum observable history)**

- `ExecutionStarted`
- `NodeScheduled`
- `ActivityRequested`, `ActivityCompleted`, `ActivityFailed`
- `StateUpdated` (or equivalent embedding per engine profile, per [RFC-04 §4.6](rfc-04-execution-model.md#46-state-updates-and-reducers))
- `InterruptRaised`, `InterruptResumed`
- `ExecutionCompleted`, `ExecutionFailed`
- `ParallelForked`, `ParallelJoined`, `ParallelBranchCancelled`, `TimerStarted`, `TimerFired`
- `SubworkflowStarted`, `SubworkflowCompleted` (payloads include `childExecutionId`, `parentExecutionId`, `workflowRef`, `nodeId`)

**Events — optional / phased**

- `CheckpointWritten` — emitted when checkpointing is not `disabled`; payload `policy` is `after_each_node` or `every_n_nodes` (with `intervalNodes` when interval policy is used). Checkpoints taken **inside a parallel branch** (per-branch walk before the join target) include **`parallelSpan`**: `{ parallelNodeId, joinTargetId, branchName, branchEntryNodeId }` so readers can correlate inline `stateRef` with fork/join context ([RFC-04 §4.10](rfc-04-execution-model.md#410-checkpointing)).

Lifecycle phases [RFC-04 §4.2](rfc-04-execution-model.md#42-phases) **MUST** be respected at a high level: validate → start → walk graph → complete or fail; interrupt transitions per [§4.8](rfc-04-execution-model.md#48-interrupt-and-resume-protocol). Deterministic replay [§4.3](rfc-04-execution-model.md#43-deterministic-replay) is **normative for the protocol** but **MAY** land in a later milestone than the first runnable scheduler; this document still lists the command/event shapes the profile definition is intended to align with.

---

## 7. Alignment with lighthouse

The Lighthouse demo workflow (`examples/lighthouse-customer-routing.workflow.json`) is expected to exercise **`llm_call`**, **`switch`**, **`interrupt`**, and MCP-shaped **`tool_call`** within this profile. This note **does not** narrow away that vertical; timeline cuts **MUST** be explicit in a revised scope if they occur.

---

## 8. Change control

Updates to this file **SHOULD** be paired with schema bundle version bumps and fixture updates (track in the repository issue backlog).

**Machine-readable contract:** [schemas/workflow-definition.json](../schemas/workflow-definition.json) (see [schemas/README.md](../schemas/README.md)).

**Profile model (core vs optional):** [docs/releases/profile-model.md](releases/profile-model.md), [docs/releases/jq-conformance-subset.md](releases/jq-conformance-subset.md), [docs/releases/migration-alpha-to-ga.md](releases/migration-alpha-to-ga.md).
