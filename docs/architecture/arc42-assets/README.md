# arc42-linked assets (type-based subtrees)

Supplementary architecture material under **`docs/architecture/`**—grouped **by artifact kind**, not by mirroring twelve arc42 section numbers.

The numbered arc42 narratives stay in [`../arc42/`](../arc42/). Cross-link **from those files** into the type-based folders below. **Do not** add `NN-topic/` mirror directories under **`arc42-assets/`**—they duplicate the spine and drift quickly.

## Layout

| Folder | Contents | Typical arc42 cross-links |
|--------|----------|---------------------------|
| [`diagrams/`](./diagrams/as-built-views.drawio) | **As-is** draw.io (`as-built-views.drawio`; pages Context, Deployment, Building block). | §3 — Context, §5 — Building blocks, §7 — Deployment |
| [`demos/`](./demos/) | Hosted walkthroughs and replay/evidence demos (scenario narratives). | §6 — Runtime |
| [`runbooks/`](./runbooks/) | Operator smoke and similar **how-to** procedure docs. | §7 — Deployment, §10 — Quality gates |
| [`contracts/`](./contracts/) | Stable integration-shape docs (e.g. operator manifest JSON). | §8 — Cross-cutting |
| [`archive/target-state/`](./archive/target-state/) | Forward-looking/target-state diagrams (**not** as-is baseline evidence). | Roadmap / design discussions |

**Architecture decisions:** still under [`../adr/`](../adr/) (arc42 §9).

**Convention:** add new prose under **`demos/`**, **`runbooks/`**, or **`contracts/`** based on intent; cite it from the arc42 section Markdown that owns the storyline.
