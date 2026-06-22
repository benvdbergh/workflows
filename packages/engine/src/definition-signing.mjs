/**
 * Workflow definition signing profile v1 — JWS compact with Ed25519 (EdDSA).
 *
 * @see docs/security/definition-signing-v1-profile.md
 */

import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { canonicalJsonStringify } from "./canonical-json.mjs";

export const DEFINITION_SIGNING_ALG = "EdDSA";
export const DEFINITION_SIGNING_JWS_TYP = "JWS";
export const DEFINITION_SIGNING_MODE_ENV = "WORKFLOW_ENGINE_DEFINITION_SIGNING_MODE";
export const DEFINITION_SIGNING_PUBLIC_KEYS_ENV = "WORKFLOW_ENGINE_SIGNING_PUBLIC_KEYS";

/** Ed25519 SPKI DER prefix for raw 32-byte public keys. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * @typedef {object} DefinitionSignatureBlock
 * @property {string} [alg]
 * @property {string} [value]
 * @property {string} [keyId]
 */

/**
 * @typedef {{ mode: "optional" | "require" }} DefinitionSigningPolicy
 */

/**
 * @typedef {object} VerifyDefinitionSignatureOptions
 * @property {DefinitionSigningPolicy} [policy]
 * @property {Record<string, import("node:crypto").KeyObject>} [publicKeysById]
 * @property {NodeJS.ProcessEnv} [env]
 * @property {string} [cwd]
 */

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function base64UrlEncode(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * @param {string} value
 * @returns {Buffer}
 */
function base64UrlDecode(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}

/**
 * @param {unknown} definition
 * @returns {DefinitionSignatureBlock | undefined}
 */
export function extractDefinitionSignature(definition) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    return undefined;
  }
  const doc = /** @type {{ document?: { signature?: DefinitionSignatureBlock }; signature?: DefinitionSignatureBlock }} */ (
    definition
  );
  if (doc.document?.signature && typeof doc.document.signature === "object") {
    return doc.document.signature;
  }
  if (doc.signature && typeof doc.signature === "object") {
    return doc.signature;
  }
  return undefined;
}

/**
 * @param {unknown} definition
 * @returns {Record<string, unknown>}
 */
export function stripDefinitionSignature(definition) {
  const clone = structuredClone(definition);
  if (!clone || typeof clone !== "object" || Array.isArray(clone)) {
    return /** @type {Record<string, unknown>} */ (clone);
  }
  const record = /** @type {Record<string, unknown> & { document?: Record<string, unknown> }} */ (clone);
  if (record.document && typeof record.document === "object" && !Array.isArray(record.document)) {
    delete record.document.signature;
  }
  delete record.signature;
  return record;
}

/**
 * Canonical signing payload: definition JSON with signature field removed.
 *
 * @param {unknown} definition
 * @returns {string}
 */
export function buildDefinitionSigningPayload(definition) {
  return canonicalJsonStringify(stripDefinitionSignature(definition));
}

/**
 * @param {string | Buffer} keyMaterial Base64url SPKI DER or raw 32-byte Ed25519 public key.
 * @returns {import("node:crypto").KeyObject}
 */
export function importEd25519PublicKey(keyMaterial) {
  const bytes = typeof keyMaterial === "string" ? base64UrlDecode(keyMaterial) : keyMaterial;
  if (bytes.length === 32) {
    return createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, bytes]),
      format: "der",
      type: "spki",
    });
  }
  return createPublicKey({ key: bytes, format: "der", type: "spki" });
}

/**
 * @param {string | Buffer} keyMaterial Base64url PKCS8 DER Ed25519 private key.
 * @returns {import("node:crypto").KeyObject}
 */
export function importEd25519PrivateKey(keyMaterial) {
  const bytes = typeof keyMaterial === "string" ? base64UrlDecode(keyMaterial) : keyMaterial;
  return createPrivateKey({ key: bytes, format: "der", type: "pkcs8" });
}

/**
 * @param {string} raw Env value (inline JSON object or `file:relative/path`).
 * @param {string} cwd
 * @param {string} label
 * @returns {Record<string, string>}
 */
export function parseSigningPublicKeysConfig(raw, cwd, label = DEFINITION_SIGNING_PUBLIC_KEYS_ENV) {
  const trimmed = String(raw).trim();
  if (trimmed === "") {
    return {};
  }
  let text;
  if (trimmed.startsWith("file:")) {
    const rel = trimmed.slice(5).trim();
    if (!rel) {
      throw new Error(`${label} file ref is missing path`);
    }
    const target = path.isAbsolute(rel) ? rel : path.resolve(cwd, rel);
    text = readFileSync(target, "utf8");
  } else if (trimmed.startsWith("{")) {
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
    throw new Error(`${label} is not valid JSON: ${message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object mapping keyId to base64url public key material`);
  }
  /** @type {Record<string, string>} */
  const out = {};
  for (const [keyId, material] of Object.entries(parsed)) {
    if (typeof material !== "string" || material.trim() === "") {
      throw new Error(`${label} entry "${keyId}" must be a non-empty base64url string`);
    }
    out[keyId] = material.trim();
  }
  return out;
}

