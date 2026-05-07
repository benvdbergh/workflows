# A universal workflow protocol for AI agents

**No standard exists today for deterministic, auditable, graph-based workflow execution across agentic AI platforms — and this gap is the single biggest barrier to production-grade AI agents.** Every major agentic framework (CrewAI, AutoGen, LangChain, Dify, Agent Zero, OpenHands) provides strong LLM reasoning loops but falls critically short on checkpointing, retries, human-in-the-loop interrupts, and reproducible execution. The Model Context Protocol (MCP) proved that a vendor-neutral standard can achieve cross-platform adoption in under 18 months, reaching 10,000+ servers and 97M+ monthly SDK downloads. A workflow standard following MCP's playbook — shipping working code, solving immediate pain, and maintaining radical simplicity — could fill the missing orchestration layer between atomic tool calls (MCP) and agent-to-agent messaging (A2A). This document maps the full landscape, identifies precise gaps, and proposes an integration architecture for an RFC-style specification.

---

## The workflow standards that already exist

Seven distinct approaches to workflow definition and execution are relevant to an AI agent workflow protocol. Each solves part of the problem; none solves all of it.

**LangGraph** (24,800 GitHub stars, 34.5M PyPI downloads/month) is the closest thing to a purpose-built AI agent workflow engine. Its `StateGraph` API defines nodes as pure state-transforming functions, edges as deterministic or conditional transitions, and state as `TypedDict` or Pydantic models with per-key reducers inspired by Google's Pregel model. Checkpointing via `MemorySaver`, `SqliteSaver`, or `PostgresSaver` enables pause/resume and time-travel debugging. Enterprise adoption includes Klarna, Replit, Elastic, Cisco, and Uber (400 companies on LangGraph Platform). However, **LangGraph is code-first with no declarative serialization format** — graphs cannot be exported to JSON/YAML, making them non-portable. It supports only Python and TypeScript, remains tied to the LangChain ecosystem (LangSmith, LangServe), and lacks deterministic replay via event sourcing.

**Temporal.io** (~19,000 stars, $1.72B valuation, 1,000+ paying cloud customers) represents the gold standard for deterministic execution. Its core innovation is **event-sourced workflow replay**: workflow code generates Commands recorded as immutable Events in an append-only history. On crash recovery, the framework re-executes workflow code and verifies Commands match the existing Event history. Non-deterministic operations (I/O, time, randomness) must go through Temporal SDK APIs — `workflow.now()` instead of `datetime.now()`, Activities instead of direct calls. Temporal supports six languages (Go, Java, Python, TypeScript, .NET, Ruby), and OpenAI Codex already uses it for long-running agent orchestration. Its execution model is directly applicable to AI agents: the workflow is the deterministic orchestration layer; LLM calls are Activities.

**AWS Step Functions** provides the most reusable declarative format via Amazon States Language (ASL) — a JSON schema with eight typed states (Task, Pass, Choice, Wait, Parallel, Map, Succeed, Fail), JSONPath/JSONata expressions for data flow, and built-in Retry/Catch blocks with configurable backoff. ASL's explicit state typing and conditional branching via the `Choice` state are directly applicable to agent workflows, though it lacks cycles (no native loops) and is coupled to AWS resource ARNs.

**CNCF Serverless Workflow** (v1.0.0, CNCF Sandbox project since 2020) is the most promising vendor-neutral portable standard. It defines workflows in YAML or JSON with constructs including `call` (HTTP/gRPC/OpenAPI), `run` (container/script/workflow), `switch`, `for`, `try/catch`, `listen`, `emit`, `wait`, `set`, and `raise`. SDKs exist in seven languages. Contributors include Google, Oracle, Red Hat, IBM, Microsoft, and Temporal engineers. **It lacks AI-specific constructs** (LLM calls, agent delegation, tool-use patterns) but its extensible architecture could accommodate them.

