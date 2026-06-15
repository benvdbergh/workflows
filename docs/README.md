# Developer documentation index

**Last reviewed:** 2026-06-15  
**Audience:** Contributors, engine implementers, and AI agents working in this repository.

End-user documentation (operators, workflow authors, evaluators) is published separately:

**[https://benvdbergh.github.io/workflows/](https://benvdbergh.github.io/workflows/)** — versioned schema, quickstarts, authoring guides, whitepaper.

This index covers **in-repo developer and maintainer material** on GitHub.

---

## Start here (developers)

| Topic | Location |
|-------|----------|
| Repository onboarding | [README.md](../README.md) |
| Engine profile (normative subset) | [engine-profile.md](engine-profile.md) |
| JSON Schema bundle | [schemas/README.md](../schemas/README.md) |
| Engine package API | [packages/engine/README.md](../packages/engine/README.md) |
| Conformance harness | [conformance/README.md](../conformance/README.md) |
| Roadmap | [ROADMAP.md](../ROADMAP.md) |

---

## Architecture

- As-is architecture spine: [architecture/arc42/README.md](architecture/arc42/README.md)
- Arc42-linked assets (diagrams, demos, runbooks): [architecture/arc42-assets/README.md](architecture/arc42-assets/README.md)
- ADR index: [architecture/adr/README.md](architecture/adr/README.md)
- Guided MCP demo: [architecture/arc42-assets/demos/lighthouse-mcp-host-guided-demo-walkthrough.md](architecture/arc42-assets/demos/lighthouse-mcp-host-guided-demo-walkthrough.md)
- MCP smoke runbook: [architecture/arc42-assets/runbooks/mcp-stdio-host-smoke.md](architecture/arc42-assets/runbooks/mcp-stdio-host-smoke.md)

MCP operator quickstart for end users: [docs/user/mcp-operator-guide.md](user/mcp-operator-guide.md) (canonical) → also on [GitHub Pages](https://benvdbergh.github.io/workflows/latest/mcp-operator-guide/).

---

## Normative specification

- RFC overview: [RFC/rfc-00-overview.md](RFC/rfc-00-overview.md)
- Workflow definition schema: [RFC/rfc-03-workflow-definition-schema.md](RFC/rfc-03-workflow-definition-schema.md)
- Execution model: [RFC/rfc-04-execution-model.md](RFC/rfc-04-execution-model.md)
- Integration interfaces: [RFC/rfc-05-integration-interfaces.md](RFC/rfc-05-integration-interfaces.md)
- Security model: [RFC/rfc-07-security-model.md](RFC/rfc-07-security-model.md)

---

## Whitepaper (narrative)

- [whitepaper/agent-workflow-protocol.md](whitepaper/agent-workflow-protocol.md) — readable overview for evaluators and architects (not normative)
- Supporting research: [research/analysis-brief.md](research/analysis-brief.md)

---

## Releases and governance

- Spec and architecture governance: [governance/spec-architecture-governance.md](governance/spec-architecture-governance.md)
- Alpha release notes (changelog): [releases/alpha-release-notes.md](releases/alpha-release-notes.md)
- Versioning and release commit flow: [releases/alpha-versioning-and-release-commit-flow.md](releases/alpha-versioning-and-release-commit-flow.md)
- CI/CD packaging governance: [releases/alpha-ci-cd-packaging-governance.md](releases/alpha-ci-cd-packaging-governance.md)
- Profile model (core vs optional): [releases/profile-model.md](releases/profile-model.md)
- jq conformance subset: [releases/jq-conformance-subset.md](releases/jq-conformance-subset.md)
- Migration alpha → GA: [releases/migration-alpha-to-ga.md](releases/migration-alpha-to-ga.md)
- Linear operating model: [releases/linear-project-operating-model.md](releases/linear-project-operating-model.md)

**Docs publishing:** trigger **Docs publish (manual)** workflow after release tags; see release checklist in alpha-versioning doc.

---

## Security

- Repository policy: [SECURITY.md](../SECURITY.md)
- Alpha security baseline: [security/alpha-security-baseline.md](security/alpha-security-baseline.md)
- Security gap register: [security/security-gap-register.md](security/security-gap-register.md)
- Threat model regression checklist: [security/threat-model-regression-checklist.md](security/threat-model-regression-checklist.md)

---

## Validation and conformance

- Repository-wide validation: `npm run validate-workflows`
- Conformance vectors: [conformance/README.md](../conformance/README.md)
- Example fixtures: [examples/README.md](../examples/README.md)

---

## Agent skills (workflows repo)

- [wf-plan](../.claude/skills/wf-plan/) — planning and Linear backlog
- [wf-design](../.claude/skills/wf-design/) — design framing and readiness
- [wf-execute](../.claude/skills/wf-execute/) — execution hygiene and PR linkage
- [workflow-engine-mcp](../.claude/skills/workflow-engine-mcp/) — MCP authoring and operator flows

---

## Community and planning

- Contributor guide: [CONTRIBUTING.md](../CONTRIBUTING.md)
- Support boundaries: [SUPPORT.md](../SUPPORT.md)
- Community launch playbook: [community-launch-playbook.md](community-launch-playbook.md)
- Linear backlog: [workflows project](https://linear.app/ben-van-den-bergh/project/workflows-a5eb475ff80e/overview)
- GitHub issues: community intake only (not planning backlog)

---

## Local docs site (maintainers)

```bash
pip install -r website/requirements.txt
npm run docs:serve
```

Build without serving: `npm run docs:build`
