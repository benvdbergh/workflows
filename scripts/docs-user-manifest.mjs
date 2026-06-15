/**
 * Canonical list of end-user guide filenames under docs/user/.
 * Used by build-docs-site.mjs and check-docs-nav-sync.mjs — keep in sync with website/mkdocs.yml nav.
 */
export const USER_DOC_FILES = [
  "getting-started.md",
  "mcp-operator-guide.md",
  "authoring-workflows.md",
  "node-reference.md",
  "state-jq-reducers.md",
  "examples.md",
  "compatibility.md",
  "security-operators.md",
];

/** MkDocs nav entries not copied verbatim from docs/user/ (generated or transformed). */
export const GENERATED_SITE_PAGES = ["index.md", "schema/index.md"];

/** Site pages built from other canonical sources (not in docs/user/). */
export const DERIVED_SITE_PAGES = ["release-notes.md", "whitepaper.md"];
