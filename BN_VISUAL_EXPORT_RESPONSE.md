# Response to BN Visual-Rendering Export Feasibility Report

Thanks for the report — it's clear and the plan is tractable. Below are answers to your four open questions plus a tightened scope. Please proceed to the pilot implementation after reading.

## Tightened scope (please read first)

We want **the smallest possible export**: nothing more than what is needed to render a static, non-interactive picture of the network's structure. Concretely, for each model we want just:

- **Nodes**: `id`, `name`, `nodeType`, `x`, `y`. Optionally `height` if `customHeight` is set. Optionally `unit` for quantity nodes (so the rendered node can show its unit string, matching the current PNGs).
- **Edges**: `source`, `target`. Nothing else.

Everything else in your proposed schema — `parents`, `distributionType`, round-trip `guiId`, `canvas` defaults — is fine to keep if it's convenient, but is not required. Treat them as optional.

### What we are explicitly NOT taking

- **Edge labels / annotations** (the "Conditional Bias: Expert + Benchmark" text). These ARE visible in both the live GUI and in the PNG screenshots shipped on the website — we checked. So your report's claim that the GUI renders no edge text is wrong, or is true only for the code path you inspected. But either way: **we don't want them**. We're deliberately dropping them from the rendered picture. You don't need to investigate further, and you don't need to export them.
- **Per-node inline previews** (the Beta sparkline / probability-state bars / value+unit blocks inside node boxes). We don't want any inline distribution or data preview inside the nodes on the website. The website's BN view is structural only; quantitative detail lives in the existing tables and Plotly charts elsewhere on the page.
- **The per-node icon buttons** (the blue/green/red edit/delete/view-results icons in each node header). Pure GUI chrome, not wanted.
- **Selection outlines, link-start glow, MC-results icons**, etc. All GUI-interactivity chrome — not wanted.
- **Samples / percentiles / CPT / statistics / states / conditionalParameters**. The website's existing samples and percentiles pipeline covers all quantitative needs. Do not duplicate any of it in this export.

The end goal on our side is a static, zoomable/pannable picture: boxes with node names inside, connected by arrowed lines, laid out at your stored (x, y) positions. That's it.

## Answers to your four open questions

### 1. Edge labels

We confirmed the edge annotations ("Conditional Bias: Expert + Benchmark" and similar) are in fact visible both in the live GUI and in the PNG screenshots currently shipped by the website. So your report is slightly off on this point — they exist, they're just not currently exported in the model JSON. You don't need to debug this further: **we don't want edge labels in the export or in the rendered website view**. Drop them entirely.

### 2. KRI badges / colour coding

Understood — in the GUI source, nodes have no badges or semantic colour coding beyond UI chrome (selection outline, MC-results icon, edit/delete buttons). **None of that is wanted.** The website renders KRI mappings via its own separate "Show KRI Mappings" modal driven by the website's rationales file, so nothing needs to cross the GUI/website boundary here. No badge data to export.

### 3. Inline sparklines

Confirmed: we are NOT asking for inline distribution previews inside the rendered nodes. So the question of where the sparkline data comes from is moot — there are no sparklines in the website's BN view. Node bodies will show only the node name (and unit string for quantity nodes). The existing `public/data/samples/*.json` pipeline continues to feed the other charts on the page; it is not connected to this export.

### 4. Id mapping

No, the website side does not have a pre-built name→id mapping file. **Build the join fresh from `public/data/rationales/<model>.json` in the website repo.** Each entry in that file's `nodes[]` array has both `id` (the website id, e.g. `RM1-cont-3`, `OC1-phishing-cont-3`) and `name` (human-readable string). Match by `name`.

For the pilot (see below), start with RM1, whose rationales file is `public/data/rationales/OC1_SME_Phishing_and_BEC_llm_rationales.json` in the website repo. The full mapping for all 10 models is in `public/data/risk_models_index.json` — each entry's `rationalesFile` field points to the right file.

**Please add a loud validator** that errors if:
- Any node name in the GUI file does not match a node in the website rationales file for that model.
- Any name appears more than once in either side's node list within a single model (would break the join silently).
- Any edge endpoint can't be resolved to a website id.

Human-readable node names should be unique per model in practice, but we want a noisy failure if that ever breaks rather than a silently wrong graph.

## Proposed pilot

Please implement the full pipeline for **RM1 only** first:

1. Write `scripts/export_bn_visual.py` (or equivalent) in your repo. Arguments:
   - `--in <gui_model_json>`
   - `--rationales <website_rationales_json>` (for the name→id join)
   - `--model-id RM1`
   - `--out <output_json>`
2. Run it on `public/models/oc1_phishing_llm_uncertainty.json` (or whichever file is the current canonical source for the OC1 phishing model — please tell us which one you picked and why, since your report mentions a few candidates).
3. Produce `RM1_network.json` with the minimal schema above.
4. Run the three validators described under question 4.
5. Send back: the script, the output file, and the validator log.

Once the pilot file lands in our repo we'll implement the website-side renderer (React Flow + custom node components, no Plotly sparklines since we've dropped inline previews) and confirm it reproduces the network structure cleanly. If that works, scale to the remaining 9 models.

## Things we agreed with in your report

- Your stripped-down JSON schema is close to right — just drop `distributionType` and any per-node statistics/preview fields from it, since we don't render inline previews.
- Use the stored `(x, y)` positions verbatim. Don't run any layout algorithm.
- Keep this export completely separate from the samples/percentiles pipeline. One source of truth per concern.
- Name-based id mapping over opaque-id mapping. Option 1 in your §6.
- Scope estimate looks right; dropping the sparkline work probably knocks a couple of hours off the website-side estimate.

## What we're NOT asking you to do

- Don't add a GUI menu button. The standalone script is sufficient.
- Don't export CPTs, samples, statistics, conditional parameters, or any quantitative data.
- Don't worry about edge labels, node previews, or node icon buttons.
- Don't try to pixel-match the current PNGs — just get the structure right.
