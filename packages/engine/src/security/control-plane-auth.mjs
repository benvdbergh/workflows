/**
 * Scoped bearer tokens for workflow control-plane adapters (REST primary; MCP HTTP hook).
 *
 * @see docs/security/mcp-control-plane-auth.md
 * @see docs/architecture/adr/ADR-0005-mcp-control-plane-auth.md
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MCP_ADAPTER_ERROR } from "../adapters/mcp/errors.mjs";

export const WORKFLOW_ENGINE_AUTH_TOKENS_ENV = "WORKFLOW_ENGINE_AUTH_TOKENS";

/** @typedef {"start" | "resume" | "read_history" | "submit_activity"} ControlPlaneScope */

/** @type {readonly ControlPlaneScope[]} */
export const CONTROL_PLANE_SCOPES = ["start", "resume", "read_history", "submit_activity"];

/**
 * MCP tool name → required scope. Control-plane extensions map onto the four core scopes.
 *
 * @type {Record<string, ControlPlaneScope>}
 */
export const TOOL_REQUIRED_SCOPE = {
  workflow_start: "start",
  workflow_resume: "resume",
  workflow_status: "read_history",
  workflow_list: "read_history",
  workflow_submit_activity: "submit_activity",
  /** Signal delivery unblocks wait nodes — same privilege class as activity submit. */
  workflow_signal: "submit_activity",
  /** Cooperative cancel is a lifecycle control action — same privilege class as start. */
  workflow_cancel: "start",
};

/**
 * @typedef {object} ControlPlaneAuthTokenRecord
 * @property {string} token
 * @property {ControlPlaneScope[]} scopes
 */

/**
 * @typedef {object} ControlPlaneAuthTokenEntry
 * @property {Buffer} tokenHash SHA-256 digest of the bearer token (constant-time lookup)
 * @property {Set<ControlPlaneScope>} scopes
 */

/**
 * @typedef {object} ControlPlaneAuthConfig
 * @property {boolean} enabled
 * @property {ControlPlaneAuthTokenEntry[]} tokenEntries
 */

/**
 * @typedef {{ ok: true }} AuthorizeOk
 * @typedef {{ ok: false; code: typeof MCP_ADAPTER_ERROR.AUTH_ERROR | typeof MCP_ADAPTER_ERROR.AUTH_FORBIDDEN; message: string; details?: unknown }} AuthorizeFail
 * @typedef {AuthorizeOk | AuthorizeFail} AuthorizeResult
 */

/**
 * @param {string | null | undefined} headerValue
 * @returns {string | null}
 */
export function extractBearerToken(headerValue) {
  if (headerValue === null || headerValue === undefined || String(headerValue).trim() === "") {
    return null;
  }
  const trimmed = String(headerValue).trim();
  const bearerPrefix = "Bearer";
  if (
    trimmed.length < bearerPrefix.length ||
    trimmed.slice(0, bearerPrefix.length).toLowerCase() !== bearerPrefix.toLowerCase()
  ) {
    return null;
  }
  const afterPrefix = trimmed.slice(bearerPrefix.length);
  const withoutLeadingWs = afterPrefix.trimStart();
  if (withoutLeadingWs.length === 0 || withoutLeadingWs.length === afterPrefix.length) {
    return null;
  }
  const token = withoutLeadingWs.trim();
  return token === "" ? null : token;
}

/**
 * @param {unknown} scope
 * @returns {scope is ControlPlaneScope}
 */
function isControlPlaneScope(scope) {
  return typeof scope === "string" && CONTROL_PLANE_SCOPES.includes(/** @type {ControlPlaneScope} */ (scope));
}

/**
 * @param {unknown} entry
 * @param {number} index
 * @returns {ControlPlaneAuthTokenRecord}
 */
