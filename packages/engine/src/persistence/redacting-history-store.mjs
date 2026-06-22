import { redactSecretsInPayload } from "./secret-redaction.mjs";

/** @typedef {import("./types.mjs").HistoryAppendInput} HistoryAppendInput */
/** @typedef {import("./types.mjs").HistoryRow} HistoryRow */
/** @typedef {import("./types.mjs").ExecutionHistoryStore} ExecutionHistoryStore */

/**
 * Decorator that redacts known secret keys in payloads before delegating to the inner store.
 *
 * @implements {ExecutionHistoryStore}
 */
export class RedactingExecutionHistoryStore {
  /**
   * @param {ExecutionHistoryStore} inner
   */
  constructor(inner) {
    this.#inner = inner;
  }

  /** @type {ExecutionHistoryStore} */
  #inner;

  /**
   * @param {string} executionId
   * @param {HistoryAppendInput} input
   * @returns {number}
   */
  append(executionId, input) {
    const redactedPayload = /** @type {Record<string, unknown>} */ (
      redactSecretsInPayload(input.payload)
    );
    return this.#inner.append(executionId, {
      kind: input.kind,
      name: input.name,
      payload: redactedPayload,
    });
  }

  /**
   * @param {string} executionId
   * @param {number} [fromSeq]
   * @param {number} [toSeq]
   * @returns {HistoryRow[]}
   */
  readRange(executionId, fromSeq, toSeq) {
    return this.#inner.readRange(executionId, fromSeq, toSeq);
  }

  /**
   * @param {string} executionId
   * @returns {HistoryRow[]}
   */
  listByExecution(executionId) {
    return this.#inner.listByExecution(executionId);
  }

  /**
   * @param {import("./execution-list-support.mjs").ExecutionListQuery} [query]
   * @returns {import("./execution-list-support.mjs").ExecutionListResult}
   */
  listExecutions(query = {}) {
    if (typeof this.#inner.listExecutions !== "function") {
      throw new Error("ExecutionHistoryStore inner adapter does not implement listExecutions");
    }
    return this.#inner.listExecutions(query);
  }

  /**
   * @returns {ExecutionHistoryStore}
   */
  get inner() {
    return this.#inner;
  }
}