Three additional systems provide relevant patterns. **Prefect** (~21,900 stars) demonstrates excellent decorator-based developer experience (`@flow`/`@task` with retries, caching, and nested flows) but is Python-only and data-pipeline-focused. **Azure Durable Functions** proves Temporal's event-sourcing pattern works in serverless contexts but is Azure-locked. **Netflix Conductor** (12,800 stars, archived December 2023) pioneered a clean JSON workflow DSL with typed task nodes (SIMPLE, HTTP, SWITCH, FORK_JOIN, DO_WHILE, SUB_WORKFLOW, HUMAN) that influenced later designs.

| System | Format | Deterministic Replay | Languages | Stars | Agent-Readiness |
|--------|--------|---------------------|-----------|-------|----------------|
| LangGraph | Code-first | No (checkpoint-based) | Python, TS | ~24.8K | ★★★★★ |
| Temporal | Code-first | **Yes (event sourcing)** | 6 languages | ~19K | ★★★★ |
| AWS Step Functions | JSON (ASL) | Managed | Any (via Lambda) | N/A | ★★★ |
| CNCF Serverless WF | YAML/JSON | Runtime-dependent | 7 SDKs | ~700 | ★★★ |
| Prefect | Code-first | No | Python | ~21.9K | ★★ |
| BPMN/Camunda | XML | Engine-dependent | Polyglot | N/A | ★★ |
| Conductor | JSON | No | Polyglot | 12.8K | ★★★ |

---

## Where every agentic framework falls short

A systematic capability audit across eleven major frameworks reveals that **no framework today delivers more than seven of the ten capabilities required for production-grade deterministic agent workflows**. The gaps are structural, not incremental.

**The checkpoint/resume gap is the most critical.** Among the surveyed frameworks — CrewAI, AutoGen, LangChain (LCEL), Agent Zero, OpenHands, Dify, Flowise, n8n, Pipecat, Claude Code, and Cursor — zero provide production-grade checkpoint/resume that survives process restarts as a built-in primitive. CrewAI Flows, Dify, and Flowise workflows run to completion; a mid-execution failure means restart from scratch. n8n records execution history but cannot resume from an arbitrary checkpoint. AutoGen v0.4 added serialization but no durable execution engine. Only LangGraph (outside this comparison set) offers database-backed checkpoint/resume.

**The determinism boundary is undefined.** No framework formally separates deterministic workflow structure from non-deterministic LLM calls in a standard way. CrewAI's dual architecture (deterministic Flows + autonomous Crews) is the closest philosophical match, with Flows using `@start`/`@listen` decorators for event-driven orchestration and Crews handling LLM-driven delegation. But Flows lack formal guarantees — they are Python event chains, not state machines. Dify's visual workflow editor fixes execution paths, but LLM and Agent nodes within it are probabilistic. The **absence of a formal "this part is deterministic, this part is LLM-driven" specification** means no framework can provide true auditability.

**Retry policies remain primitive.** Production systems need exponential backoff, dead-letter queues, model fallback (retry on rate limit → fall back to cheaper model), and compensation logic. n8n has the strongest retry support with built-in error handling nodes. Dify offers multi-credential failover. No framework implements configurable retry policies for LLM calls or saga patterns for multi-step workflows as first-class primitives.

The visual workflow engines — **Dify** (~100K stars) and **Flowise** (~35K stars) — come closest to providing explicit graph definitions. Dify offers a genuine DAG editor with 15+ node types including LLM, Knowledge Retrieval, If/Else, Code, HTTP Request, Agent, and Human Input nodes (added in v1.13.0). Flowise's AgentFlow V2 provides 15 built-in node types with a JSON-based ReactFlow data structure. **n8n** (~65K stars) combines 500+ integration nodes with AI agent capabilities and offers the strongest enterprise audit trails (SIEM streaming, execution logs, RBAC). All three use proprietary JSON formats — none are interoperable.

