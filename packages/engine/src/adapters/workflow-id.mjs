import { randomUUID } from "node:crypto";

/**
 * Linear-time slug from workflow document name (lowercase, alphanumeric segments joined by dashes).
 * @param {string} name
 * @returns {string}
 */
export function normalizeWorkflowIdSlug(name) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  let start = 0;
  let end = slug.length;
  while (start < end && slug[start] === "-") {
    start += 1;
  }
  while (end > start && slug[end - 1] === "-") {
    end -= 1;
  }
  return slug.slice(start, end);
}

/**
 * @param {object} definition
 * @returns {string}
 */
export function deriveWorkflowId(definition) {
  const name = definition?.document?.name;
  if (typeof name === "string" && name.trim() !== "") {
    const normalized = normalizeWorkflowIdSlug(name);
    if (normalized !== "") {
      return normalized;
    }
  }
  return randomUUID();
}
