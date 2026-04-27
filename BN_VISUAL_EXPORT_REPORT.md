# BN Visual-Rendering Export — Feasibility Report

**TL;DR.** The GUI is a browser-based Vite/vanilla-JS app (not Qt/Python), and the model files in `public/models/*.json` **already contain every piece of data the website is missing** — full edge set, stored manual (x, y) positions per node, node type, and parents. No new export code is strictly required; a ~30-line Python/JS script to strip the files down is sufficient. The only real deliverable on the GUI side is an id-alignment document, because GUI ids (`node-1754059166117-171`) and website ids (`RM1-cont-3`, `OC1-phishing-tech-ia-1`) don't match.

---

## 1. Source of truth for graph structure

The BN topology lives in `public/models/<model>.json` — one file per model, referenced by `public/models/manifest.json` and also by `risk_models_index.json` (which maps RM1…RM10 to filenames).

Minimal schema (`src/js/networkModel.js` is the runtime model class that hydrates these files; the JSON itself is the canonical persistence format):

```jsonc
{
  "name": "OC1 Phishing - LLM Uplift with Uncertainty",
  "description": "…",
  "timestamp": "2025-11-12T16:27:38.290Z",
  "nodes": [
    {
      "id": "node-1758548793791-1-216",          // opaque, timestamp-based
      "name": "Initial Access",
      "position": { "x": 446.99, "y": 830.39 },
      "nodeType": "continuous" | "probability" | "quantity",
      "description": "…",
      "parents": ["node-1758548241976-4-189", "node-1754059166521-175"],
      "customHeight": 180,                        // optional, node-box height override
      // ---- type-specific payload, NOT needed for visual render ----
      "states": ["True","False"],                  // probability/quantity
      "cpt": { "True|True,…": 1.0, … },            // probability
      "originalCPT": { … },
      "distributionType": "conditionalBeta",       // continuous
      "conditionalParameters": { "Expert 1,None": {mode, low_ci, high_ci, …}, … },
      "sampledValues": [0.62, 0.59, …],
      "statistics": { "mean": 0.56, "variance": 0.039, … },
      "value": 12345, "unit": "$", "expression": "…",  // quantity
      "calculatedResult": …, "conditionalTable": […], "inputMapping": {…}
    }
  ],
  "links": [
    { "source": "node-1758548241976-4-189",
      "target": "node-1758548793791-1-216",
      "linkType": "probability" }
  ]
}
```

- `nodeType`: same three values the website already uses.
- `links[]`: **full edge set**, not just tactic→technique. This is point 1 of what the website brief said was missing — it's already here.
- `parents[]`: redundant with `links` but worth carrying because the GUI reads it directly and ordering matters for CPT column semantics.
- `linkType`: always `"probability"` in the files inspected — treat as cosmetic.

No separate "project" or "save" file — these *are* the save files, written directly by the GUI's Save action.

## 2. Source of truth for layout

**Stored, not computed.** Each node carries `position: {x, y}` in the same JSON, produced by manual dragging in the GUI (`networkController.js` drag handlers write back to `node.position`). Canvas logical size is 8000×6000 (`networkView.js:88`). Observed bounds span roughly x ∈ [0, 2500], y ∈ [400, 1250] for the uncertainty models, i.e. they're already laid out in a sensible ~2500×1000 region. Node box width is a fixed 180 px (CSS + `networkView.js:136`); height is auto unless `customHeight` is set.

**Recommendation: render with the stored positions verbatim** — any generic layout algorithm on the website side will look worse than what's already there.

## 3. Source of truth for rendering

Browser app, vanilla JS, no Python/Qt. `package.json` shows only Vite + chart.js + jstat + mathjs.

- Entry: `src/js/main.js` → `NetworkController` (`src/js/networkController.js`) → `NetworkView` (`src/js/networkView.js`).
- `NetworkView.renderNetwork()` (`networkView.js:76`) is the whole story:
  - Creates one big SVG (`#networkSvg`) for edges only.
  - Edges are plain `<line>` elements with a shared arrowhead `<marker>`, stroke `#334155`, stroke-width 2 (`networkView.js:125-175`). **No edge labels are drawn.** (See §"Note on edge labels" below.)
  - Nodes are HTML `<div class="node">` absolutely positioned at `node.position`, not SVG. Body contents differ by `nodeType`: per-state probability bars for `probability` (`networkView.js:320-375`), a value/unit block for `quantity` (~`:386-430`), and an inline Beta preview `<canvas>` for `conditionalBeta` continuous nodes (~`:482-540`) drawn from `statistics.mean/variance`.