| Capability | CrewAI | AutoGen | Dify | Flowise | n8n | Agent Zero | OpenHands | Claude Code | Cursor |
|---|---|---|---|---|---|---|---|---|---|
| Graph definition | Partial | Partial | **Yes** | **Yes** | **Yes** | No | No | No | No |
| Deterministic exec | Partial | Partial | Partial | Partial | Partial | No | No | No | No |
| Checkpoint/resume | No | Partial | No | No | Partial | No | No | No | No |
| Retry policies | No | No | Partial | No | **Yes** | No | No | No | Partial |
| Human-in-the-loop | Partial | **Yes** | **Yes** | **Yes** | **Yes** | Partial | **Yes** | **Yes** | **Yes** |
| Conditional branching | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | No | No | No | Partial |
| Sub-workflows | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | No | Partial | No | No |
| Audit trail | Partial | Partial | **Yes** | Partial | **Yes** | No | Partial | Partial | **Yes** |
| Parallel branches | **Yes** | **Yes** | **Yes** | Partial | **Yes** | No | No | Partial | **Yes** |

**The closest thing to a deterministic workflow standard for AI agents today is LangGraph**, scoring roughly 7/10 on required capabilities. But it is code-first (non-portable), Python/TypeScript-only, LangChain-ecosystem-tied, and lacks deterministic replay. A universal standard would need to close these gaps while serving platforms from Cursor to n8n to Pipecat.

---

## How MCP conquered cross-platform adoption in 13 months

MCP's trajectory from Anthropic side-project to de facto industry standard offers a precise playbook for a workflow protocol. Understanding what worked — and what drew criticism — is essential.

**The timeline compressed remarkably.** Anthropic released MCP in November 2024 with working SDKs (Python, TypeScript), reference server implementations, and a working client (Claude Desktop). By March 2025, OpenAI CEO Sam Altman announced full MCP support — the watershed moment that transformed it from an Anthropic project into an industry standard. Google Gemini followed in April. Microsoft announced native support in Windows 11, Copilot Studio, and VS Code at Build 2025 in May. By December 2025, MCP was donated to the Agentic AI Foundation (AAIF) under the Linux Foundation, co-founded by Anthropic, Block, and OpenAI, with Google, Microsoft, AWS, Cloudflare, and Bloomberg as platinum members.

**Six factors drove adoption.** First, MCP solved a real, immediate pain point — the N×M integration problem of every model needing custom integrations for every tool. Second, its architecture was deliberately simple: JSON-RPC 2.0 with four primitives (Tools, Resources, Prompts, Sampling), inspired by the Language Server Protocol familiar to every IDE developer. Third, **Anthropic shipped working code, not just a spec** — Claude Desktop was a working reference client from day one. Fourth, building MCP servers was asymmetrically easy (any language that does stdout or HTTP), creating a supply-side flywheel. Fifth, the "USB-C for AI" analogy gave developers an instant mental model. Sixth, governance was timed correctly: single-company control for 13 months ensured decisive execution, then neutral-foundation donation once adoption was proven.

**Current MCP scale** (March 2026): over **10,000 active public servers**, **97M+ monthly SDK downloads** across Python and TypeScript, **1,412+ company-operated remote servers** (growing ~300/month), and native support in Claude Desktop, Claude Code, ChatGPT, GitHub Copilot, VS Code, Cursor, Windsurf, Gemini, Cline, Zed, Sourcegraph, Replit, and Windows 11.

**Criticisms inform the workflow standard's design.** Security concerns are significant: 88% of MCP servers require credentials but 53% use insecure static secrets, and prompt injection via tool poisoning remains a known attack vector. Context window consumption is problematic — large tool descriptions (GitHub MCP exposes 40K+ tokens) forced a retrofit of dynamic tool discovery. The sync-only limitation pre-November 2025 blocked long-running operations, addressed only in the November spec update with async operations. The auth story (OAuth 2.1 treating MCP servers as both authorization and resource servers) clashes with enterprise patterns.

**Lessons for a workflow standard:**