function parseTokenRecord(entry, index) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`${WORKFLOW_ENGINE_AUTH_TOKENS_ENV}[${index}] must be an object with token and scopes`);
  }
  const record = /** @type {{ token?: unknown; scopes?: unknown }} */ (entry);
  if (typeof record.token !== "string" || record.token.trim() === "") {
    throw new Error(`${WORKFLOW_ENGINE_AUTH_TOKENS_ENV}[${index}].token must be a non-empty string`);
  }
  if (!Array.isArray(record.scopes) || record.scopes.length === 0) {
    throw new Error(`${WORKFLOW_ENGINE_AUTH_TOKENS_ENV}[${index}].scopes must be a non-empty array`);
  }
  /** @type {ControlPlaneScope[]} */
  const scopes = [];
  for (const scope of record.scopes) {
    if (!isControlPlaneScope(scope)) {
      throw new Error(
        `${WORKFLOW_ENGINE_AUTH_TOKENS_ENV}[${index}].scopes contains invalid scope "${String(scope)}"`
      );
    }
    if (!scopes.includes(scope)) {
      scopes.push(scope);
    }
  }
  return { token: record.token.trim(), scopes };
}

/**
 * @param {string} raw
 * @param {string} cwd
 * @returns {ControlPlaneAuthTokenRecord[]}
 */
