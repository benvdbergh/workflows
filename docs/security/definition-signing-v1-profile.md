# Definition signing v1 profile

**Status:** Reference engine v1 (BEN-104)  
**Algorithm:** JWS compact serialization with Ed25519 (`EdDSA`) using Node.js built-in `crypto` (no additional npm dependencies).

## Purpose

Signed workflow definitions let operators enforce that only trusted publishers can start or resume executions when deployment policy requires signing. The reference engine verifies signatures at the MCP and REST transport boundaries before `createWorkflowApplicationPort` accepts a definition.

## Signature block

A signed definition carries a signature block on `document.signature` (preferred) or top-level `signature` (transitional):

```json
{
  "document": {
    "schema": "https://agent-workflow.dev/schemas/workflow-definition.json",
    "name": "example",
    "version": "1.0.0",
    "signature": {
      "alg": "EdDSA",
      "value": "<compact-jws>",
      "keyId": "publisher-key-1"
    }
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `alg` | Yes | Must be `"EdDSA"` (Ed25519). |
| `value` | Yes | JWS compact serialization (three base64url segments). |
| `keyId` | No | Selects a configured verification public key; when omitted, all configured keys are tried. |

The signature field is **removed** before JSON Schema validation so alpha schema `additionalProperties: false` on `document` is unchanged.

## Signed payload

The JWS payload is the **canonical JSON** (RFC-03 `canonicalJsonStringify`: lexicographic key sort at every object level, array order preserved) of the full definition object **with the signature block removed** from `document` and from the top level.

Verification recomputes this payload and compares it to the decoded JWS payload segment before Ed25519 signature check.

## JWS compact format

```
BASE64URL({"alg":"EdDSA","typ":"JWS","kid":"..."}) . BASE64URL(payload) . BASE64URL(signature)
```

- **Protected header:** `alg` = `EdDSA`, `typ` = `JWS`, optional `kid` matching `keyId`.
- **Signing input:** ASCII bytes of `protected.payload` (two segments joined by `.`).
- **Signature:** Ed25519 over the signing input (`crypto.sign` / `crypto.verify`).

## Operator verification keys

Set `WORKFLOW_ENGINE_SIGNING_PUBLIC_KEYS` to a JSON object mapping `keyId` → public key material:

| Material | Format |
|----------|--------|
| SPKI DER | Base64url-encoded SubjectPublicKeyInfo (recommended) |
| Raw Ed25519 | Base64url-encoded 32-byte public key |

Inline JSON:

```bash
export WORKFLOW_ENGINE_SIGNING_PUBLIC_KEYS='{"publisher-key-1":"MCowBQYDK2VwAyEA..."}'
```

File ref (relative paths resolve against process cwd):

```bash
export WORKFLOW_ENGINE_SIGNING_PUBLIC_KEYS='file:.config/signing-public-keys.json'
```

A bare filesystem path (without `file:`) is also accepted for backward compatibility with other `WORKFLOW_ENGINE_*` JSON env vars; absolute paths are read as-is.

**Operator trust zone:** Signing key `file:` refs and bare paths resolve relative to cwd and are **not** sandboxed to a base directory. The engine reads whatever path the operator configures (including absolute paths). Activity `secret_ref` `file:` refs are different: they resolve under a configured `baseDir` and cannot escape it. Treat signing key paths as operator-controlled configuration in the host trust zone, not as workflow-supplied secret refs.

## Deployment policy

`WORKFLOW_ENGINE_DEFINITION_SIGNING_MODE`:

| Mode | Behavior |
|------|----------|
| `optional` (default) | Unsigned definitions pass (`verified: false`). Signed definitions must verify when present. |
| `require` | Unsigned definitions are rejected at transport with `VALIDATION_ERROR`. Signed definitions must verify. |

When a signature is present but no public keys are configured, verification fails with a clear error (crypto verify is not skipped).

## API

`verifyDefinitionSignature(definition, options?)` in `@agent-workflow/engine`:

- `options.policy` — `{ mode: "optional" | "require" }`
- `options.publicKeysById` — map of `keyId` → `KeyObject` (or resolve from env via `WORKFLOW_ENGINE_SIGNING_PUBLIC_KEYS`)

MCP stdio and REST entrypoints load policy and keys from env at startup and pass them through `assertValidWorkflowDefinitionAtTransport`.

## Test fixtures

Use `signDefinitionForTest(definition, privateKey)` from `packages/engine/test/helpers/definition-signing-test-helpers.mjs` (test-only; not published API) to generate signed fixtures in unit and conformance tests.

## Related

- [Alpha security baseline](alpha-security-baseline.md)
- [Engine-direct manifest policy](engine-direct-manifest-policy.md)
- `packages/engine/src/definition-signing.mjs`
