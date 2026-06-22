import assert from "node:assert/strict";
import { sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { MCP_ADAPTER_ERROR } from "../src/adapters/mcp/errors.mjs";
import {
  assertValidWorkflowDefinitionAtTransport,
  validateWorkflowStartTransportPayload,
} from "../src/adapters/mcp/transport-validation.mjs";
import {
  buildDefinitionSigningPayload,
  importEd25519PublicKey,
  loadPublicKeysFromConfig,
  parseSigningPublicKeysConfig,
  resolveDefinitionSigningPolicyFromEnv,
  verifyDefinitionSignature,
  verifyEdDsaJwsCompact,
  createEdDsaJwsCompact,
  importEd25519PrivateKey,
} from "../src/definition-signing.mjs";
import {
  signDefinitionForTest,
  TEST_SIGNING_KEY_ID,
  TEST_SIGNING_PRIVATE_KEY_PKCS8_B64URL,
  TEST_SIGNING_PUBLIC_KEY_SPKI_B64URL,
} from "./helpers/definition-signing-test-helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const minimalDefinition = JSON.parse(
  readFileSync(path.join(repoRoot, "examples/fixtures.valid/minimal-linear.workflow.json"), "utf8")
);

const testPrivateKey = importEd25519PrivateKey(TEST_SIGNING_PRIVATE_KEY_PKCS8_B64URL);
const testPublicKeys = loadPublicKeysFromConfig({
  [TEST_SIGNING_KEY_ID]: TEST_SIGNING_PUBLIC_KEY_SPKI_B64URL,
});

