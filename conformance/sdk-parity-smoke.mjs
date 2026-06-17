import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryExecutionHistoryStore } from "../packages/engine/src/index.mjs";
import { WorkflowClient } from "../packages/sdk/src/index.mjs";
import { createParityRestServer } from "./parity-runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

/**
 * SDK REST transport smoke: WorkflowClient over in-process RFC-05 server matches port/MCP
 * normalized snapshots for the r2 linear-complete scenario.
 */
export async function runSdkParitySmoke() {
  const definition = JSON.parse(
    readFileSync(path.join(repoRoot, "examples", "lighthouse-customer-routing.workflow.json"), "utf8")
  );
  const executionId = "sdk-parity-smoke-linear-1";
  const input = { ticket_text: "clear technical issue" };
  const stubActivityOutputs = {
    classify: { intent: "technical", confidence: 0.9 },
    search_kb: { snippets: [] },
  };

  const store = new MemoryExecutionHistoryStore();
  const { baseUrl, wfId, close } = await createParityRestServer(
    definition,
    store,
    undefined,
    stubActivityOutputs
  );

  try {
    const client = new WorkflowClient({ baseUrl });

    const started = await client.start({
      wfId,
      executionId,
      input,
    });
    if (started.status !== "completed") {
      return {
        passed: false,
        reason: `SDK REST start expected status completed but got ${started.status}`,
      };
    }

    const status = await client.getStatus({ executionId });
    if (status.phase !== "completed") {
      return {
        passed: false,
        reason: `SDK REST status expected phase completed but got ${status.phase}`,
      };
    }

    return { passed: true };
  } finally {
    await close();
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  const result = await runSdkParitySmoke();
  if (result.passed) {
    console.error("PASS [sdk-parity-smoke] WorkflowClient REST transport");
  } else {
    console.error(`FAIL [sdk-parity-smoke] ${result.reason}`);
    process.exitCode = 1;
  }
}
