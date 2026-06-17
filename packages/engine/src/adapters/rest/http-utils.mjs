import { MCP_ADAPTER_ERROR } from "../mcp/errors.mjs";

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {number} [maxBytes]
 * @returns {Promise<unknown>}
 */
export function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error("Request body exceeds maximum allowed size."), { code: MCP_ADAPTER_ERROR.VALIDATION_ERROR }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      const text = Buffer.concat(chunks).toString("utf8");
      if (text.trim() === "") {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(Object.assign(new Error("Request body is not valid JSON."), { code: MCP_ADAPTER_ERROR.VALIDATION_ERROR }));
      }
    });
    req.on("error", reject);
  });
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
export function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * @param {import("node:http").IncomingMessage} req
 */
export function requestPathname(req) {
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.pathname;
}

/**
 * @param {import("node:http").IncomingMessage} req
 */
export function requestQuery(req) {
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.searchParams;
}
