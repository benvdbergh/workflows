# Hand-off: glossary and normative conventions

**Consumers:** all section authors. **Authority for narrative:** `docs/analysis-brief.md`.

## Document metadata

- **Working name:** Agent Workflow Protocol (AWP) — placeholder until governance adopts a final name (e.g. AgentFlow).  
- **Schema identifier:** `agentflow/v1` (example in brief; normative URI TBD in governance).  
- **Expression language:** jq (MUST be implementable via a conformant jq subset or full jq as profile — see RFC §3).

## Node types (align with founding brief)

The brief names **eleven** conceptual kinds; the schema uses **twelve** `type` discriminators by splitting entry and terminal:

`start`, `end`, `step`, `llm_call`, `tool_call`, `switch`, `parallel`, `interrupt`, `agent_delegate`, `subworkflow`, `wait`, `set_state`

Synthetic graph anchors such as `__start__` (see §3) are not node type values; they are reserved edge endpoints.

## Core terms

| Term | Definition |
|------|------------|
| **Workflow definition** | Declarative description of graph, state schema, nodes, edges, policies — canonical form JSON, authoring YAML. |
| **Execution** | A single run of a workflow definition, identified by an execution id. |
| **Engine** | Component that walks the graph, applies policies, emits Commands, records Events, manages checkpoints. |
| **Command** | Intent emitted by deterministic orchestration code during replay (e.g. execute node, start timer). |
| **Event** | Immutable record appended to execution history; result of processing a Command or external completion. |
| **Activity** | Non-deterministic unit (LLM, tool, external I/O); inputs/outputs recorded for replay. |
| **Checkpoint** | Durable snapshot of execution position + state (+ optional history pointer). |
| **Interrupt** | Engine-mediated pause for human or external input; resume via defined schema. |
| **Reducer** | Rule for merging updates into a state field: overwrite, append, merge, or custom. |

## Normative language

- **MUST** / **MUST NOT**: absolute interoperability or safety requirements.  
- **SHOULD** / **SHOULD NOT**: strong recommendation; deviation needs justification.  
- **MAY**: optional feature.

## Cross-stack positioning (do not contradict)

- **MCP:** atomic tool/data layer; workflows compose MCP tool invocations.  
- **A2A:** agent-to-agent task layer; workflows MAY delegate via A2A.  
- **This protocol:** stateful orchestration between tool calls and multi-agent handoffs (Layer 1 in brief’s stack).

## File cross-reference short names

- **Root / entry:** `rfc-00-overview.md` (links all sections + `analysis-brief.md`)  
- §1 `rfc-01-abstract-motivation.md`  
- §2 `rfc-02-design-principles.md`  
- §3 `rfc-03-workflow-definition-schema.md`  
- §4 `rfc-04-execution-model.md`  
- §5 `rfc-05-integration-interfaces.md`  
- §6 `rfc-06-interoperability.md`  
- §7 `rfc-07-security-model.md`  
- §8 `rfc-08-reference-implementation.md`  
- §9 `rfc-09-governance-adoption.md`
