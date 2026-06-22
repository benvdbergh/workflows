import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createCompositeSecretResolver,
  createDefaultSecretResolver,
  createEnvSecretResolver,
  createFileSecretResolver,
} from "../src/security/secret-resolver.mjs";

describe("createEnvSecretResolver", () => {
  it("resolves env:VAR refs", async () => {
    const resolver = createEnvSecretResolver({ MY_KEY: "  sk-secret  " });
    const value = await resolver.resolve("env:MY_KEY");
    assert.equal(value, "sk-secret");
  });

  it("throws when env var is missing", async () => {
    const resolver = createEnvSecretResolver({});
    await assert.rejects(() => resolver.resolve("env:MISSING"), /unset or empty/);
  });

  it("rejects non-env refs", async () => {
    const resolver = createEnvSecretResolver({ X: "y" });
    await assert.rejects(() => resolver.resolve("file:x"), /does not support ref/);
  });
});

describe("createFileSecretResolver", () => {
  it("resolves file:relative/path refs", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wf-secret-"));
    writeFileSync(path.join(dir, "key.txt"), "  file-token\n");
    const resolver = createFileSecretResolver(dir);
    const value = await resolver.resolve("file:key.txt");
    assert.equal(value, "file-token");
  });

  it("rejects path traversal", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wf-secret-"));
    const resolver = createFileSecretResolver(dir);
    await assert.rejects(() => resolver.resolve("file:../outside"), /escapes base directory/);
  });

  it("rejects non-file refs", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wf-secret-"));
    const resolver = createFileSecretResolver(dir);
    await assert.rejects(() => resolver.resolve("env:X"), /does not support ref/);
  });
});

describe("createCompositeSecretResolver", () => {
  it("tries providers in order", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wf-secret-"));
    writeFileSync(path.join(dir, "token"), "from-file");
    const resolver = createCompositeSecretResolver([
      createEnvSecretResolver({}),
      createFileSecretResolver(dir),
    ]);
    const value = await resolver.resolve("file:token");
    assert.equal(value, "from-file");
  });

  it("prefers env over file when env matches", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wf-secret-"));
    writeFileSync(path.join(dir, "K"), "from-file");
    const resolver = createCompositeSecretResolver([
      createEnvSecretResolver({ K: "from-env" }),
      createFileSecretResolver(dir),
    ]);
    const value = await resolver.resolve("env:K");
    assert.equal(value, "from-env");
  });
});

describe("createDefaultSecretResolver", () => {
  it("composes env and file providers", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wf-secret-"));
    const resolver = createDefaultSecretResolver({ env: { OPENAI: "ok" }, cwd: dir });
    assert.equal(await resolver.resolve("env:OPENAI"), "ok");
  });
});
