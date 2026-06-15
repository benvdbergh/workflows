#!/usr/bin/env node
/**
 * Copy canonical doc sources into website/docs/ for MkDocs build.
 * Run from repository root: node scripts/build-docs-site.mjs [--version 0.1.2]
 */
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { USER_DOC_FILES } from "./docs-user-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE_DOCS = join(ROOT, "website", "docs");

function parseArgs(argv) {
  const args = { version: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--version" && argv[i + 1]) {
      args.version = argv[++i];
    }
  }
  return args;
}

async function readEngineVersion() {
  const pkg = JSON.parse(await readFile(join(ROOT, "packages", "engine", "package.json"), "utf8"));
  return pkg.version;
}

async function copyFileEnsuringDir(src, dest) {
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
}

async function copyUserDoc(name, destName = name) {
  await copyFileEnsuringDir(join(ROOT, "docs", "user", name), join(SITE_DOCS, destName));
}

function rewriteForMkDocsSite(markdown) {
  const repoBase = "https://github.com/benvdbergh/workflows/blob/main";
  return (
    markdown
      // User docs copied flat into website/docs/
      .replace(/\]\(\.\.\/user\//g, "](")
      // Dev-doc relative links → GitHub
      .replace(/\]\(\.\.\/\.\.\/ROADMAP\.md\)/g, `](${repoBase}/ROADMAP.md)`)
      .replace(/\]\(\.\.\/\.\.\/packages\//g, `](${repoBase}/packages/`)
      .replace(/\]\(\.\.\/engine-profile\.md\)/g, `](${repoBase}/docs/engine-profile.md)`)
      .replace(/\]\(\.\.\/architecture\//g, `](${repoBase}/docs/architecture/`)
      .replace(/\]\(\.\.\/releases\//g, `](${repoBase}/docs/releases/`)
      .replace(/\]\(\.\.\/governance\//g, `](${repoBase}/docs/governance/`)
      .replace(/\]\(\.\.\/README\.md\)/g, `](${repoBase}/docs/README.md)`)
      .replace(/\]\(release-process\.md\)/g, `](${repoBase}/docs/governance/release-process.md)`)
      .replace(/\]\(alpha-versioning-and-release-commit-flow\.md\)/g, `](${repoBase}/docs/governance/alpha-versioning-and-release-commit-flow.md)`)
      .replace(/\]\(\.\.\/research\//g, `](${repoBase}/docs/research/`)
      .replace(/\]\(\.\.\/RFC\//g, `](${repoBase}/docs/RFC/`)
      .replace(/\]\(\.\.\/conformance\//g, `](${repoBase}/conformance/`)
      .replace(/\]\(\.\.\/examples\//g, `](${repoBase}/examples/`)
      .replace(/\]\(\.\.\/schemas\//g, `](${repoBase}/schemas/`)
  );
}

function stripMaintainerSections(markdown) {
  // Changelog is user-facing only; no maintainer tail to strip (see docs/governance/release-process.md).
  return markdown;
}

async function buildIndex(version, engineVersion) {
  const siteBase = "https://benvdbergh.github.io/workflows";
  const content = `# Agent Workflow Protocol

Welcome to the **end-user documentation** for the Agent Workflow Protocol reference engine.

!!! info "Documentation version"
    This build documents engine release **${engineVersion}** (docs version label: \`${version}\`).

## Quick links

- [Getting started](getting-started.md) — validate a workflow and run the lighthouse demo
- [Run with MCP](mcp-operator-guide.md) — wire the engine into your MCP host
- [Author workflows](authoring-workflows.md) — document structure and node types
- [Download schema](schema/index.md) — JSON Schema for workflow definitions
- [Compatibility matrix](compatibility.md) — what the reference engine supports today
- [Whitepaper](whitepaper.md) — narrative protocol overview

## Schema mirror

| Channel | URL |
|---------|-----|
| Latest | [workflow-definition.json](${siteBase}/latest/schemas/${engineVersion}/workflow-definition.json) |
| This version | [workflow-definition.json](schemas/${engineVersion}/workflow-definition.json) |

Canonical \`document.schema\` URI in workflow instances remains \`https://agent-workflow.dev/schemas/workflow-definition.json\` until GA registry publication. The GitHub Pages URLs above are **mirrors** for download and IDE validation.

## Developer documentation

Architecture, RFC normative shards, conformance harness, and release governance live in the [GitHub repository](https://github.com/benvdbergh/workflows/tree/main/docs).

## Status

This is an **alpha** release line (\`@agent-workflow/engine@${engineVersion}\`). Breaking changes may occur before \`1.0.0\`. See [Release notes](release-notes.md) for highlights and limitations.
`;
  await writeFile(join(SITE_DOCS, "index.md"), content);
}

async function buildSchemaPage(version, engineVersion) {
  const siteBase = "https://benvdbergh.github.io/workflows";
  const schemaPath = `schemas/${engineVersion}/workflow-definition.json`;
  const content = `# Schema — download and validate

**Engine version:** \`${engineVersion}\`  
**JSON Schema dialect:** Draft 2020-12

## Download

- [workflow-definition.json](../schemas/${engineVersion}/workflow-definition.json) — bundled schema for this docs version
- [Latest mirror](${siteBase}/latest/${schemaPath}) — rolling \`latest\` channel

## Canonical URI

Workflow instances declare:

\`\`\`json
{
  "document": {
    "schema": "https://agent-workflow.dev/schemas/workflow-definition.json",
    "name": "my-workflow",
    "version": "1.0.0"
  }
}
\`\`\`

The \`document.schema\` URI identifies the protocol profile. \`document.version\` is your workflow definition semver (authoring artifact), not the engine package version.

## Validate locally

From a repository clone:

\`\`\`bash
npm ci
npm run validate-workflows
npm run engine:validate -- path/to/workflow.json
\`\`\`

One-off with ajv-cli (no install):

\`\`\`bash
npx --yes ajv-cli@5 validate -s schemas/workflow-definition.json -d path/to/workflow.json --spec=draft2020
\`\`\`

Download the schema from this site and point your editor JSON Schema support at the local file path.

## jq subset

Switch conditions, \`set_state\`, and output mappings use **jq** expressions. The reference engine implements a documented subset — see [State, jq and reducers](../state-jq-reducers.md).

## Related

- [Compatibility matrix](../compatibility.md) — core vs optional features
- [Node reference](../node-reference.md) — per-type configuration
`;
  await mkdir(join(SITE_DOCS, "schema"), { recursive: true });
  await writeFile(join(SITE_DOCS, "schema", "index.md"), content);
}

async function copySchema(engineVersion) {
  const destDir = join(SITE_DOCS, "schemas", engineVersion);
  await mkdir(destDir, { recursive: true });
  await copyFile(
    join(ROOT, "schemas", "workflow-definition.json"),
    join(destDir, "workflow-definition.json"),
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const engineVersion = args.version ?? (await readEngineVersion());
  const versionLabel = args.version ?? engineVersion;

  await rm(SITE_DOCS, { recursive: true, force: true });
  await mkdir(SITE_DOCS, { recursive: true });

  const userDocs = USER_DOC_FILES;
  for (const doc of userDocs) {
    await copyUserDoc(doc);
  }

  const releaseNotes = stripMaintainerSections(
    await readFile(join(ROOT, "docs", "releases", "alpha-release-notes.md"), "utf8"),
  );
  const releaseHeader = `---
user_doc: true
---

# Release notes

`;
  await writeFile(
    join(SITE_DOCS, "release-notes.md"),
    releaseHeader + rewriteForMkDocsSite(releaseNotes),
  );

  const whitepaper = rewriteForMkDocsSite(
    await readFile(join(ROOT, "docs", "whitepaper", "agent-workflow-protocol.md"), "utf8"),
  );
  await writeFile(join(SITE_DOCS, "whitepaper.md"), whitepaper);

  await copySchema(engineVersion);
  await buildSchemaPage(versionLabel, engineVersion);
  await buildIndex(versionLabel, engineVersion);

  console.error(`Built docs site sources for engine ${engineVersion} → ${relative(ROOT, SITE_DOCS)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
