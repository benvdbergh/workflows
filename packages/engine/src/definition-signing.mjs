/**
 * Optional workflow definition signing profile (v1 stub).
 *
 * Signed definitions may carry `document.signature` (or top-level `signature` for transitional
 * fixtures). When no signature is present, verification is a no-op. When a signature is
 * present, this module records intent for a future verifier (JWS, Sigstore, or operator PKI)
 * without blocking alpha/POC runs.
 */

/**
 * @typedef {object} DefinitionSignatureBlock
 * @property {string} [alg]
 * @property {string} [value]
 * @property {string} [keyId]
 */

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
 * Verify hook for optional signed definitions. Unsigned definitions always pass.
 *
 * @param {unknown} definition Parsed workflow definition object.
 * @returns {{ ok: true; verified: boolean; signaturePresent: boolean } | { ok: false; error: string }}
 */
export function verifyDefinitionSignature(definition) {
  const signature = extractDefinitionSignature(definition);
  if (!signature) {
    return { ok: true, verified: false, signaturePresent: false };
  }
  // Stub: accept presence without cryptographic verification until v1 profile ships.
  return { ok: true, verified: false, signaturePresent: true };
}