- Ship with a working reference client and at least two SDKs from day one
- Solve a problem developers already manually solve (today: hand-coding retry logic, checkpoint state, conditional branching)
- Keep the core protocol to under 5 primitives with familiar semantics
- Make server/engine creation asymmetrically easy
- Get one competitor to adopt early — if both LangChain and a non-LangChain platform adopt, the standard has legs
- Start single-company for speed; donate to neutral foundation after proving adoption
- Design security and auth correctly from v1 (MCP's biggest regret)

---

## The emerging standards landscape reveals a missing layer

The AI agent standards ecosystem is converging on a layered architecture, and one layer is conspicuously absent.

**MCP** occupies the tool/data connectivity layer — connecting AI models to external capabilities via atomic, stateless invocations. **Google's A2A protocol** (announced April 2025, donated to Linux Foundation June 2025, 150+ supporting organizations) targets agent-to-agent collaboration, with Agent Cards for discovery, a task lifecycle (submitted → working → input-required → completed), and streaming via SSE. However, A2A's grassroots adoption has lagged MCP significantly — a September 2025 analysis noted it was "quietly fading" as MCP dominated developer mindshare, though IBM's ACP protocol merging into A2A in August 2025 strengthened it.

**OpenAI's Agents SDK** (v0.12.5, open-source, Python and TypeScript) evolved from the experimental Swarm framework, with four primitives: Agents, Handoffs, Tools, and Guardrails. It provides built-in MCP integration, tracing, and human-in-the-loop but lacks persistence or graph orchestration. **Anthropic's Agent Skills** (open standard at agentskills.io) teach agents how to perform complex workflows via `SKILL.md` files — adopted by GitHub Copilot, Claude Code, and Cursor. **AGNTCY** (Cisco, under Linux Foundation, 75+ companies) provides infrastructure primitives: agent discovery (DNS-like directory), cryptographic identity, and secure messaging via the SLIM protocol.

The stack as it exists:

- **Layer 5 — Knowledge/Behavior:** Agent Skills, AGENTS.md
- **Layer 4 — Agent-to-Agent:** A2A Protocol
- **Layer 3 — Tool Connectivity:** MCP
- **Layer 2 — Infrastructure:** AGNTCY (discovery, identity, observability)
- **Layer 1 — ??? Workflow Orchestration:** No standard exists

**The missing Layer 1 sits between MCP's atomic tool calls and A2A's agent coordination**, defining stateful, multi-step, conditional execution flows with human-in-the-loop, retry semantics, and long-running state management. This is precisely the gap a universal workflow protocol would fill.

---

## How a workflow engine integrates with everything

A universal workflow engine must serve four integration modalities simultaneously — as an MCP server for Claude Code and Cursor, as an importable SDK for CrewAI and AutoGen, as a REST API for n8n and Dify, and as a protocol-native library for direct embedding. The Dapr sidecar pattern (core engine + thin multi-language clients) is the most instructive architectural precedent.

**As an MCP server**, the engine would expose tools like `start_workflow`, `get_workflow_status`, `resume_workflow`, `list_workflows`, `cancel_workflow`, and `send_signal`, plus resources for workflow definitions (`workflow://{id}/definition`), execution histories (`workflow://{id}/history`), and state snapshots. This pattern already has precedent — Kestra's MCP server (`kestra-io/mcp-server-python`) demonstrates workflow orchestration via MCP. Registration in Claude Desktop or Cursor is a one-line config:

```json
{
  "mcpServers": {
    "workflow-engine": {
      "command": "npx",
      "args": ["-y", "@agentflow/mcp-server"],
      "env": { "WORKFLOW_DIR": "./workflows" }
    }
  }
}
```

**As a Python/TypeScript SDK**, the engine should offer both a decorator-based API (Prefect-style, for simple sequential workflows) and a graph-builder API (LangGraph-style, for complex conditional graphs). The decorator approach — `@workflow`, `@step(retries=3, timeout="30s")` — provides the lowest friction for AI developers. The graph-builder approach — `StateGraph(State).add_node().add_conditional_edges().compile()` — handles complex routing, parallel branches, and sub-workflows. Both compile to the same canonical JSON schema internally.

**As a REST API sidecar**, the engine runs as a standalone HTTP service exposing CRUD endpoints for workflow definitions, execution lifecycle management (start, resume, signal, cancel), and event history retrieval, plus a WebSocket endpoint for real-time streaming. n8n, Dify, and Flowise connect via their HTTP Request nodes.

**Recommended architecture** follows a layered model:

```
┌───────────────────────────────────────────────┐
│           Core Engine (Rust or Go)             │
│  ┌──────────┬─────────────┬─────────────────┐ │
│  │Graph     │ State       │ Checkpoint      │ │
│  │Walker    │ Manager     │ Store           │ │
│  └──────────┴─────────────┴─────────────────┘ │
├───────────────────────────────────────────────┤
│              Interface Layer                   │
│  ┌────────┬────────┬──────────┬────────────┐  │
│  │Python  │ TS/JS  │ REST API │ MCP Server │  │
│  │SDK     │ SDK    │ (HTTP)   │ (stdio/SSE)│  │
│  └────────┴────────┴──────────┴────────────┘  │
└───────────────────────────────────────────────┘
```

Infrastructure tools that successfully serve multiple integration models include Redis (library + server + RESP protocol), Temporal (6 language SDKs + gRPC server + REST proxy), and Dapr (Python/JS/.NET/Java/Go SDKs + sidecar + HTTP/gRPC API). The common pattern: **a single core engine with a shared internal representation, exposed through thin interface adapters**.

---

## The recommended workflow definition format

The format question — YAML vs JSON vs code-first — has a clear answer: **all three, unified by a canonical JSON Schema**. YAML for human authoring (readable, supports comments, familiar from GitHub Actions and Kubernetes). JSON for machine interchange and API transport. Code-first SDKs (Python and TypeScript) for developers who prefer programmatic definitions. All three compile to the same canonical internal representation.

**The expression language should be jq.** It is proven in the CNCF Serverless Workflow specification, powerful enough for complex data transformations, cross-platform (implementations in C, Go, Rust, Python, JavaScript), and familiar to DevOps engineers. Conditions like `.intent == "billing"` and data transformations like `.messages | last | .content` are readable without documentation.

**Eleven node types cover AI agent workflow requirements:**

```yaml
# Canonical workflow definition format
document:
  schema: "agentflow/v1"
  name: "customer-support"
  version: "1.0.0"

state_schema:
  type: object
  properties:
    messages: { type: array, reducer: append }
    intent: { type: string }
    confidence: { type: number }

nodes:
  - id: classify
    type: llm_call
    config:
      model: "claude-sonnet-4-20250514"
      system_prompt: "Classify the user intent"
      output_schema: { intent: string, confidence: number }
    retry: { max_attempts: 3, backoff: exponential }
    timeout: "30s"

  - id: route
    type: switch
    cases:
      - when: '.intent == "billing" and .confidence > 0.8'
        target: billing_handler
      - when: '.intent == "technical"'
        target: tech_handler
      - default: human_review

  - id: human_review
    type: interrupt
    config:
      prompt: "Agent is unsure. Please review and classify."
      timeout: "24h"
      resume_schema: { intent: string }

  - id: parallel_research
    type: parallel
    branches:
      - name: search_web
        nodes: [web_search, summarize]
      - name: check_history
        nodes: [db_lookup, format]
    join: all
    timeout: "60s"

  - id: delegate_specialist
    type: agent_delegate
    config:
      agent_id: "billing-specialist"
      protocol: "a2a"  # or "mcp" or "sdk"
      input_mapping: { context: "${ .messages }" }

edges:
  - source: __start__
    target: classify
  - source: classify
    target: route
  - source: route
    # conditional edges defined in switch node

checkpointing:
  strategy: after_each_node
  storage: { type: sqlite, path: "./checkpoints.db" }
```

The eleven node types are:

- **start/end** — Entry and terminal states with input/output schemas
- **step** — Deterministic code execution (pure function)
- **llm_call** — LLM invocation with model, prompt, and output schema
- **tool_call** — External tool/API invocation (MCP-compatible)
- **switch** — Conditional branching with jq expressions
- **parallel** — Fork/join with configurable join semantics (all, any, n-of-m)
- **interrupt** — Human-in-the-loop pause with resume schema and timeout
- **agent_delegate** — Hand off to another agent (via A2A, MCP, or SDK)
- **subworkflow** — Nested workflow invocation with scope isolation
- **wait** — Timer or event-based pause
- **set_state** — Direct state manipulation

**This format extends the CNCF Serverless Workflow specification** with AI-agent-specific constructs rather than inventing from scratch. The base constructs (`call`, `switch`, `for`, `try/catch`, `wait`, `set`) map directly, while `llm_call`, `agent_delegate`, `tool_call`, and `interrupt` are domain-specific additions. Retry policies follow Temporal's proven structure: `max_attempts`, `initial_interval`, `backoff_coefficient`, `max_interval`, `non_retryable_errors`.

The **execution model should borrow Temporal's deterministic replay** pattern. The graph walker generates Commands (ExecuteNode, StartTimer, WaitForSignal) that produce Events recorded in an append-only history. On crash recovery, the engine replays from the event log, skipping completed nodes and re-executing only from the last checkpoint. Non-deterministic operations (LLM calls, tool invocations) are treated as "Activities" whose results are recorded and replayed deterministically.

**State management should borrow LangGraph's reducer pattern.** Each state field has a configurable reducer: `overwrite` (default), `append` (for message lists), `merge` (for dictionaries), or custom. This enables natural patterns like accumulating conversation messages while overwriting classification results.

---

## Positioning in a crowded landscape

The positioning must be precise: this is not another agent framework, not another LLM wrapper, and not a competitor to Temporal for software engineering workflows.

**vs. LangGraph:** LangGraph is the strongest existing solution for AI agent workflows but is fundamentally limited as a universal standard. It is code-first with no declarative serialization format (graphs can't be exported, versioned, or transmitted as data). It supports only Python and TypeScript. It is tied to the LangChain ecosystem (LangSmith for observability, LangServe for deployment). It lacks deterministic replay — checkpointing captures snapshots but doesn't enable crash-recovery replay from event history. A universal workflow protocol would be **language-agnostic, declarative-first, and execution-engine-independent**, borrowing LangGraph's excellent conceptual model (state channels, reducers, conditional edges) while solving its portability problem.

**vs. Temporal/Prefect:** Temporal provides the gold standard for deterministic execution but is designed for software engineering workflows, not AI agent delegation chains. It has no first-class primitives for LLM calls, agent handoffs, tool-use patterns, or human-in-the-loop approval with semantic context. Temporal could serve as the **execution backend** — a universal workflow definition would compile down to Temporal workflows for organizations needing enterprise-grade durability — but it is not the right **authoring layer** for AI developers.

**vs. MCP:** MCP standardizes tool discovery and invocation (atomic, stateless operations). A workflow protocol standardizes **what happens after an agent decides to execute a multi-step plan** — the stateful, conditional, long-running orchestration of multiple tool calls, LLM invocations, and human approvals. They are complementary layers: MCP tools feed into workflow steps; the workflow engine itself can expose its capabilities as MCP tools.

**Suggested positioning:** *"The execution protocol for AI agent workflows. MCP standardized tools. A2A standardized agent communication. This standardizes the plan between them."*

Name candidates that resonate with the AI agent community should emphasize the graph/workflow concept while signaling vendor neutrality. Terms like "AgentFlow," "FlowGraph," or "StepGraph" pair a familiar concept (flow/step/graph) with the agent domain. The name should be short, npm/PyPI-available, and unambiguous in web searches.

---

## Proposed RFC document outline

**Sharded specification (canonical entry):** [`rfc-00-overview.md`](rfc-00-overview.md) — single TOC and links to all draft sections (1–9) that implement this outline.

The founding RFC should follow the structure below, with each section serving a specific audience (protocol designers, platform integrators, or AI developers):

**Section 1 — Abstract and Motivation** (1 page). State the problem: agentic platforms provide great LLM reasoning but lack deterministic, auditable workflow execution. Cite the gap analysis: 0/11 surveyed frameworks provide all ten required capabilities. Frame the opportunity using the emerging standards stack (MCP → A2A → ??? → Skills).

**Section 2 — Design Principles** (1 page). Enumerate non-negotiable principles: vendor-neutral and language-agnostic; declarative-first with code-first SDK convenience; deterministic replay for crash recovery; every node execution is checkpointable; MCP-compatible from day one; security and auth designed in v1.

**Section 3 — Workflow Definition Schema** (5 pages). Formally specify the YAML/JSON schema with JSON Schema validation. Define all eleven node types with examples. Specify the expression language (jq). Define state schema, reducers, edge types, retry policies, timeout configurations, and checkpoint strategies. Include complete worked examples for three canonical agent workflows (customer support routing, research-and-summarize pipeline, multi-agent coding task).

**Section 4 — Execution Model** (4 pages). Specify the event-sourced deterministic replay mechanism. Define the Command/Event taxonomy. Specify state management with reducer semantics. Define parallel execution fork/join semantics. Specify the interrupt/resume protocol for human-in-the-loop. Define sub-workflow invocation and scope isolation.

**Section 5 — Integration Interfaces** (3 pages). Specify the MCP server interface (tools and resources). Specify the REST API (OpenAPI 3.0). Specify the Python SDK API surface. Specify the TypeScript SDK API surface. Define the wire protocol between SDK clients and the core engine.

**Section 6 — Interoperability** (2 pages). Define how workflows invoke MCP tools. Define how workflows delegate to A2A agents. Define how existing platforms integrate (CrewAI, AutoGen, Dify, n8n, Cursor, Claude Code). Provide adapter patterns for LangGraph graph import.

**Section 7 — Security Model** (2 pages). Define authentication and authorization for workflow execution. Specify secrets management for node credentials. Define audit log format (OpenTelemetry-compatible). Address prompt injection risks in LLM call nodes. Learn from MCP's security criticisms.

**Section 8 — Reference Implementation Plan** (1 page). Define the minimum viable implementation: core engine (Rust or Go), Python SDK, MCP server, SQLite checkpoint store. Specify the first three reference workflows. Define conformance test suite.

**Section 9 — Governance and Adoption Strategy** (1 page). Follow MCP's playbook: open-source from day one (Apache 2.0), single-maintainer for speed, target donation to AAIF/Linux Foundation after proving adoption. Define the path to getting two competing platforms to adopt. Specify the developer experience bar (first workflow running in under 5 minutes).

---

## Conclusion

The landscape analysis reveals a clear structural gap: the AI agent ecosystem has standardized tool connectivity (MCP, 97M+ downloads/month), is standardizing agent-to-agent communication (A2A, 150+ organizations), and is building infrastructure primitives (AGNTCY, 75+ companies) — but **has no standard for the stateful, deterministic workflow execution that transforms an LLM's plan into reliable, auditable action**. 

LangGraph's conceptual model (state graphs with reducers, conditional edges, and checkpointing) provides the right authoring abstraction. Temporal's event-sourced deterministic replay provides the right execution model. AWS Step Functions' typed state machine JSON provides the right declarative format precedent. The CNCF Serverless Workflow specification provides the right extensibility framework. MCP's adoption trajectory provides the right go-to-market strategy.

The key insight is that this protocol should not compete with any of these — it should **compose them**. A workflow defined in YAML, authored via a Python SDK, compiled to a graph that executes on a Temporal-style replay engine, invoking MCP tools and A2A agents at each step, with every transition checkpointed and auditable. The engine exposes itself as an MCP server so any AI assistant can use it, as a REST API so any automation platform can call it, and as a native library so any framework can embed it.

The 80–90% failure rate of AI agent projects reaching production (per RAND 2025) is not an LLM capability problem — it is an orchestration reliability problem. This protocol addresses it directly.