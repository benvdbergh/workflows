# wf-release skill escalation

## wf-release owns

- Release preflight, tag push gate, postflight verification for `@agent-workflow/engine`.
- Alignment between tag name, `package.json` version, and `alpha-release-notes.md`.
- Break-glass routing to manual release workflows.

## wf-release does not own

- SemVer and commit-convention policy (escalate to **`release-versioning`**).
- Release planning, milestone slicing, carryover (escalate to **`wf-plan`**; execution close to **`wf-execute`**).
- CI/CD workflow design standards (escalate to **`ci-cd-governance`**).
- Feature implementation or PR review routing.

## Typical chain

`wf-plan` (release slice) → feature work via `wf-execute` → **`wf-release`** (preflight → tag → postflight) → optional Linear milestone close via `wf-execute`.

Policy detail: **`release-versioning`** for bump rules; `docs/governance/` for release process and CI/CD map.