- No visual groupings, KRI badges, or colour coding beyond: selected-node outline, link-start green glow, the edit/delete/view-results icon buttons in the header, and (for quantity nodes with MC results) a small results icon. None of that is part of the "model" — it's pure UI chrome and should not be exported.

### Note on edge labels (brief's point 3)

The website-side brief mentioned edge annotations like `"Conditional Bias: Expert + Benchmark"`. **This string does not appear anywhere in this repo**, and the GUI renderer draws zero edge text — bare `<line>` with an arrowhead, no `<text>` element. The model JSON has no `label`/`annotation` field on links either.

**Question for the website-side agent:** *Can you point to a specific PNG in the website repo where you see "Conditional Bias: Expert + Benchmark" or any other edge text? Paste the file path. If you can't find one, drop point 3 of the "missing in website JSON" list from the brief.* If this turns out to be from a paper figure rather than the GUI screenshots, it should be tracked separately (manual annotation metadata, not an export).

## 4. Export feasibility & proposed schema

**Feasibility: trivial.** The disk JSON is already sufficient; the only concern is file size — the CPT blocks are combinatorial (OC1_Phishing.json is 880 lines purely because of a 2^7 CPT). A render-only export should drop everything a client renderer doesn't need.

Proposed minimal schema (one file per model, ~5–15 KB each):

```jsonc
{
  "modelId": "RM1",
  "name": "OC1 + SME + Phishing and BEC",
  "canvas": { "nodeWidth": 180, "defaultNodeHeight": 120 },
  "nodes": [
    {
      "id": "RM1-cont-ia",                  // <- WEBSITE id, see §6
      "guiId": "node-1758548793791-1-216",   // <- for round-trip debugging; optional
      "name": "Initial Access",
      "nodeType": "continuous",              // continuous | probability | quantity
      "x": 447, "y": 830,
      "height": 180,                         // only if customHeight was set
      "parents": ["RM1-prob-expert", "RM1-prob-bountybench"],
      "distributionType": "conditionalBeta", // optional, drives inline sparkline choice
      "unit": "$"                            // only for quantity nodes, drives label
    }
  ],
  "edges": [
    { "source": "RM1-prob-expert", "target": "RM1-cont-ia" }
    // `label` and `style` fields exist in the schema but will be empty — the
    // GUI never renders labels; add them only if a future spec introduces them.
  ]
}
```

**Per-node inline distribution data: don't duplicate.** The website already has raw MC samples per node per scenario at `public/data/samples/*.json` keyed by website node id. The renderer should look sparklines up there by node id, not embed them in this export. See §"Relationship to the existing samples/percentiles pipeline" below for the rationale.

## 5. Export mechanism

There is no "export BN visual" command today, but there's also no real work to add one. Options, in ascending effort:

- **(Zero-code.)** Copy `public/models/<file>.json` as-is into the website repo. The website code selects the fields it needs. Cost: ~200 KB total for all 10 models. Extra CPT bloat in uncertainty models is ~15 KB each, not a blocker.
- **(30-line script, recommended.)** A Python script under `scripts/export_bn_visual.py`:
  ```
  python scripts/export_bn_visual.py \
      --in public/models/oc1_phishing_llm_uncertainty.json \
      --model-id RM1 \
      --out out/RM1_network.json
  ```
  Reads the file, drops `cpt`/`originalCPT`/`sampledValues`/`conditionalParameters`/`statistics`/`states`, keeps `id`/`name`/`position`/`nodeType`/`parents`/`customHeight`/`unit`, renames links to edges, and applies the id-mapping from §6.
- **(GUI menu button.)** Adding an "Export for Website" menu item would live in `networkController.js` near the existing Save handler and write the same stripped JSON through `Blob` download. ~1 hour if you want a click-to-export UX. Not required.

## 6. Node-id alignment

**They don't match, and nothing in this repo knows about the website ids.** The GUI uses opaque `node-{epoch}-{seq}` ids generated at creation time (e.g. `node-1758548793791-1-216`). The website uses curated ids like `OC1-phishing-cont-3` / `RM1-tech-ia-1` per `json_structure_summary.md` §2. No mapping file exists in the GUI repo.

Practical options, in order of preference:

