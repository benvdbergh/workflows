/**
 * Stub: compare arc42 building-block component table (§5.2) to index.mjs named exports.
 * Exits 0 with a drift report on stdout; non-zero only when CHECK_ARC42_EXPORT_DRIFT=fail.
 *
 * Usage:
 *   node scripts/check-arc42-export-drift.mjs
 *   CHECK_ARC42_EXPORT_DRIFT=fail node scripts/check-arc42-export-drift.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const ARC42_COMPONENTS = join(repoRoot, "docs/architecture/arc42/05-building-block-view.md");
const INDEX = join(repoRoot, "packages/engine/src/index.mjs");

/** Tier-1 exports documented in arc42 §5.3 / README (subset for drift signal). */
const EXPECTED_NAMED_EXPORTS = [
  "validateWorkflowDefinition",
  "createWorkflowApplicationPort",
  "runGraphWorkflow",
  "resumeGraphWorkflow",
  "submitActivityOutcome",
  "createMcpWorkflowToolHandlers",
  "createMcpWorkflowStdioServer",
  "validateMcpOperatorManifest",
  "MemoryExecutionHistoryStore",
  "SqliteExecutionHistoryStore",
];

function readNamedExports(indexSource) {
  /** @type {string[]} */
  const names = [];
  const re = /^export\s+(?:\{([^}]+)\}|(?:async\s+)?function\s+(\w+)|const\s+(\w+))/gm;
  let match;
  while ((match = re.exec(indexSource)) !== null) {
    if (match[1]) {
      for (const part of match[1].split(",")) {
        const alias = part.trim().split(/\s+as\s+/i);
        names.push((alias[1] ?? alias[0]).trim());
      }
    } else if (match[2] || match[3]) {
      names.push(match[2] ?? match[3]);
    }
  }
  const exportFrom = [...indexSource.matchAll(/^export\s+\{([^}]+)\}\s+from\s+/gm)];
  for (const m of exportFrom) {
    for (const part of m[1].split(",")) {
      const alias = part.trim().split(/\s+as\s+/i);
      names.push((alias[1] ?? alias[0]).trim());
    }
  }
  const starFrom = [...indexSource.matchAll(/^export\s+\*\s+from\s+["'](.+?)["']/gm)];
  for (const m of starFrom) {
    const modulePath = join(repoRoot, "packages/engine/src", m[1]);
    try {
      const modSource = readFileSync(modulePath, "utf8");
      for (const fn of modSource.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) {
        names.push(fn[1]);
      }
    } catch {
      // ignore unreadable re-export target
    }
  }
  return new Set(names.filter(Boolean));
}

const indexSource = readFileSync(INDEX, "utf8");
const arc42Source = readFileSync(ARC42_COMPONENTS, "utf8");
const exportNames = readNamedExports(indexSource);

const missing = EXPECTED_NAMED_EXPORTS.filter((name) => !exportNames.has(name));
const extra = [...exportNames].filter((name) => !EXPECTED_NAMED_EXPORTS.includes(name));

const report = {
  status: missing.length === 0 ? "ok" : "drift",
  expectedTier1: EXPECTED_NAMED_EXPORTS,
  missingFromIndex: missing,
  extraNamedExportsSample: extra.slice(0, 20),
  arc42TablePresent: /\|\s*\*\*Validation\*\*/.test(arc42Source),
  note: "Stub gate — set CHECK_ARC42_EXPORT_DRIFT=fail to block CI on missing tier-1 exports.",
};

console.log(JSON.stringify(report, null, 2));

if (process.env.CHECK_ARC42_EXPORT_DRIFT === "fail" && missing.length > 0) {
  process.exit(1);
}
