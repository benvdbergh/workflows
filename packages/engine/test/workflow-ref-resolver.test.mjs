import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, beforeEach, afterEach } from "node:test";
import { findWorkflowRepoRoot } from "../src/validate.mjs";
import {
  clearWorkflowRefs,
  computeWorkflowDefinitionHash,
  registerWorkflowRef,
  resolveWorkflowRef,
  setWorkflowRefFetchImpl,
} from "../src/orchestrator/workflow-ref-resolver.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findWorkflowRepoRoot(__dirname);

function loadJson(rel) {
  return JSON.parse(readFileSync(path.join(repoRoot, rel), "utf8"));
}

describe("workflow-ref-resolver", () => {
  beforeEach(() => {
    clearWorkflowRefs();
    setWorkflowRefFetchImpl(null);
  });

  afterEach(() => {
    clearWorkflowRefs();
    setWorkflowRefFetchImpl(null);
  });

  it("resolves registered workflow_ref", async () => {
    const child = loadJson("examples/r3-unit-tests-child.workflow.json");
    registerWorkflowRef("urn:test:child", child);
    const resolved = await resolveWorkflowRef("urn:test:child");
    assert.equal(resolved.document.name, "r3-unit-tests-child");
  });

  it("honors version_pin on registered refs", async () => {
    const child = loadJson("examples/r3-unit-tests-child.workflow.json");
    const pin = computeWorkflowDefinitionHash(child);
    registerWorkflowRef("urn:test:child", child);
    const resolved = await resolveWorkflowRef("urn:test:child", { versionPin: pin });
    assert.equal(resolved.document.name, "r3-unit-tests-child");
  });

  it("rejects version_pin mismatch on registered refs", async () => {
    const child = loadJson("examples/r3-unit-tests-child.workflow.json");
    registerWorkflowRef("urn:test:child", child);
    await assert.rejects(
      () => resolveWorkflowRef("urn:test:child", { versionPin: "0".repeat(64) }),
      /version_pin mismatch/
    );
  });

  it("fetches HTTP(S) workflow_ref and caches by ref + version_pin", async () => {
    const child = loadJson("examples/r3-unit-tests-child.workflow.json");
    const url = "https://example.test/child.workflow.json";
    const pin = computeWorkflowDefinitionHash(child);
    let fetchCount = 0;

    setWorkflowRefFetchImpl(async (requestedUrl) => {
      assert.equal(requestedUrl, url);
      fetchCount += 1;
      return {
        ok: true,
        async json() {
          return child;
        },
      };
    });

    const first = await resolveWorkflowRef(url, { versionPin: pin });
    const second = await resolveWorkflowRef(url, { versionPin: pin });
    assert.equal(fetchCount, 1);
    assert.equal(first.document.name, "r3-unit-tests-child");
    assert.equal(second.document.name, "r3-unit-tests-child");
  });

  it("rejects HTTP fetch when version_pin does not match payload", async () => {
    const child = loadJson("examples/r3-unit-tests-child.workflow.json");
    const url = "https://example.test/child.workflow.json";

    setWorkflowRefFetchImpl(async () => ({
      ok: true,
      async json() {
        return child;
      },
    }));

    await assert.rejects(
      () => resolveWorkflowRef(url, { versionPin: "f".repeat(64) }),
      /version_pin mismatch/
    );
  });

  it("surfaces HTTP fetch failures", async () => {
    const url = "https://example.test/missing.workflow.json";
    setWorkflowRefFetchImpl(async () => ({ ok: false, status: 404 }));

    await assert.rejects(() => resolveWorkflowRef(url), /fetch failed.*404/);
  });
});
