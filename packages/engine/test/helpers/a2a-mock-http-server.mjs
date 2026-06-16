import http from "node:http";

/**
 * In-process A2A HTTP mock for tests and conformance (submit → working → completed).
 *
 * Endpoints:
 * - POST /tasks — create task (`{ agent_id, correlation_id, input }`)
 * - GET /tasks/:id — poll status (`submitted` | `working` | `completed` | `failed`)
 */

/**
 * @typedef {object} A2AMockTask
 * @property {string} id
 * @property {string} agentId
 * @property {string} correlationId
 * @property {Record<string, unknown>} input
 * @property {"submitted" | "working" | "completed" | "failed"} status
 * @property {number} pollCount
 * @property {Record<string, unknown>} [output]
 * @property {string} [error]
 */

/**
 * @param {{
 *   workingPolls?: number;
 *   buildOutput?: (task: A2AMockTask) => Record<string, unknown>;
 *   failTaskId?: string;
 *   failError?: string;
 * }} [opts]
 */
export function createA2AMockHttpServer(opts = {}) {
  const workingPolls = opts.workingPolls ?? 1;
  const buildOutput =
    opts.buildOutput ??
    ((task) => {
      const taskText = typeof task.input.task === "string" ? task.input.task : "";
      const patch =
        taskText.length > 0
          ? `// A2A patch for: ${taskText.slice(0, 120)}`
          : "// A2A patch (no task in delegate input)";
      return { patch, delegate_status: "completed" };
    });

  /** @type {Map<string, A2AMockTask>} */
  const tasks = new Map();
  let nextId = 1;

  /** @type {http.Server} */
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "missing or invalid Authorization header" }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/tasks") {
      /** @type {string} */
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid JSON body" }));
          return;
        }
        const agentId = typeof parsed.agent_id === "string" ? parsed.agent_id : "";
        const correlationId = typeof parsed.correlation_id === "string" ? parsed.correlation_id : "";
        const input =
          parsed.input && typeof parsed.input === "object" && !Array.isArray(parsed.input)
            ? /** @type {Record<string, unknown>} */ ({ ...parsed.input })
            : {};
        const id = `a2a-task-${nextId++}`;
        /** @type {A2AMockTask} */
        const task = {
          id,
          agentId,
          correlationId,
          input,
          status: "submitted",
          pollCount: 0,
        };
        tasks.set(id, task);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id, status: task.status }));
      });
      return;
    }

    const taskMatch = url.pathname.match(/^\/tasks\/([^/]+)$/);
    if (req.method === "GET" && taskMatch) {
      const task = tasks.get(taskMatch[1]);
      if (!task) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "task not found" }));
        return;
      }
      task.pollCount += 1;
      if (task.id === opts.failTaskId) {
        task.status = "failed";
        task.error = opts.failError ?? "mock A2A task failed";
      } else if (task.pollCount <= workingPolls) {
        task.status = "working";
      } else {
        task.status = "completed";
        task.output = buildOutput(task);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: task.id,
          status: task.status,
          ...(task.output ? { output: task.output } : {}),
          ...(task.error ? { error: task.error } : {}),
        })
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  /**
   * @returns {Promise<{ baseUrl: string; close: () => Promise<void> }>}
   */
  function listen() {
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("mock A2A server failed to bind"));
          return;
        }
        resolve({
          baseUrl: `http://127.0.0.1:${addr.port}`,
          close: () =>
            new Promise((res, rej) => {
              server.close((err) => (err ? rej(err) : res()));
            }),
        });
      });
    });
  }

  return { listen, tasks };
}
