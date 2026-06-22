import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createRestWorkflowHandler } from "../src/adapters/rest/rest-handler.mjs";
import { DefinitionRegistry } from "../src/adapters/rest/definition-registry.mjs";
import { MCP_ADAPTER_ERROR } from "../src/adapters/mcp/errors.mjs";
import { buildControlPlaneAuthConfig } from "../src/security/control-plane-auth.mjs";
import { createWorkflowApplicationPort } from "../src/application/workflow-application-port.mjs";
import { MemoryExecutionHistoryStore } from "../src/persistence/memory-history-store.mjs";
import { findWorkflowRepoRoot } from "../src/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function minimalValidWorkflowDefinition(name = "rest-mock") {
  return {
    document: {
      schema: "https://agent-workflow.dev/schemas/workflow-definition.json",
      name,
      version: "1.0.0",
    },
    state_schema: { type: "object" },
    nodes: [
      { id: "start", type: "start" },
      { id: "end", type: "end" },
    ],
    edges: [
      { source: "__start__", target: "start" },
      { source: "start", target: "end" },
    ],
  };
}

function hostMediatedLinearDefinition() {
  return {
    document: {
      schema: "https://agent-workflow.dev/schemas/workflow-definition.json",
      name: "rest-host-med-linear",
      version: "1.0.0",
    },
    state_schema: {
      type: "object",
      properties: {
        out: { type: "string" },
      },
    },
    nodes: [
      { id: "start", type: "start" },
      {
        id: "work",
        type: "tool_call",
        config: { server: "demo-mcp", tool: "stub", arguments: {} },
      },
      { id: "end", type: "end", config: { output_mapping: ".out" } },
    ],
    edges: [
      { source: "__start__", target: "start" },
      { source: "start", target: "work" },
      { source: "work", target: "end" },
    ],
  };
}

function loadLighthouse() {
  const root = findWorkflowRepoRoot(__dirname);
  return JSON.parse(readFileSync(path.join(root, "examples", "lighthouse-customer-routing.workflow.json"), "utf8"));
}

/**
 * @param {(port: number) => Promise<void>} run
 * @param {{ authConfig?: import("../src/security/control-plane-auth.mjs").ControlPlaneAuthConfig }} [options]
 */
async function withRestServer(run, options = {}) {
  const store = new MemoryExecutionHistoryStore();
  const definitionRegistry = new DefinitionRegistry();
  const workflowPort = createWorkflowApplicationPort({ store });
  const handler = createRestWorkflowHandler(workflowPort, {
    definitionRegistry,
    store,
    authConfig: options.authConfig,
  });
  const server = createServer((req, res) => {
    handler(req, res).catch((error) => {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: String(error) } }));
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(address.port);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve(undefined))));
  }
}

/**
 * @param {number} port
 * @param {string} method
 * @param {string} pathname
 * @param {unknown} [body]
 * @param {{ authorization?: string }} [options]
 */
async function requestJson(port, method, pathname, body, options = {}) {
  // codeql[js/file-access-to-http]: test posts fixture JSON to in-process localhost only
  const headers = {};
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (options.authorization) {
    headers.authorization = options.authorization;
  }
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : undefined;
  return { status: response.status, body: parsed };
}

