import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MCP_ADAPTER_ERROR } from "../src/adapters/mcp/errors.mjs";
import { createMcpWorkflowToolHandlers } from "../src/adapters/mcp/workflow-tools.mjs";
import {
  authorizeRestRequest,
  authorizeScope,
  authorizeToolCall,
  buildControlPlaneAuthConfig,
  extractBearerToken,
  loadControlPlaneAuthConfigFromEnv,
  parseControlPlaneAuthTokensConfig,
  resolveRestRouteScope,
  TOOL_REQUIRED_SCOPE,
} from "../src/security/control-plane-auth.mjs";

const readOnlyAuth = buildControlPlaneAuthConfig([
  { token: "read-token", scopes: ["read_history"] },
]);

const startAuth = buildControlPlaneAuthConfig([
  { token: "start-token", scopes: ["start"] },
]);

const fullAuth = buildControlPlaneAuthConfig([
  { token: "admin-token", scopes: ["start", "resume", "read_history", "submit_activity"] },
]);

describe("control-plane auth", () => {
  it("disables auth when WORKFLOW_ENGINE_AUTH_TOKENS is unset or empty", () => {
    const config = loadControlPlaneAuthConfigFromEnv({});
    assert.equal(config.enabled, false);
    assert.deepEqual(authorizeToolCall("workflow_start", null, config), { ok: true });
  });

  it("parses inline JSON token array from env", () => {
    const config = loadControlPlaneAuthConfigFromEnv({
      WORKFLOW_ENGINE_AUTH_TOKENS: '[{"token":"t1","scopes":["start","read_history"]}]',
    });
    assert.equal(config.enabled, true);
    assert.ok(config.tokensByValue.get("t1")?.has("start"));
    assert.ok(config.tokensByValue.get("t1")?.has("read_history"));
  });

  it("extracts bearer token from Authorization header", () => {
    assert.equal(extractBearerToken("Bearer abc.def"), "abc.def");
    assert.equal(extractBearerToken("bearer xyz"), "xyz");
    assert.equal(extractBearerToken("Basic abc"), null);
    assert.equal(extractBearerToken(""), null);
  });

  it("maps MCP tools to the four core scopes", () => {
    assert.equal(TOOL_REQUIRED_SCOPE.workflow_start, "start");
    assert.equal(TOOL_REQUIRED_SCOPE.workflow_resume, "resume");
    assert.equal(TOOL_REQUIRED_SCOPE.workflow_status, "read_history");
    assert.equal(TOOL_REQUIRED_SCOPE.workflow_list, "read_history");
    assert.equal(TOOL_REQUIRED_SCOPE.workflow_submit_activity, "submit_activity");
    assert.equal(TOOL_REQUIRED_SCOPE.workflow_signal, "submit_activity");
    assert.equal(TOOL_REQUIRED_SCOPE.workflow_cancel, "start");
  });

  it("authorizeToolCall rejects missing token when auth enabled", () => {
    const result = authorizeToolCall("workflow_start", null, startAuth);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, MCP_ADAPTER_ERROR.AUTH_ERROR);
    }
  });

  it("authorizeToolCall rejects token without required scope", () => {
    const result = authorizeToolCall("workflow_start", "read-token", readOnlyAuth);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, MCP_ADAPTER_ERROR.AUTH_ERROR);
      assert.match(result.message, /start/);
    }
  });

  it("authorizeToolCall allows token with required scope", () => {
    assert.deepEqual(authorizeToolCall("workflow_status", "read-token", readOnlyAuth), { ok: true });
    assert.deepEqual(authorizeToolCall("workflow_cancel", "start-token", startAuth), { ok: true });
  });

  it("resolveRestRouteScope maps RFC-05 paths to scopes", () => {
    assert.equal(resolveRestRouteScope("POST", "/v1/workflows"), "start");
    assert.equal(resolveRestRouteScope("GET", "/v1/workflows/demo"), "read_history");
    assert.equal(resolveRestRouteScope("POST", "/v1/workflows/demo/executions"), "start");
    assert.equal(resolveRestRouteScope("GET", "/v1/executions/ex-1"), "read_history");
    assert.equal(resolveRestRouteScope("GET", "/v1/executions/ex-1/events"), "read_history");
    assert.equal(resolveRestRouteScope("POST", "/v1/executions/ex-1:resume"), "resume");
    assert.equal(resolveRestRouteScope("POST", "/v1/executions/ex-1:submit_activity"), "submit_activity");
    assert.equal(resolveRestRouteScope("POST", "/v1/executions/ex-1:cancel"), "start");
    assert.equal(resolveRestRouteScope("GET", "/v1/executions/ex-1/checkpoint"), "read_history");
    assert.equal(resolveRestRouteScope("GET", "/v1/unknown"), null);
  });

  it("authorizeRestRequest enforces bearer token on workflow routes", () => {
    const denied = authorizeRestRequest("GET", "/v1/executions/ex-1", null, readOnlyAuth);
    assert.equal(denied.ok, false);
    const allowed = authorizeRestRequest("GET", "/v1/executions/ex-1", "read-token", readOnlyAuth);
    assert.deepEqual(allowed, { ok: true });
    const wrongScope = authorizeRestRequest(
      "POST",
      "/v1/workflows/demo/executions",
      "read-token",
      readOnlyAuth
    );
    assert.equal(wrongScope.ok, false);
  });

  it("parseControlPlaneAuthTokensConfig rejects invalid scope values", () => {
    assert.throws(
      () => parseControlPlaneAuthTokensConfig('[{"token":"t","scopes":["admin"]}]'),
      /invalid scope/
    );
  });

  it("MCP workflow tools return AUTH_ERROR when enforce authContext lacks token", async () => {
    const port = {
      startWorkflow: async () => {
        throw new Error("should not be called");
      },
      getWorkflowStatus: async () => ({}),
      resumeWorkflow: async () => ({}),
      submitWorkflowActivity: async () => ({}),
      signalWorkflow: async () => ({}),
      cancelWorkflow: async () => ({}),
      listWorkflowExecutions: async () => ({ executions: [] }),
    };
    const handlers = createMcpWorkflowToolHandlers(port, { authConfig: startAuth });
    const result = await handlers.workflow_start(
      {
        execution_id: "x",
        definition: {
          document: {
            schema: "https://agent-workflow.dev/schemas/workflow-definition.json",
            name: "auth-test",
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
        },
        input: {},
      },
      { enforce: true }
    );
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /AUTH_ERROR/);
    assert.equal(result.structuredContent.error.code, MCP_ADAPTER_ERROR.AUTH_ERROR);
  });

  it("MCP workflow tools skip auth when enforce is not set (stdio boundary)", async () => {
    let called = false;
    const port = {
      startWorkflow: async () => {
        called = true;
        return { executionId: "x", status: "completed" };
      },
      getWorkflowStatus: async () => ({}),
      resumeWorkflow: async () => ({}),
      submitWorkflowActivity: async () => ({}),
      signalWorkflow: async () => ({}),
      cancelWorkflow: async () => ({}),
      listWorkflowExecutions: async () => ({ executions: [] }),
    };
    const handlers = createMcpWorkflowToolHandlers(port, { authConfig: startAuth });
    const result = await handlers.workflow_start(
      {
        execution_id: "x",
        definition: {
          document: {
            schema: "https://agent-workflow.dev/schemas/workflow-definition.json",
            name: "auth-test",
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
        },
        input: {},
      }
    );
    assert.equal(called, true);
    assert.notEqual(result.isError, true);
  });

  it("authorizeScope allows admin token across scopes", () => {
    for (const scope of ["start", "resume", "read_history", "submit_activity"]) {
      assert.deepEqual(authorizeScope(scope, "admin-token", fullAuth), { ok: true });
    }
  });
});
