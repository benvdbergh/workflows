# Hand-off: research and verification backlog

**Source:** `docs/analysis-brief.md` (landscape narrative).  
**Rule:** Before publishing as an Internet-Draft or press-facing spec, **re-verify** quantitative and time-bound claims independently.

## Items to verify externally

| Topic | Claim in analysis-brief | Suggested action |
|-------|----------------|------------------|
| MCP scale / downloads | Order-of-magnitude server and SDK download stats | Cite AAIF/LF announcements, package registries, or official posts with date |
| A2A adoption | Org counts, timeline | Google / LF primary sources |
| Framework capabilities | Per-framework feature matrix | Spot-check current docs (version drift) |
| RAND / production failure rate | Referenced statistic | Retrieve exact report citation |
| Product renames / versions | Named SDK and product versions | Confirm current version strings |

## Stable conceptual claims (lower verification urgency)

- MCP as tool-layer standard with broad client support.  
- Gap: portable declarative agent workflow + deterministic replay as **cross-vendor** spec.  
- Temporal-style replay as execution pattern; jq as expression precedent from CNCF Serverless Workflow.

## Hand-off to editors

When merging RFC sections, **soften** or **footnote** any statistic pulled from `analysis-brief.md` unless a secondary source is attached in `docs/rfc-appendix-sources.md` (optional future file).
