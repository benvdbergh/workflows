# Postflight verification

After `release.yml` succeeds:

## npm

```bash
VERSION=0.1.3   # from package.json / tag base
npm view @agent-workflow/engine@${VERSION} version
npm view @agent-workflow/engine dist-tags
```

- [ ] Version resolves on registry
- [ ] `alpha` or `latest` dist-tag points at intended version per cut type

## Documentation

Baseline (`v0.y.z`):

- https://benvdbergh.github.io/workflows/latest/
- https://benvdbergh.github.io/workflows/schemas/${VERSION}/workflow-definition.json

Iteration (`v0.y.z-alpha.N`):

- https://benvdbergh.github.io/workflows/${VERSION}/ (version alias; `latest` unchanged)

## GitHub Release

```bash
gh release view v0.1.3
```

- [ ] Release exists for tag
- [ ] Body includes excerpt from `docs/releases/alpha-release-notes.md`

## Backlog (optional)

- Close or update Linear milestone via `wf-execute` release-close workflow
- Post announcement per `docs/community-launch-playbook.md` when promoting a baseline
