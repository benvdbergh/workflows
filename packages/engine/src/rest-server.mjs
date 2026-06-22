#!/usr/bin/env node
import { createServer } from "node:http";
import { createWorkflowApplicationPort } from "./application/workflow-application-port.mjs";
import { createRestWorkflowHandler } from "./adapters/rest/rest-handler.mjs";
import { DefinitionRegistry } from "./adapters/rest/definition-registry.mjs";
import {
  formatActivityRoutingSummaryLog,
  formatMcpManifestValidationErrors,
  loadProductionActivityExecutor,
  loadProductionDelegateExecutor,
  resolveTransportValidationOptionsFromEnv,
  resolveWorkflowEngineMcpConfigPath,
} from "./adapters/mcp/stdio-server-config.mjs";
import { MemoryExecutionHistoryStore } from "./persistence/memory-history-store.mjs";
import { loadControlPlaneAuthConfigFromEnv } from "./security/control-plane-auth.mjs";

/**
 * @param {string[]} argv
 */
function parsePort(argv) {
  const portIndex = argv.indexOf("--port");
  if (portIndex >= 0 && argv[portIndex + 1]) {
    const parsed = Number.parseInt(argv[portIndex + 1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  const fromEnv = process.env.WORKFLOW_ENGINE_REST_PORT;
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 8787;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      "Usage: workflows-engine-rest [--port <number>] [--mcp-config <path>]\n" +
        "Starts HTTP REST control-plane adapter (RFC-05 §5.3 paths).\n" +
        "\n" +
        "Environment:\n" +
        "  WORKFLOW_ENGINE_REST_PORT — listen port (default 8787)\n" +
        "  WORKFLOW_ENGINE_MCP_CONFIG — operator manifest for in-process activity/delegate routing\n" +
        "  WORKFLOW_ENGINE_DEFINITION_SIGNING_MODE — optional (default) or require\n" +
        "  WORKFLOW_ENGINE_SIGNING_PUBLIC_KEYS — inline JSON or file:path public key map\n" +
        "  WORKFLOW_ENGINE_AUTH_TOKENS — inline JSON array or file:path of scoped bearer tokens (REST enforcement)\n" +
        "\n" +
        "OpenAPI: packages/engine/openapi/openapi.yaml\n"
    );
    return;
  }

  const manifestPath = resolveWorkflowEngineMcpConfigPath(process.argv);
  let activityExecutor = undefined;
  let delegateExecutor = undefined;
  try {
    const [activityLoaded, delegateLoaded] = await Promise.all([
      loadProductionActivityExecutor({ manifestPath }),
      loadProductionDelegateExecutor({ manifestPath }),
    ]);
    if (!activityLoaded.ok) {
      if ("errors" in activityLoaded && activityLoaded.errors) {
        process.stderr.write(
          `[engine-rest] Invalid operator manifest at ${manifestPath}:\n${formatMcpManifestValidationErrors(activityLoaded.errors)}\n`
        );
      } else {
        process.stderr.write(`[engine-rest] Activity executor configuration failed: ${activityLoaded.error}\n`);
      }
      process.exitCode = 1;
      return;
    }
    activityExecutor = activityLoaded.executor;

    if (!delegateLoaded.ok) {
      if ("errors" in delegateLoaded && delegateLoaded.errors) {
        process.stderr.write(
          `[engine-rest] Invalid operator manifest at ${manifestPath}:\n${formatMcpManifestValidationErrors(delegateLoaded.errors)}\n`
        );
      } else {
        process.stderr.write(`[engine-rest] Delegate executor configuration failed: ${delegateLoaded.error}\n`);
      }
      process.exitCode = 1;
      return;
    }
    delegateExecutor = delegateLoaded.executor;
    process.stderr.write(formatActivityRoutingSummaryLog(activityLoaded.routingSummary));
  } catch (err) {
    process.stderr.write(
      `[engine-rest] Executor configuration failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exitCode = 1;
    return;
  }

  const store = new MemoryExecutionHistoryStore();
  const transportValidation = resolveTransportValidationOptionsFromEnv();
  const authConfig = loadControlPlaneAuthConfigFromEnv();
  const definitionRegistry = new DefinitionRegistry({ transportValidation });
  const workflowPort = createWorkflowApplicationPort({
    store,
    ...(activityExecutor ? { activityExecutor } : {}),
    ...(delegateExecutor ? { delegateExecutor } : {}),
  });
  const handler = createRestWorkflowHandler(workflowPort, {
    definitionRegistry,
    store,
    transportValidation,
    authConfig,
  });
  const port = parsePort(args);
  const server = createServer((req, res) => {
    handler(req, res).catch((error) => {
      process.stderr.write(`[engine-rest] handler error: ${error instanceof Error ? error.message : String(error)}\n`);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Unexpected handler failure." } }));
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  process.stderr.write(`[engine-rest] listening on http://127.0.0.1:${port}\n`);
}

main().catch((error) => {
  process.stderr.write(`[engine-rest] startup failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