export function parseControlPlaneAuthTokensConfig(raw, cwd = process.cwd()) {
  const trimmed = String(raw).trim();
  if (trimmed === "") {
    return [];
  }
  let text;
  if (trimmed.startsWith("file:")) {
    const rel = trimmed.slice(5).trim();
    if (!rel) {
      throw new Error(`${WORKFLOW_ENGINE_AUTH_TOKENS_ENV} file ref is missing path`);
    }
    const target = path.isAbsolute(rel) ? rel : path.resolve(cwd, rel);
    text = readFileSync(target, "utf8");
  } else if (trimmed.startsWith("[")) {
    text = trimmed;
  } else {
    const target = path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
    text = readFileSync(target, "utf8");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${WORKFLOW_ENGINE_AUTH_TOKENS_ENV} is not valid JSON: ${message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${WORKFLOW_ENGINE_AUTH_TOKENS_ENV} must be a JSON array of { token, scopes } records`);
  }
  return parsed.map((entry, index) => parseTokenRecord(entry, index));
}

/**
 * @param {string} token
 * @returns {Buffer}
 */
function hashToken(token) {
  return createHash("sha256").update(token, "utf8").digest();
}

/**
 * @param {ControlPlaneAuthTokenRecord[]} records
 * @returns {ControlPlaneAuthConfig}
 */
export function buildControlPlaneAuthConfig(records) {
  /** @type {ControlPlaneAuthTokenEntry[]} */
  const tokenEntries = [];
  /** @type {Map<string, number>} */
  const indexByHashHex = new Map();
  for (const record of records) {
    const tokenHash = hashToken(record.token);
    const hashHex = tokenHash.toString("hex");
    const existingIndex = indexByHashHex.get(hashHex);
    if (existingIndex !== undefined) {
      for (const scope of record.scopes) {
        tokenEntries[existingIndex].scopes.add(scope);
      }
      continue;
    }
    indexByHashHex.set(hashHex, tokenEntries.length);
    tokenEntries.push({ tokenHash, scopes: new Set(record.scopes) });
  }
  return {
    enabled: tokenEntries.length > 0,
    tokenEntries,
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [cwd]
 * @returns {ControlPlaneAuthConfig}
 */
export function loadControlPlaneAuthConfigFromEnv(env = process.env, cwd = process.cwd()) {
  const raw = env[WORKFLOW_ENGINE_AUTH_TOKENS_ENV];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return buildControlPlaneAuthConfig([]);
  }
  const records = parseControlPlaneAuthTokensConfig(raw, cwd);
  return buildControlPlaneAuthConfig(records);
}

/**
 * @param {string | null | undefined} token
 * @param {ControlPlaneAuthConfig} authConfig
 * @returns {Set<ControlPlaneScope> | null}
 */
function scopesForToken(token, authConfig) {
  if (!token || token.trim() === "") {
    return null;
  }
  const presentedHash = hashToken(token.trim());
  for (const entry of authConfig.tokenEntries) {
    if (timingSafeEqual(entry.tokenHash, presentedHash)) {
      return entry.scopes;
    }
  }
  return null;
}

/**
 * @param {ControlPlaneScope} requiredScope
 * @param {string | null | undefined} token
 * @param {ControlPlaneAuthConfig} authConfig
 * @returns {AuthorizeResult}
 */
export function authorizeScope(requiredScope, token, authConfig) {
  if (!authConfig.enabled) {
    return { ok: true };
  }
  const granted = scopesForToken(token, authConfig);
  if (!granted) {
    return {
      ok: false,
      code: MCP_ADAPTER_ERROR.AUTH_ERROR,
      message: "Missing or invalid bearer token.",
      details: { reason: "missing_or_invalid" },
    };
  }
  if (!granted.has(requiredScope)) {
    return {
      ok: false,
      code: MCP_ADAPTER_ERROR.AUTH_FORBIDDEN,
      message: `Token lacks required scope "${requiredScope}".`,
      details: {
        reason: "insufficient_scope",
        required_scope: requiredScope,
        granted_scopes: [...granted],
      },
    };
  }
  return { ok: true };
}

/**
 * @param {string} toolName
 * @param {string | null | undefined} token
 * @param {ControlPlaneAuthConfig} authConfig
 * @returns {AuthorizeResult}
 */
export function authorizeToolCall(toolName, token, authConfig) {
  if (!authConfig.enabled) {
    return { ok: true };
  }
  const requiredScope = TOOL_REQUIRED_SCOPE[toolName];
  if (!requiredScope) {
    return {
      ok: false,
      code: MCP_ADAPTER_ERROR.AUTH_ERROR,
      message: `Unknown control-plane tool "${toolName}".`,
    };
  }
  return authorizeScope(requiredScope, token, authConfig);
}

/**
 * Resolve required scope for an RFC-05 REST route. Returns `null` when the route is unknown
 * (caller should emit NOT_FOUND without auth).
 *
 * @param {string} method
 * @param {string} pathname
 * @returns {ControlPlaneScope | null}
 */
export function resolveRestRouteScope(method, pathname) {
  if (method === "POST" && pathname === "/v1/workflows") {
    return "start";
  }
  if (method === "GET" && /^\/v1\/workflows\/[^/]+$/.test(pathname)) {
    return "read_history";
  }
  if (method === "POST" && /^\/v1\/workflows\/[^/]+\/executions$/.test(pathname)) {
    return "start";
  }
  if (method === "GET" && /^\/v1\/executions\/[^/]+$/.test(pathname)) {
    return "read_history";
  }
  if (method === "GET" && /^\/v1\/executions\/[^/]+\/events$/.test(pathname)) {
    return "read_history";
  }
  if (method === "POST" && /^\/v1\/executions\/[^/]+:resume$/.test(pathname)) {
    return "resume";
  }
  if (method === "POST" && /^\/v1\/executions\/[^/]+:submit_activity$/.test(pathname)) {
    return "submit_activity";
  }
  if (method === "POST" && /^\/v1\/executions\/[^/]+:cancel$/.test(pathname)) {
    return "start";
  }
  if (method === "GET" && /^\/v1\/executions\/[^/]+\/checkpoint$/.test(pathname)) {
    return "read_history";
  }
  return null;
}

/**
 * @param {string} method
 * @param {string} pathname
 * @param {string | null | undefined} token
 * @param {ControlPlaneAuthConfig} authConfig
 * @returns {AuthorizeResult}
 */
export function authorizeRestRequest(method, pathname, token, authConfig) {
  const scope = resolveRestRouteScope(method, pathname);
  if (scope === null) {
    return { ok: true };
  }
  return authorizeScope(scope, token, authConfig);
}
