/**
 * Node-level orchestration policy helpers (retry backoff and activity timeouts).
 */

/**
 * @param {string} durationString
 * @returns {number}
 */
export function parseDurationMs(durationString) {
  const s = typeof durationString === "string" ? durationString.trim() : "";
  if (!s) {
    throw new Error('duration: expected non-empty duration string (e.g. "500ms", "30s")');
  }
  const m = /^(\d+)\s*(ms|s|m|h)?$/i.exec(s);
  if (!m) {
    throw new Error(`duration: cannot parse duration string "${s}"`);
  }
  const n = Number(m[1]);
  const u = (m[2] || "ms").toLowerCase();
  const mult = u === "h" ? 3_600_000 : u === "m" ? 60_000 : u === "s" ? 1000 : 1;
  return n * mult;
}

/**
 * @param {{ retry?: { max_attempts?: number } }} node
 * @returns {number}
 */
export function resolveMaxAttempts(node) {
  const retry = node?.retry;
  if (retry && typeof retry === "object" && typeof retry.max_attempts === "number" && retry.max_attempts >= 1) {
    return retry.max_attempts;
  }
  return 1;
}

/**
 * @param {{ retry?: object }} node
 * @returns {object | undefined}
 */
export function getRetryPolicy(node) {
  const retry = node?.retry;
  return retry && typeof retry === "object" ? retry : undefined;
}

/**
 * @param {string | undefined} code
 * @param {object | undefined} retryPolicy
 * @returns {boolean}
 */
export function isNonRetryableError(code, retryPolicy) {
  if (!code || !retryPolicy || typeof retryPolicy !== "object") return false;
  const list = retryPolicy.non_retryable_errors;
  if (!Array.isArray(list)) return false;
  return list.includes(code);
}

/**
 * Linear minimum backoff: `initial_interval` (default 0) × `backoff_coefficient`^(attempt−1), capped by `max_interval`.
 *
 * @param {number} attemptNumber 1-based failed attempt before scheduling the next try
 * @param {object | undefined} retryPolicy
 * @returns {number}
 */
export function computeRetryBackoffMs(attemptNumber, retryPolicy) {
  const policy = retryPolicy && typeof retryPolicy === "object" ? retryPolicy : {};
  let initialMs = 0;
  if (typeof policy.initial_interval === "string" && policy.initial_interval.trim()) {
    initialMs = parseDurationMs(policy.initial_interval);
  }
  const coefficient =
    typeof policy.backoff_coefficient === "number" && policy.backoff_coefficient >= 0
      ? policy.backoff_coefficient
      : 1;
  let maxMs = Number.POSITIVE_INFINITY;
  if (typeof policy.max_interval === "string" && policy.max_interval.trim()) {
    maxMs = parseDurationMs(policy.max_interval);
  }
  const backoff = initialMs * coefficient ** (attemptNumber - 1);
  return Math.min(backoff, maxMs);
}

/**
 * @param {number} attempt 1-based attempt that failed
 * @param {number} maxAttempts
 * @param {string | undefined} code
 * @param {object | undefined} retryPolicy
 * @returns {boolean}
 */
export function shouldRetryAfterFailure(attempt, maxAttempts, code, retryPolicy) {
  if (attempt >= maxAttempts) return false;
  if (isNonRetryableError(code, retryPolicy)) return false;
  return true;
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {{ timeout?: string }} node
 * @returns {number | undefined}
 */
export function resolveNodeTimeoutMs(node) {
  const raw = node?.timeout;
  if (typeof raw !== "string" || !raw.trim()) {
    return undefined;
  }
  return parseDurationMs(raw);
}

/**
 * Invokes the activity port, racing against a node-level deadline when `timeoutMs` is set.
 *
 * @param {import("./activity-executor.mjs").ActivityExecutor} executor
 * @param {import("./activity-executor.mjs").ActivityExecutorContext} ctx
 * @param {number | undefined} timeoutMs
 * @returns {Promise<import("./activity-executor.mjs").ActivityExecutorResult>}
 */
export async function executeActivityWithTimeout(executor, ctx, timeoutMs) {
  const ctxWithTimeout = timeoutMs !== undefined ? { ...ctx, timeoutMs } : ctx;
  if (timeoutMs === undefined) {
    return executor.executeActivity(ctxWithTimeout);
  }
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => {
      resolve({ ok: false, error: "Activity timed out", code: "TIMEOUT" });
    }, timeoutMs);
  });
  try {
    return await Promise.race([executor.executeActivity(ctxWithTimeout), timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
