/**
 * Test-only helpers for generating signed workflow definition fixtures.
 */

import {
  buildDefinitionSigningPayload,
  createEdDsaJwsCompact,
  DEFINITION_SIGNING_ALG,
  importEd25519PrivateKey,
  stripDefinitionSignature,
} from "../../src/definition-signing.mjs";

/** Conformance / unit-test Ed25519 private key (PKCS8 DER, base64url). */
export const TEST_SIGNING_PRIVATE_KEY_PKCS8_B64URL =
  "MC4CAQAwBQYDK2VwBCIEINoeGH3uTJB4vlquXo3VT41lyC_El-h1NOTC-4-Gyk1F";

/** Matching public key (SPKI DER, base64url). */
export const TEST_SIGNING_PUBLIC_KEY_SPKI_B64URL =
  "MCowBQYDK2VwAyEA-_wc6pHan2aD2MyBvmSWwoarQ0EWXjtZ-tr3LF_ujOI";

export const TEST_SIGNING_KEY_ID = "test-key-1";

/**
 * @param {Record<string, unknown>} definition Unsigned workflow definition object.
 * @param {import("node:crypto").KeyObject | string} privateKey
 * @param {{ keyId?: string; signaturePlacement?: "document" | "top-level" }} [options]
 * @returns {Record<string, unknown>}
 */
export function signDefinitionForTest(definition, privateKey, options = {}) {
  const key =
    typeof privateKey === "string" ? importEd25519PrivateKey(privateKey) : privateKey;
  const keyId = options.keyId ?? TEST_SIGNING_KEY_ID;
  const unsigned = stripDefinitionSignature(definition);
  const payload = buildDefinitionSigningPayload(unsigned);
  const jws = createEdDsaJwsCompact(key, payload, keyId);
  const signed = structuredClone(unsigned);
  const block = { alg: DEFINITION_SIGNING_ALG, value: jws, keyId };
  const placement = options.signaturePlacement ?? "document";
  if (placement === "top-level") {
    signed.signature = block;
  } else {
    if (!signed.document || typeof signed.document !== "object") {
      throw new Error("signDefinitionForTest requires document metadata for document.signature placement");
    }
    signed.document = { ...signed.document, signature: block };
  }
  return signed;
}
