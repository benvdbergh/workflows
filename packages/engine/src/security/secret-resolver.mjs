/**
 * Operator-side secret resolution for activity invocation boundaries (RFC-07 §7.3).
 * Ref format: `env:VAR_NAME` or `file:relative/path` (relative to baseDir).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * @typedef {object} SecretResolver
 * @property {(ref: string) => Promise<string>} resolve
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {SecretResolver}
 */
export function createEnvSecretResolver(env = process.env) {
  return {
    async resolve(ref) {
      const trimmed = String(ref).trim();
      if (!trimmed.startsWith("env:")) {
        throw new Error(`env secret resolver does not support ref "${ref}"`);
      }
      const varName = trimmed.slice(4).trim();
      if (!varName) {
        throw new Error(`env secret ref "${ref}" missing variable name`);
      }
      const value = env[varName];
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`env var "${varName}" is unset or empty`);
      }
      return value.trim();
    },
  };
}

/**
 * @param {string} baseDir
 * @returns {SecretResolver}
 */
export function createFileSecretResolver(baseDir) {
  const resolvedBase = path.resolve(baseDir);
  return {
    async resolve(ref) {
      const trimmed = String(ref).trim();
      if (!trimmed.startsWith("file:")) {
        throw new Error(`file secret resolver does not support ref "${ref}"`);
      }
      const rel = trimmed.slice(5).trim();
      if (!rel) {
        throw new Error(`file secret ref "${ref}" missing path`);
      }
      const target = path.resolve(resolvedBase, rel);
      const relative = path.relative(resolvedBase, target);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`file secret ref "${ref}" escapes base directory`);
      }
      const content = readFileSync(target, "utf8");
      const value = content.trim();
      if (value === "") {
        throw new Error(`file secret at "${rel}" is empty`);
      }
      return value;
    },
  };
}

/**
 * @param {SecretResolver[]} resolvers
 * @returns {SecretResolver}
 */
export function createCompositeSecretResolver(resolvers) {
  return {
    async resolve(ref) {
      /** @type {Error | undefined} */
      let lastError;
      for (const resolver of resolvers) {
        try {
          return await resolver.resolve(ref);
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }
      throw lastError ?? new Error(`no secret resolver could resolve ref "${ref}"`);
    },
  };
}

/**
 * Default composite: env provider first, then file provider under `baseDir`.
 *
 * @param {{ env?: NodeJS.ProcessEnv; baseDir?: string; cwd?: string }} [options]
 * @returns {SecretResolver}
 */
export function createDefaultSecretResolver(options = {}) {
  const env = options.env ?? process.env;
  const baseDir = options.baseDir ?? options.cwd ?? process.cwd();
  return createCompositeSecretResolver([createEnvSecretResolver(env), createFileSecretResolver(baseDir)]);
}
