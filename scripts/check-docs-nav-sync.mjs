#!/usr/bin/env node
/**
 * Verify website/mkdocs.yml nav includes every USER_DOC_FILES entry.
 * Run: node scripts/check-docs-nav-sync.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { USER_DOC_FILES } from "./docs-user-manifest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const mkdocsPath = join(ROOT, "website", "mkdocs.yml");
const mkdocs = readFileSync(mkdocsPath, "utf8");

const navTargets = new Set();
for (const match of mkdocs.matchAll(/:\s+([^\s#]+\.md)\s*$/gm)) {
  navTargets.add(match[1]);
}

const missing = USER_DOC_FILES.filter((file) => !navTargets.has(file));
if (missing.length > 0) {
  console.error("mkdocs.yml nav is missing user doc entries:");
  for (const file of missing) {
    console.error(`  - ${file}`);
  }
  console.error("\nUpdate website/mkdocs.yml and scripts/docs-user-manifest.mjs together.");
  process.exit(1);
}

console.log(`ok: mkdocs nav includes all ${USER_DOC_FILES.length} user doc files`);
