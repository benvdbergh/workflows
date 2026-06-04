/**
 * RFC-03 canonical JSON: deterministic serialization for byte-stable hashing.
 * Object keys are sorted lexicographically at every nesting level; arrays preserve order.
 */

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function sortJsonKeysDeep(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonKeysDeep(item));
  }
  /** @type {Record<string, unknown>} */
  const sorted = {};
  for (const key of Object.keys(/** @type {Record<string, unknown>} */ (value)).sort()) {
    sorted[key] = sortJsonKeysDeep(/** @type {Record<string, unknown>} */ (value)[key]);
  }
  return sorted;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJsonStringify(value) {
  return JSON.stringify(sortJsonKeysDeep(value));
}