/**
 * @param {Record<string, string>} keyMap
 * @returns {Record<string, import("node:crypto").KeyObject>}
 */
export function loadPublicKeysFromConfig(keyMap) {
  /** @type {Record<string, import("node:crypto").KeyObject>} */
  const out = {};
  for (const [keyId, material] of Object.entries(keyMap)) {
    out[keyId] = importEd25519PublicKey(material);
  }
  return out;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {DefinitionSigningPolicy}
 */
export function resolveDefinitionSigningPolicyFromEnv(env = process.env) {
  const raw = env[DEFINITION_SIGNING_MODE_ENV];
  if (raw === undefined || String(raw).trim() === "") {
    return { mode: "optional" };
  }
  const mode = String(raw).trim().toLowerCase();
  if (mode === "optional" || mode === "require") {
    return { mode };
  }
  throw new Error(
    `${DEFINITION_SIGNING_MODE_ENV} must be "optional" or "require" (received "${raw}")`
  );
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [cwd]
 * @returns {Record<string, import("node:crypto").KeyObject>}
 */
export function resolveSigningPublicKeysFromEnv(env = process.env, cwd = process.cwd()) {
  const raw = env[DEFINITION_SIGNING_PUBLIC_KEYS_ENV];
  if (raw === undefined || String(raw).trim() === "") {
    return {};
  }
  const keyMap = parseSigningPublicKeysConfig(raw, cwd);
  return loadPublicKeysFromConfig(keyMap);
}

/**
 * @param {VerifyDefinitionSignatureOptions} [options]
 * @returns {{ policy: DefinitionSigningPolicy; publicKeysById: Record<string, import("node:crypto").KeyObject> }}
 */
export function resolveDefinitionSigningOptions(options = {}) {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const policy = options.policy ?? resolveDefinitionSigningPolicyFromEnv(env);
  const publicKeysById =
    options.publicKeysById ??
    (env[DEFINITION_SIGNING_PUBLIC_KEYS_ENV]
      ? resolveSigningPublicKeysFromEnv(env, cwd)
      : {});
  return { policy, publicKeysById };
}

/**
 * @param {string} compactJws
 * @param {string} expectedPayload Canonical JSON payload bytes (UTF-8).
 * @param {import("node:crypto").KeyObject} publicKey
 * @param {string} [expectedKeyId] When set, JWS protected header `kid` must match.
 * @returns {{ ok: true } | { ok: false; error: string }}
 */
export function verifyEdDsaJwsCompact(compactJws, expectedPayload, publicKey, expectedKeyId) {
  const parts = String(compactJws).split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "JWS compact serialization must contain three segments" };
  }
  const [protectedB64, payloadB64, signatureB64] = parts;
  let protectedHeader;
  try {
    protectedHeader = JSON.parse(Buffer.from(base64UrlDecode(protectedB64)).toString("utf8"));
  } catch {
    return { ok: false, error: "JWS protected header is not valid JSON" };
  }
  if (protectedHeader?.alg !== DEFINITION_SIGNING_ALG) {
    return {
      ok: false,
      error: `Unsupported JWS alg "${protectedHeader?.alg ?? "missing"}" (expected "${DEFINITION_SIGNING_ALG}")`,
    };
  }
  if (
    protectedHeader?.typ !== undefined &&
    protectedHeader.typ !== DEFINITION_SIGNING_JWS_TYP
  ) {
    return {
      ok: false,
      error: `Unsupported JWS typ "${protectedHeader.typ}" (expected "${DEFINITION_SIGNING_JWS_TYP}")`,
    };
  }
  if (expectedKeyId !== undefined && protectedHeader?.kid !== expectedKeyId) {
    return {
      ok: false,
      error: `JWS protected header kid "${protectedHeader?.kid ?? "missing"}" does not match signature keyId "${expectedKeyId}"`,
    };
  }
  const payloadBytes = base64UrlDecode(payloadB64);
  const payloadText = payloadBytes.toString("utf8");
  if (payloadText !== expectedPayload) {
    return { ok: false, error: "JWS payload does not match canonical definition signing payload" };
  }
  const signingInput = `${protectedB64}.${payloadB64}`;
  const signature = base64UrlDecode(signatureB64);
  const valid = verify(null, Buffer.from(signingInput, "ascii"), publicKey, signature);
  if (!valid) {
    return { ok: false, error: "Ed25519 signature verification failed" };
  }
  return { ok: true };
}

/**
 * @param {import("node:crypto").KeyObject} privateKey
 * @param {string} payload Canonical JSON payload.
 * @param {string} [keyId]
 * @returns {string} Compact JWS.
 */
