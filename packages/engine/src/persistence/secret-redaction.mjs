/** Keys (case-insensitive) redacted in persisted event/command payloads. */
export const SECRET_PAYLOAD_KEY_NAMES = new Set(["apikey", "token", "password", "secret"]);

export const REDACTED_VALUE = "[REDACTED]";

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isSecretPayloadKey(key) {
  return typeof key === "string" && SECRET_PAYLOAD_KEY_NAMES.has(key.toLowerCase());
}

/**
 * Deep-clones `value` and replaces values at secret key paths with {@link REDACTED_VALUE}.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function redactSecretsInPayload(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecretsInPayload(item));
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, child] of Object.entries(/** @type {Record<string, unknown>} */ (value))) {
    if (isSecretPayloadKey(key)) {
      out[key] = REDACTED_VALUE;
    } else {
      out[key] = redactSecretsInPayload(child);
    }
  }
  return out;
}