describe("REST workflow adapter", () => {
  it("registers definition and starts execution via RFC-05 paths", async () => {
    await withRestServer(async (port) => {
      const definition = minimalValidWorkflowDefinition("rest-register-start");
      const registered = await requestJson(port, "POST", "/v1/workflows", { definition });
      assert.equal(registered.status, 201);
      assert.equal(registered.body.wf_id, "rest-register-start");

      const fetched = await requestJson(port, "GET", `/v1/workflows/${registered.body.wf_id}`);
      assert.equal(fetched.status, 200);
      assert.equal(fetched.body.wf_id, "rest-register-start");

      const started = await requestJson(port, "POST", `/v1/workflows/${registered.body.wf_id}/executions`, {
        execution_id: "rest-exec-1",
        input: {},
      });
      assert.equal(started.status, 200);
      assert.equal(started.body.execution_id, "rest-exec-1");
      assert.equal(started.body.status, "completed");

      const status = await requestJson(port, "GET", "/v1/executions/rest-exec-1");
      assert.equal(status.status, 200);
      assert.equal(status.body.phase, "completed");
    });
  });

  it("returns structured validation errors aligned with MCP adapter codes", async () => {
    await withRestServer(async (port) => {
      const response = await requestJson(port, "POST", "/v1/workflows", {
        definition: { nodes: [], edges: [] },
      });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "VALIDATION_ERROR");
    });
  });

  it("maps missing execution to EXECUTION_NOT_FOUND on status", async () => {
    await withRestServer(async (port) => {
      const response = await requestJson(port, "GET", "/v1/executions/missing-exec");
      assert.equal(response.status, 404);
      assert.equal(response.body.error.code, "EXECUTION_NOT_FOUND");
    });
  });

  it("lists paginated execution events from the history store", async () => {
    await withRestServer(async (port) => {
      const definition = minimalValidWorkflowDefinition("rest-events");
      const registered = await requestJson(port, "POST", "/v1/workflows", { definition });
      await requestJson(port, "POST", `/v1/workflows/${registered.body.wf_id}/executions`, {
        execution_id: "rest-events-1",
        input: {},
      });

      const events = await requestJson(port, "GET", "/v1/executions/rest-events-1/events?limit=5");
      assert.equal(events.status, 200);
      assert.equal(events.body.execution_id, "rest-events-1");
      assert.ok(Array.isArray(events.body.events));
      assert.ok(events.body.events.length > 0);
      assert.equal(events.body.events[0].seq, 1);
    });
  });

  it("resumes interrupted lighthouse execution", async () => {
    await withRestServer(async (port) => {
      const definition = loadLighthouse();
      const registered = await requestJson(port, "POST", "/v1/workflows", { definition });
      const started = await requestJson(port, "POST", `/v1/workflows/${registered.body.wf_id}/executions`, {
        execution_id: "rest-resume-1",
        input: { ticket_text: "unclear" },
      });
      assert.equal(started.body.status, "interrupted");

      const resumed = await requestJson(port, "POST", "/v1/executions/rest-resume-1:resume", {
        definition,
        resume_payload: { intent: "billing" },
      });
      assert.equal(resumed.status, 200);
      assert.equal(resumed.body.status, "completed");
      assert.deepEqual(resumed.body.result, { intent: "billing", confidence: null });
    });
  });

  it("maps stale resume attempts to INVALID_RESUME_PAYLOAD", async () => {
    await withRestServer(async (port) => {
      const definition = minimalValidWorkflowDefinition("rest-resume-stale");
      const registered = await requestJson(port, "POST", "/v1/workflows", { definition });
      await requestJson(port, "POST", `/v1/workflows/${registered.body.wf_id}/executions`, {
        execution_id: "rest-resume-stale",
        input: {},
      });

      const response = await requestJson(port, "POST", "/v1/executions/rest-resume-stale:resume", {
        definition,
        resume_payload: { intent: "billing" },
      });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "INVALID_RESUME_PAYLOAD");
    });
  });

  it("completes host-mediated execution through submit_activity", async () => {
    await withRestServer(async (port) => {
      const definition = hostMediatedLinearDefinition();
      const registered = await requestJson(port, "POST", "/v1/workflows", { definition });
      const executionId = "rest-submit-ok";
      const input = {};

      const started = await requestJson(port, "POST", `/v1/workflows/${registered.body.wf_id}/executions`, {
        execution_id: executionId,
        input,
        activity_execution_mode: "host_mediated",
      });
      assert.equal(started.body.status, "awaiting_activity");
      assert.equal(started.body.node_id, "work");

      const submitted = await requestJson(port, "POST", `/v1/executions/${executionId}:submit_activity`, {
        definition,
        input,
        node_id: "work",
        outcome: { ok: true, result: { out: "from-host" } },
      });
      assert.equal(submitted.status, 200);
      assert.equal(submitted.body.status, "completed");
      assert.equal(submitted.body.result, "from-host");
    });
  });

  it("maps stale activity submit to ACTIVITY_SUBMIT_NOT_AWAITING", async () => {
    await withRestServer(async (port) => {
      const definition = hostMediatedLinearDefinition();
      const response = await requestJson(port, "POST", "/v1/executions/no-such-exec:submit_activity", {
        definition,
        input: {},
        node_id: "work",
        outcome: { ok: true, result: { out: "x" } },
      });
      assert.equal(response.status, 409);
      assert.equal(response.body.error.code, "ACTIVITY_SUBMIT_NOT_AWAITING");
    });
  });

  it("POST :cancel cooperatively cancels awaiting_signal execution", async () => {
    await withRestServer(async (port) => {
      const root = findWorkflowRepoRoot(__dirname);
      const definition = JSON.parse(
        readFileSync(path.join(root, "examples", "conformance-signal-wait.workflow.json"), "utf8")
      );
      const registered = await requestJson(port, "POST", "/v1/workflows", { definition });
      const executionId = "rest-cancel-signal";
      const startResponse = await requestJson(port, "POST", `/v1/workflows/${registered.body.wf_id}/executions`, {
        execution_id: executionId,
        input: {},
      });
      assert.equal(startResponse.status, 200);
      assert.equal(startResponse.body.status, "awaiting_signal");

      const cancelResponse = await requestJson(port, "POST", `/v1/executions/${executionId}:cancel`, {
        reason: "rest abort",
      });
      assert.equal(cancelResponse.status, 200);
      assert.equal(cancelResponse.body.status, "cancelled");
      assert.equal(cancelResponse.body.reason, "rest abort");
    });
  });

  it("maps cancel on unknown execution to EXECUTION_NOT_FOUND", async () => {
    await withRestServer(async (port) => {
      const response = await requestJson(port, "POST", "/v1/executions/no-such-exec:cancel");
      assert.equal(response.status, 404);
      assert.equal(response.body.error.code, "EXECUTION_NOT_FOUND");
    });
  });

  it("returns 401 AUTH_ERROR when auth enabled and bearer token is missing", async () => {
    const authConfig = buildControlPlaneAuthConfig([
      { token: "read-token", scopes: ["read_history"] },
    ]);
    await withRestServer(
      async (port) => {
        const response = await requestJson(port, "GET", "/v1/executions/missing-exec");
        assert.equal(response.status, 401);
        assert.equal(response.body.error.code, MCP_ADAPTER_ERROR.AUTH_ERROR);
      },
      { authConfig }
    );
  });

  it("returns 403 AUTH_FORBIDDEN when token lacks required scope", async () => {
    const authConfig = buildControlPlaneAuthConfig([
      { token: "read-token", scopes: ["read_history"] },
      { token: "start-token", scopes: ["start"] },
    ]);
    await withRestServer(
      async (port) => {
        const definition = minimalValidWorkflowDefinition("rest-auth-scope");
        const registered = await requestJson(
          port,
          "POST",
          "/v1/workflows",
          { definition },
          { authorization: "Bearer read-token" }
        );
        assert.equal(registered.status, 403);
        assert.equal(registered.body.error.code, MCP_ADAPTER_ERROR.AUTH_FORBIDDEN);
        assert.equal(registered.body.error.details?.reason, "insufficient_scope");

        const allowed = await requestJson(
          port,
          "POST",
          "/v1/workflows",
          { definition },
          { authorization: "Bearer start-token" }
        );
        assert.equal(allowed.status, 201);
      },
      { authConfig }
    );
  });
});