export function createEdDsaJwsCompact(privateKey, payload, keyId) {
  /** @type {Record<string, string>} */
  const header = { alg: DEFINITION_SIGNING_ALG, typ: DEFINITION_SIGNING_JWS_TYP };
  if (keyId) {
    header.kid = keyId;
  }
  const protectedB64 = base64UrlEncode(Buffer.from(JSON.stringify(header), "utf8"));
  const payloadB64 = base64UrlEncode(Buffer.from(payload, "utf8"));
  const signingInput = `${protectedB64}.${payloadB64}`;
  const signature = sign(null, Buffer.from(signingInput, "ascii"), privateKey);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/**
 * @param {string} compactJws
 * @returns {{ ok: true; header: Record<string, unknown> } | { ok: false; error: string }}
 */
function parseJwsProtectedHeader(compactJws) {
  const parts = String(compactJws).split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "JWS compact serialization must contain three segments" };
  }
  try {
    const header = JSON.parse(Buffer.from(base64UrlDecode(parts[0])).toString("utf8"));
    if (!header || typeof header !== "object" || Array.isArray(header)) {
      return { ok: false, error: "JWS protected header is not valid JSON" };
    }
    return { ok: true, header };
  } catch {
    return { ok: false, error: "JWS protected header is not valid JSON" };
  }
}

/**
 * @param {DefinitionSignatureBlock} signature
 * @param {string} payload
 * @param {Record<string, import("node:crypto").KeyObject>} publicKeysById
 * @returns {{ ok: true } | { ok: false; error: string }}
 */
function verifySignatureBlock(signature, payload, publicKeysById) {
  if (signature.alg !== undefined && signature.alg !== DEFINITION_SIGNING_ALG) {
    return {
      ok: false,
      error: `Unsupported signature alg "${signature.alg}" (expected "${DEFINITION_SIGNING_ALG}")`,
    };
  }
  if (typeof signature.value !== "string" || signature.value.trim() === "") {
    return { ok: false, error: "Signature block is missing compact JWS value" };
  }
  const configuredKeyIds = Object.keys(publicKeysById);
  if (configuredKeyIds.length === 0) {
    return { ok: false, error: "Definition signature present but no verification public keys are configured" };
  }

  const parsedHeader = parseJwsProtectedHeader(signature.value);
  if (!parsedHeader.ok) {
    return parsedHeader;
  }
  const jwsKid =
    typeof parsedHeader.header.kid === "string" && parsedHeader.header.kid.trim() !== ""
      ? parsedHeader.header.kid.trim()
      : undefined;

  const definitionKeyId =
    typeof signature.keyId === "string" && signature.keyId.trim() !== ""
      ? signature.keyId.trim()
      : undefined;
  if (definitionKeyId !== undefined && jwsKid !== undefined && definitionKeyId !== jwsKid) {
    return {
      ok: false,
      error: `signature keyId "${definitionKeyId}" does not match JWS protected header kid "${jwsKid}"`,
    };
  }

  const keysToTry =
    jwsKid !== undefined
      ? Object.hasOwn(publicKeysById, jwsKid)
        ? [jwsKid]
        : []
      : configuredKeyIds;

  if (jwsKid !== undefined && keysToTry.length === 0) {
    return { ok: false, error: `Unknown JWS kid "${jwsKid}"` };
  }

  /** @type {string | undefined} */
  let lastVerifyError;
  for (const keyId of keysToTry) {
    const result = verifyEdDsaJwsCompact(
      signature.value,
      payload,
      publicKeysById[keyId],
      jwsKid
    );
    if (result.ok) {
      return result;
    }
    lastVerifyError = result.error;
  }
  return {
    ok: false,
    error: lastVerifyError ?? "Ed25519 signature verification failed for all configured public keys",
  };
}

/**
 * Verify optional or required signed definitions (JWS Ed25519 v1 profile).
 *
 * @param {unknown} definition Parsed workflow definition object.
 * @param {VerifyDefinitionSignatureOptions} [options]
 * @returns {{ ok: true; verified: boolean; signaturePresent: boolean } | { ok: false; error: string }}
 */
export function verifyDefinitionSignature(definition, options = {}) {
  const { policy, publicKeysById } = resolveDefinitionSigningOptions(options);
  const signature = extractDefinitionSignature(definition);

  if (!signature) {
    if (policy.mode === "require") {
      return {
        ok: false,
        error: "Workflow definition signature is required but no signature block was present",
      };
    }
    return { ok: true, verified: false, signaturePresent: false };
  }

  const payload = buildDefinitionSigningPayload(definition);
  const cryptoResult = verifySignatureBlock(signature, payload, publicKeysById);
  if (!cryptoResult.ok) {
    return cryptoResult;
  }
  return { ok: true, verified: true, signaturePresent: true };
}
