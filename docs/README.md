# Documentation Index

**Last reviewed:** 2026-04-13  
**Review cadence:** at each alpha milestone

This index makes the documentation information architecture explicit:

- Root `README.md`: quick orientation, value proposition, and first-run commands.
- `docs/`: deep reference material, architecture walkthroughs, scope notes, and planning artifacts.

## Start Here

- Alpha release context and caveats: [releases/alpha-release-notes.md](releases/alpha-release-notes.md)
- No-install MCP quickstart and operator publish runbook: [releases/alpha-release-notes.md#no-install-mcp-quickstart-npx](releases/alpha-release-notes.md#no-install-mcp-quickstart-npx)
- Alpha versioning and release commit flow: [releases/alpha-versioning-and-release-commit-flow.md](releases/alpha-versioning-and-release-commit-flow.md)
- Alpha CI/CD packaging governance: [releases/alpha-ci-cd-packaging-governance.md](releases/alpha-ci-cd-packaging-governance.md)
- Community launch playbook and triage SLAs: [community-launch-playbook.md](community-launch-playbook.md)
- Security policy for external reporting: [../SECURITY.md](../SECURITY.md)
- Contributor intake and support boundaries: [../CONTRIBUTING.md](../CONTRIBUTING.md), [../SUPPORT.md](../SUPPORT.md)
- Alpha security baseline posture: [security/alpha-security-baseline.md](security/alpha-security-baseline.md)
- Accepted security gaps register: [security/security-gap-register.md](security/security-gap-register.md)
- POC scope contract: [poc-scope.md](poc-scope.md)
- Specification overview: [RFC/rfc-00-overview.md](RFC/rfc-00-overview.md)

## Architecture and Demo Walkthroughs

MCP guides default to **operator setup** (published `@agent-workflow/engine` via `npx`); use **development setup** (local `mcp-stdio-server.mjs`) only when hacking the adapter or engine.

- Guided MCP host demo: [architecture/lighthouse-mcp-host-guided-demo-walkthrough.md](architecture/lighthouse-mcp-host-guided-demo-walkthrough.md)
- Crash/resume replay demo: [architecture/lighthouse-replay-crash-resume-demo.md](architecture/lighthouse-replay-crash-resume-demo.md)
- MCP stdio host smoke walkthrough: [architecture/mcp-stdio-host-smoke.md](architecture/mcp-stdio-host-smoke.md)

## Validation and Conformance

- Conformance harness usage: [../conformance/README.md](../conformance/README.md)
- Repository-wide workflow validation script notes: [../README.md#poc-schema-and-validation](../README.md#poc-schema-and-validation)

## Planning and Roadmap Artifacts

- Epic tracking: [epics/](epics/)
- Story tracking: [stories/](stories/)
- GitHub metadata tracking checklist: [repository-metadata-checklist.md](repository-metadata-checklist.md)
