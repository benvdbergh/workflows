/**
 * Keeps `packages/engine/schemas/workflow-definition.json` identical to the
 * repository canonical schema (for npm tarball / no-install MCP).
 *
 * Usage:
 *   node scripts/sync-engine-schema.mjs           — copy root schema into engine package
 *   node scripts/sync-engine-schema.mjs --check — exit 1 if copy is missing or stale
 */
import { copyFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "schemas", "workflow-definition.json");
const destDir = join(root, "packages", "engine", "schemas");
const dest = join(destDir, "workflow-definition.json");

const check = process.argv.includes("--check");

if (!existsSync(src)) {
  console.error(`Missing canonical schema: ${src}`);
  process.exit(1);
}

if (check) {
  if (!existsSync(dest)) {
    console.error("Engine bundled schema missing; run: node scripts/sync-engine-schema.mjs");
    process.exit(1);
  }
  const canonical = readFileSync(src, "utf8");
  const bundled = readFileSync(dest, "utf8");
  if (canonical !== bundled) {
    console.error(
      "packages/engine/schemas/workflow-definition.json is out of date; run: node scripts/sync-engine-schema.mjs"
    );
    process.exit(1);
  }
  console.log("Engine schema bundle is in sync.");
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`Synced schema to ${dest}`);
