# End-user documentation site (MkDocs Material)

Builds the GitHub Pages site at [https://benvdbergh.github.io/workflows/](https://benvdbergh.github.io/workflows/).

## Prerequisites

- Node.js (repo root `npm ci`)
- Python 3.11+ on PATH (`py -3` on Windows, or set `WORKFLOWS_DOCS_PYTHON`)

`npm run docs:serve` creates a project-local venv at `website/.venv` and installs `website/requirements.txt` automatically.

## Local development

```bash
npm run docs:serve
```

Opens MkDocs at `http://localhost:8000`.

## Build only

```bash
npm run docs:build
```

Output: `website/site/` (relative to the `website/` MkDocs project directory)

## Source of truth

Canonical prose lives in:

- `docs/user/` — guides
- `docs/whitepaper/` — narrative whitepaper
- `docs/releases/alpha-release-notes.md` — release notes (user sections)
- `schemas/workflow-definition.json` — versioned schema copy

`scripts/build-docs-site.mjs` copies these into `website/docs/` before MkDocs runs. **Do not edit `website/docs/` by hand.**

## Publish (maintainers)

1. Enable GitHub Pages: repository **Settings → Pages → Build from branch `gh-pages`** (after first deploy).
2. Trigger **Docs publish (manual)** with `release_ref` set to a release tag (e.g. `v0.1.2`).
3. Use `promote_latest: true` for baseline cuts.

Versioning uses [mike](https://github.com/jimporter/mike).
