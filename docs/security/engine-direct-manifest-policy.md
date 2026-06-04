# Engine-direct operator manifest policy

**Status:** Alpha baseline (BEN-10)  
**Related:** [ADR-0003](../architecture/adr/ADR-0003-engine-direct-mcp-activity-execution.md), `packages/engine/src/orchestrator/mcp-stdio-activity-executor.mjs`

## Purpose

Engine-direct mode runs MCP `tool_call` nodes by spawning stdio servers declared in an **operator manifest**. This policy limits which OS commands the reference engine may spawn and documents how operators extend the allowlist.

## Command allowlist

| Mode | Behavior |
|------|----------|
| `WORKFLOW_ENGINE_MCP_ALLOW_COMMANDS` **unset** | Only commands whose **basename** is `node` or `npx` are allowed (covers typical `process.execPath` / package-runner manifests). |
| `WORKFLOW_ENGINE_MCP_ALLOW_COMMANDS` **set** | Comma-separated list of allowed basenames or full command paths (trimmed, case-sensitive path match when a path separator is present). |

Denied commands fail before subprocess spawn with activity code `MCP_COMMAND_NOT_ALLOWED`.

Example (automation worker):

```bash
export WORKFLOW_ENGINE_MCP_ALLOW_COMMANDS=node,npx,/opt/tools/custom-mcp-server
export WORKFLOW_ENGINE_MCP_CONFIG=/etc/agent-workflow/mcp.json
```

## Manifest signing and verification (future)

Manifest files should eventually be signed or delivered via a trusted path (see ADR-0003 follow-up). Today the engine validates manifest JSON schema only; **signature verification is not enforced** at manifest load time.

## Path sandbox (deferred)

Filesystem path constraints for manifest `cwd` and server binaries are **not** implemented in alpha. Operators must restrict manifest file permissions and deployment paths.

## Workflow definition signing

Optional definition signatures are handled by `verifyDefinitionSignature` in `@agent-workflow/engine` (stub: unsigned passes; signed records presence without crypto verify until v1 profile).

## When to use engine-direct

Use only on dedicated automation hosts where the engine process is in the same trust zone as configured MCP servers. Assistant-class hosts should prefer **host-mediated** activity execution (ADR-0002).
