# Alpha Versioning and Final Release Commit Flow

**Last reviewed:** 2026-06-15

This policy keeps alpha releases predictable while the repository remains pre-1.0.

**Operator skill:** `.claude/skills/wf-release/` — preflight, tag push, postflight, and break-glass routing.

## 1) Alpha SemVer policy (`0.y.z`)

- **Current phase:** all public tags stay in `0.y.z` until maintainers explicitly declare `1.0.0` readiness.
- **Pre-1.0 interpretation:** breaking changes do **not** imply `1.0.0`; they are allowed within `0.y.z` per this policy.
- **Bump meaning in alpha:**
  - **`0.(y+1).0` (minor):** breaking or externally significant behavior changes.
  - **`0.y.(z+1)` (patch):** backward-compatible fixes, clarifications, and low-risk non-breaking improvements.
- **Release channels:**
  - **Iteration tags:** `v0.y.z-alpha.N` for candidate cuts and validation rounds.
  - **Alpha baseline tags:** `v0.y.z` when an iteration is accepted as the repo's current alpha baseline.
- **No stable promises yet:** backward compatibility can change between alpha baselines; call out known impacts in release notes.

## 2) Commit convention to bump outcomes

Use Conventional Commits style as release intent hints:

| Commit type | Default release outcome (pre-1.0) | Notes |
|---|---|---|
| `feat` | `minor` bump | New user-visible behavior or capability |
| `fix` | `patch` bump | User-visible defect correction |
| `feat!` / `fix!` / `BREAKING CHANGE:` footer | `minor` bump | Breaking in pre-1.0 stays within `0.y.z` |
| `perf` | `patch` or none | Bump only if externally observable behavior/perf changes |
| `refactor` | none by default | Promote only when behavior changes are externally visible |
| `docs` | none | Documentation-only updates |
| `test` | none | Test-only updates |
| `build` / `ci` / `chore` / `style` | none | Internal-only maintenance work |

If a release contains mixed commit types, choose the highest required bump for included changes.

## 3) Final release commit checklist

Run from repository root before pushing the release tag. Use **`wf-release`** preflight (`references/preflight-checklist.md`) for the full gate list.

1. **Working tree sanity**
   - Confirm intended files only; avoid accidental unrelated changes.
2. **Validation prerequisites**
   - `npm run validate-workflows`
   - `npm run conformance`
3. **Package verification**
   - `npm test`
   - `npm pack --dry-run --workspace @agent-workflow/engine`
   - Confirm `package.json` version matches intended release tag **base** (`v0.1.3-alpha.1` → `0.1.3`).
4. **Documentation and release narrative**
   - Update `docs/releases/alpha-release-notes.md` using the template/process below.
   - Update `docs/user/` when operator or author guidance changes.
   - Record known limitations and any upgrade caveats for consumers.
5. **Merge to `master` and confirm CI**
   - `Validate workflow definitions` must pass on the release commit.
6. **Tag push (human gate → automation)**
   - Create and push annotated tag:
     - iteration: `v0.y.z-alpha.N`
     - accepted alpha baseline: `v0.y.z`
   - Push triggers **`Release (tag)`** workflow (`.github/workflows/release.yml`): quality gates → npm pack artifact → npm publish → docs → GitHub Release.
7. **Postflight**
   - Verify npm, docs URLs, and GitHub Release per `wf-release` postflight checklist.

## 3.1) CI/CD governance references

- Workflow and permissions map: [alpha-ci-cd-packaging-governance.md](alpha-ci-cd-packaging-governance.md)
- Shared quality gate workflow: `.github/workflows/reusable-validate-and-test.yml`
- **Primary tag-triggered release:** `.github/workflows/release.yml`
- Break-glass manual packaging: `.github/workflows/release-packaging.yml`
- Break-glass manual trusted publish: `.github/workflows/release-npm-publish.yml`
- Break-glass manual docs publish: `.github/workflows/docs-publish.yml`
- Maintainer skill: `.claude/skills/wf-release/`

## 4) Release notes and changelog process (repeatable)

### Changelog workflow

For each alpha iteration:

1. Gather merged changes since the previous tag.
2. Group entries by `Added`, `Changed`, `Fixed`, `Docs`, `Internal`.
3. Mark any consumer-impacting changes under `Breaking/Impact Notes`.
4. Publish concise notes in `docs/releases/alpha-release-notes.md`.
5. Link the notes from the release/tag description.

### Template block

Copy this into `docs/releases/alpha-release-notes.md` for each iteration:

```md
## v0.y.z-alpha.N - YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Docs
- ...

### Internal
- ...

### Breaking/Impact Notes
- None.

### Validation run
- `npm run validate-workflows`
- `npm run conformance`
- `npm test`
- `npm pack --dry-run`

### Published URLs
- User docs: `https://benvdbergh.github.io/workflows/latest/`
- Schema mirror: `https://benvdbergh.github.io/workflows/schemas/<engine-version>/workflow-definition.json`
```

## Maintainer decisions to keep explicit

- When to move from iteration tags (`-alpha.N`) to the next accepted baseline (`v0.y.z`).
- Whether any `perf` or `refactor` commits in scope should trigger a patch bump.
- The explicit criteria/date for declaring `1.0.0` readiness.