describe("definition signing v1 (JWS Ed25519)", () => {
  it("unsigned definitions pass in optional mode", () => {
    const r = verifyDefinitionSignature(minimalDefinition, {
      policy: { mode: "optional" },
      publicKeysById: testPublicKeys,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.verified, false);
      assert.equal(r.signaturePresent, false);
    }
  });

  it("unsigned definitions fail in require mode", () => {
    const r = verifyDefinitionSignature(minimalDefinition, {
      policy: { mode: "require" },
      publicKeysById: testPublicKeys,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.error, /required/i);
    }
  });

  it("valid signed definition verifies with configured public key", () => {
    const signed = signDefinitionForTest(minimalDefinition, testPrivateKey);
    const r = verifyDefinitionSignature(signed, {
      policy: { mode: "optional" },
      publicKeysById: testPublicKeys,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.verified, true);
      assert.equal(r.signaturePresent, true);
    }
  });

  it("valid signed definition passes require mode", () => {
    const signed = signDefinitionForTest(minimalDefinition, testPrivateKey);
    const r = verifyDefinitionSignature(signed, {
      policy: { mode: "require" },
      publicKeysById: testPublicKeys,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.verified, true);
    }
  });

  it("tampered signature value fails verification", () => {
    const signed = signDefinitionForTest(minimalDefinition, testPrivateKey);
    signed.document.signature.value = signed.document.signature.value.replace(/.$/, "X");
    const r = verifyDefinitionSignature(signed, {
      policy: { mode: "optional" },
      publicKeysById: testPublicKeys,
    });
    assert.equal(r.ok, false);
  });

  it("tampered definition body fails verification", () => {
    const signed = signDefinitionForTest(minimalDefinition, testPrivateKey);
    signed.document.version = "9.9.9";
    const r = verifyDefinitionSignature(signed, {
      policy: { mode: "optional" },
      publicKeysById: testPublicKeys,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.error, /payload/i);
    }
  });

  it("signed definition without configured keys fails", () => {
    const signed = signDefinitionForTest(minimalDefinition, testPrivateKey);
    const r = verifyDefinitionSignature(signed, {
      policy: { mode: "optional" },
      publicKeysById: {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.error, /no verification public keys/i);
    }
  });

  it("unknown JWS kid fails verification", () => {
    const signed = signDefinitionForTest(minimalDefinition, testPrivateKey, { keyId: "missing-key" });
    const r = verifyDefinitionSignature(signed, {
      policy: { mode: "optional" },
      publicKeysById: testPublicKeys,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.error, /Unknown JWS kid/);
    }
  });

  it("missing JWS kid fails verification", () => {
    const signed = signDefinitionForTest(minimalDefinition, testPrivateKey);
    const payload = buildDefinitionSigningPayload(signed);
    signed.document.signature.value = createEdDsaJwsCompact(testPrivateKey, payload);
    const r = verifyDefinitionSignature(signed, {
      policy: { mode: "optional" },
      publicKeysById: testPublicKeys,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.error, /missing required kid/i);
    }
  });

  it("verifies when signature keyId is omitted but JWS kid is present", () => {
    const signed = signDefinitionForTest(minimalDefinition, testPrivateKey);
    delete signed.document.signature.keyId;
    const r = verifyDefinitionSignature(signed, {
      policy: { mode: "optional" },
      publicKeysById: testPublicKeys,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.verified, true);
    }
  });

  it("signature keyId must match JWS protected header kid", () => {
    const signed = signDefinitionForTest(minimalDefinition, testPrivateKey);
    const payload = buildDefinitionSigningPayload(signed);
    signed.document.signature.value = createEdDsaJwsCompact(
      testPrivateKey,
      payload,
      "other-kid-in-jws"
    );
    const r = verifyDefinitionSignature(signed, {
      policy: { mode: "optional" },
      publicKeysById: testPublicKeys,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.error, /signature keyId.*does not match JWS protected header kid/i);
    }
  });

  it("verifyEdDsaJwsCompact rejects unsupported typ in protected header", () => {
    const payload = buildDefinitionSigningPayload(minimalDefinition);
    const validJws = createEdDsaJwsCompact(testPrivateKey, payload, TEST_SIGNING_KEY_ID);
    const [, payloadB64] = validJws.split(".");
    const badHeader = { alg: "EdDSA", typ: "JWT", kid: TEST_SIGNING_KEY_ID };
    const protectedB64 = Buffer.from(JSON.stringify(badHeader), "utf8").toString("base64url");
    const signingInput = `${protectedB64}.${payloadB64}`;
    const signature = sign(null, Buffer.from(signingInput, "ascii"), testPrivateKey);
    const jws = `${signingInput}.${signature.toString("base64url")}`;
    const pub = importEd25519PublicKey(TEST_SIGNING_PUBLIC_KEY_SPKI_B64URL);
    const r = verifyEdDsaJwsCompact(jws, payload, pub);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.error, /Unsupported JWS typ/);
    }
  });

  it("supports top-level signature placement", () => {
    const signed = signDefinitionForTest(minimalDefinition, testPrivateKey, {
      signaturePlacement: "top-level",
    });
    const r = verifyDefinitionSignature(signed, {
      policy: { mode: "optional" },
      publicKeysById: testPublicKeys,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.verified, true);
    }
  });

  it("buildDefinitionSigningPayload excludes signature field", () => {
    const signed = signDefinitionForTest(minimalDefinition, testPrivateKey);
    const payload = buildDefinitionSigningPayload(signed);
    assert.doesNotMatch(payload, /signature/);
    assert.equal(payload, buildDefinitionSigningPayload(minimalDefinition));
  });

  it("verifyEdDsaJwsCompact round-trips with createEdDsaJwsCompact", () => {
    const payload = buildDefinitionSigningPayload(minimalDefinition);
    const jws = createEdDsaJwsCompact(testPrivateKey, payload, TEST_SIGNING_KEY_ID);
    const pub = importEd25519PublicKey(TEST_SIGNING_PUBLIC_KEY_SPKI_B64URL);
    const r = verifyEdDsaJwsCompact(jws, payload, pub);
    assert.equal(r.ok, true);
  });

  it("parseSigningPublicKeysConfig accepts inline JSON", () => {
    const map = parseSigningPublicKeysConfig(
      JSON.stringify({ [TEST_SIGNING_KEY_ID]: TEST_SIGNING_PUBLIC_KEY_SPKI_B64URL }),
      process.cwd()
    );
    assert.equal(Object.keys(map).length, 1);
  });

  it("resolveDefinitionSigningPolicyFromEnv defaults to optional", () => {
    const env = { ...process.env };
    delete env.WORKFLOW_ENGINE_DEFINITION_SIGNING_MODE;
    assert.deepEqual(resolveDefinitionSigningPolicyFromEnv(env), { mode: "optional" });
  });

  it("resolveDefinitionSigningPolicyFromEnv accepts require", () => {
    assert.deepEqual(
      resolveDefinitionSigningPolicyFromEnv({ WORKFLOW_ENGINE_DEFINITION_SIGNING_MODE: "require" }),
      { mode: "require" }
    );
  });

  it("transport validation strips signature before schema check", () => {
    const signed = signDefinitionForTest(minimalDefinition, testPrivateKey);
    assert.doesNotThrow(() =>
      assertValidWorkflowDefinitionAtTransport(signed, {
        signing: { policy: { mode: "optional" }, publicKeysById: testPublicKeys },
      })
    );
  });

  it("transport rejects unsigned definition when policy is require", () => {
    assert.throws(
      () =>
        validateWorkflowStartTransportPayload(minimalDefinition, {}, {
          signing: { policy: { mode: "require" }, publicKeysById: testPublicKeys },
        }),
      (err) => err.code === MCP_ADAPTER_ERROR.VALIDATION_ERROR
    );
  });

  it("transport accepts valid signed definition when policy is require", () => {
    const signed = signDefinitionForTest(minimalDefinition, testPrivateKey);
    assert.doesNotThrow(() =>
      validateWorkflowStartTransportPayload(signed, {}, {
        signing: { policy: { mode: "require" }, publicKeysById: testPublicKeys },
      })
    );
  });
});
