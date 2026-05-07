# Documentation Index

**Last reviewed:** 2026-05-04  
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
- Engine profile (normative subset for the reference engine): [poc-scope.md](poc-scope.md)
- Specification overview: [RFC/rfc-00-overview.md](RFC/rfc-00-overview.md)

## Architecture and Demo Walkthroughs

MCP guides default to **operator setup** (published `@agent-workflow/engine` via `npx`); use **development setup** (local `mcp-stdio-server.mjs`) only when hacking the adapter or engine.

- As-is architecture spine: [architecture/arc42/README.md](architecture/arc42/README.md) (Sections [3 Context](architecture/arc42/03-context-and-scope.md) through [11 Risks](architecture/arc42/11-risks-and-technical-debt.md); runtime rollup in [Section 6 Runtime](architecture/arc42/06-runtime-view.md)).
- Arc42-linked diagrams, demos, runbooks (by theme): [architecture/arc42-assets/README.md](architecture/arc42-assets/README.md)
- As-built architecture diagrams (current implementation viewpoints): [architecture/arc42-assets/diagrams/as-built-views.drawio](architecture/arc42-assets/diagrams/as-built-views.drawio)
- RFC target architecture diagrams (target-state viewpoints): [architecture/arc42-assets/archive/target-state/rfc-target-views.drawio](architecture/arc42-assets/archive/target-state/rfc-target-views.drawio)
- ADR process and index: [architecture/adr/README.md](architecture/adr/README.md)
- ADR-0001 (POC foundation decisions and rationale): [architecture/adr/ADR-0001-poc-foundation-decisions.md](architecture/adr/ADR-0001-poc-foundation-decisions.md)
- Guided MCP host demo: [architecture/arc42-assets/demos/lighthouse-mcp-host-guided-demo-walkthrough.md](architecture/arc42-assets/demos/lighthouse-mcp-host-guided-demo-walkthrough.md)
- Crash/resume replay demo: [architecture/arc42-assets/demos/lighthouse-replay-crash-resume-demo.md](architecture/arc42-assets/demos/lighthouse-replay-crash-resume-demo.md)
- MCP stdio host smoke walkthrough: [architecture/arc42-assets/runbooks/mcp-stdio-host-smoke.md](architecture/arc42-assets/runbooks/mcp-stdio-host-smoke.md)

## Validation and Conformance

- Conformance harness usage: [../conformance/README.md](../conformance/README.md)
- Repository-wide workflow validation script notes: [../README.md#workflow-schema-and-validation](../README.md#workflow-schema-and-validation)

## Planning and Roadmap Artifacts

- Backlog, epics, and stories: [github.com/benvdbergh/workflows](https://github.com/benvdbergh/workflows) (see repository `CONTRIBUTING.md` and `.project-planning.yaml` for Project conventions).
- Spec and architecture governance (design-first): [governance/spec-architecture-governance.md](governance/spec-architecture-governance.md)
- GitHub metadata tracking checklist: [repository-metadata-checklist.md](repository-metadata-checklist.md)
- GitHub project operating model: [releases/github-project-operating-model.md](releases/github-project-operating-model.md)
- Workflow agent skills:
  - [../.claude/skills/wf-plan/](../.claude/skills/wf-plan/)
  - [../.claude/skills/wf-execute/](../.claude/skills/wf-execute/)
  - [../.claude/skills/wf-design/](../.claude/skills/wf-design/)