1. **Map by `name`, not by id.** Node `name`s ("Initial Access", "CyBench", "Risk (Ransom)") are stable, human-edited, and already unique within a model. The export script should join the GUI file with the website's `public/data/rationales/<model>.json` on `name` to produce `website_id` for each node, then write edges in website-id terms. Smallest surface, survives re-saves from the GUI.
2. **Maintain a hand-written `id_map.json` per model** next to the website's rationales. Works but ages poorly — any GUI-side rename or re-create changes the opaque id.
3. **Rename GUI ids to website ids in-place.** Biggest change; CPT keys are state-based so they'd be unaffected, but it's still invasive. Not worth it.

Recommendation: **option 1**. Write the joiner once; feed both sides into it.

## 7. Client-side rendering recommendation

**React Flow** + Plotly for sparklines.

- 30–80 nodes with pre-baked positions and straight arrowed edges is exactly React Flow's happy path. Positions map 1:1 (`position: {x, y}`), built-in zoom/pan, and a custom node component can hold a Plotly sparkline in the body. Bundle cost ~80 KB gzipped.
- Cytoscape.js is more powerful but the value is mostly in its auto-layout and style language; here you want neither. Heavier bundle, stronger opinions on node shape.
- D3-force / Sigma would force re-implementing pan/zoom and node composition, and they don't love fixed-position layouts.
- Plain SVG is viable (the GUI proves it in ~100 lines), but you'd still want zoom/pan infrastructure, which React Flow gives for free.
- Plotly you already load, so reusing it for the per-node distribution preview (seeded from the samples JSON you already ship) is a net zero on bundle size.

Constraint check: 30–80 nodes × a small Plotly sparkline each is fine for latency as long as sparklines render lazily (only when the node is in the viewport, or on click). Out-of-viewport sparklines can be cheaper SVG paths.

## 8. Scope estimate

- **(a) Export script on the GUI side.** 2–3 hours. Includes: writing the stripper, implementing the name→website-id joiner against the website's rationales file, running it for all 10 models, sanity-checking that every edge endpoint lands in the website's id set.
- **(b) Producing the 10 JSON files.** Negligible once (a) exists — one shell loop, ~1 min runtime. ~1 hour end-to-end including spot-checks.
- **(c) Website-side renderer.** ~1–1.5 days of focused work: React Flow integration, custom node components per `nodeType`, edge styling to match the current PNGs, zoom/pan controls, hover/selection states, wiring the Plotly sparkline to the existing `samples/*.json`. Call it 8–12 hours.

Total: **~12–16 hours** of actual implementation time across both repos, assuming id alignment comes through cleanly.

---

## Relationship to the existing samples/percentiles pipeline

The BN-visual export **does not and should not replace** the existing samples/percentiles pipeline. They solve different problems:

- **Samples/percentiles pipeline** (`batch_mc_export.py`) exists so the website can show quantitative results (KDEs, p5/p50/p95 tables, risk numbers) across **three scenarios** (baseline/SOTA/saturated). Those scenarios are produced by running MC with different evidence settings — the raw model JSON can't produce them without re-running MC in the browser, which would duplicate `monteCarloEngine.js`.
- **BN-visual export** just needs topology + positions + node type. It's a picture of the network's structure, scenario-independent.

Merging them would force either (a) the website to run MC in-browser (expensive, duplicates engine code), or (b) the BN export to carry three scenarios' worth of samples (bloat; the "visual" file is then really two files stapled together).

Clean split: BN-visual export is ~5–15 KB per model of pure topology; the sparkline inside each rendered node reads from the **existing** `samples/*.json` by node id. Zero duplication, one source of truth per concern.

---

## Open questions for the website-side agent

1. **Edge labels.** Can you point to a specific PNG in the website repo where "Conditional Bias: Expert + Benchmark" (or any other edge text) is visible? Paste the file path. The GUI renderer draws no edge labels and the model JSON has no `label` field on links, so unless you can show a source PNG, point 3 of the "missing in JSON" list should be dropped.
2. **KRI badges / colour coding.** Same question — is there a real GUI-side screenshot showing these, or was that a hypothetical? Looking at the GUI source, nodes have no badge/colour concept beyond the selected-node outline and the MC-results icon button. If the PNGs in the website repo show badges/colours, they're either from a paper figure or from an older GUI version.
3. **Inline sparklines.** Confirm you're happy with the sparkline reading from the existing `public/data/samples/*.json` by website node id, rather than being embedded in the BN-visual export. (Recommended — avoids duplication.)
4. **Id mapping.** Do you already have a name→website-id mapping anywhere on the website side, or should the join be built fresh from `public/data/rationales/<model>.json` (where the website ids are defined alongside human-readable `name` fields)?
