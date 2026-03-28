# Data Guide: Populating the SaferAI Risk Dashboard

This guide explains where and how to provide real data to make the dashboard functional. It is written for researchers (or AI agents) who have Bayesian network simulation outputs and need to plug them into the website.

---

## Quick Overview

The website reads all its data from static JSON files in `public/data/`. There is no backend — everything is fetched client-side. To populate the dashboard you need to:

1. Create a **rationales JSON** and a **percentiles JSON** per risk model (required)
2. Optionally create **three samples JSON files** per model (baseline, SOTA, saturated) — enables distribution charts
3. Register each model in the **index file**

---

## 1. The Model Index

**File:** `public/data/risk_models_index.json`

This is the master registry. Every model you want to appear on the landing page must be listed here.

```json
{
  "models": [
    {
      "id": "RM1",
      "name": "OC1 + SME + Phishing and BEC",
      "description": "An OC1-level actor targets a financially attractive SME...",
      "rationalesFile": "rationales/OC1_SME_Phishing_and_BEC_llm_rationales.json",
      "percentilesFile": "percentiles/OC1_SME_Phishing_and_BEC_llm_percentiles.json",
      "baselineSamplesFile": "samples/OC1_SME_Phishing_and_BEC_llm_samples_baseline.json",
      "sotaSamplesFile": "samples/OC1_SME_Phishing_and_BEC_llm_samples_sota.json",
      "saturatedSamplesFile": "samples/OC1_SME_Phishing_and_BEC_llm_samples_saturated.json"
    }
  ]
}
```

| Field | What to put |
|-------|-------------|
| `id` | Short identifier (e.g. `RM1`, `RM2`). Shown as a badge on the landing page. |
| `name` | Human-readable scenario name. Shown in model cards and the selector. |
| `description` | 1–3 sentence scenario summary. Shown on landing page cards and the scenario card. |
| `rationalesFile` | Relative path (from `public/data/`) to the rationales JSON. |
| `percentilesFile` | Relative path to the percentiles JSON. |
| `baselineSamplesFile` | (Optional) Relative path to baseline samples JSON. |
| `sotaSamplesFile` | (Optional) Relative path to SOTA samples JSON. |
| `saturatedSamplesFile` | (Optional) Relative path to saturated samples JSON. |

**Important:** The landing page currently hardcodes which models have data in `src/components/LandingPage.tsx` (line ~12):
```ts
const modelsWithData = new Set(['RM1', 'RM2']);
```
When you add data files for new models, **add their IDs to this set** so the "Load Model" button becomes active.

---

## 2. Rationales File

**Location:** `public/data/rationales/`
**One file per model.** Contains node definitions, per-scenario rationale text, model description, and benchmark mappings.

```json
{
  "modelId": "RM1",
  "modelDescription": "An OC1-level actor targets a financially attractive SME...",
  "benchmarkMappings": {
    "CyBench": ["Reconnaissance", "Initial Access", "Execution"],
    "BountyBench": ["Initial Access", "Privilege Escalation"]
  },
  "nodes": [ ... ]
}
```

| Field | Purpose |
|-------|---------|
| `modelId` | Must match the `id` in the index. |
| `modelDescription` | Full scenario description (shown in the scenario card, overrides the index description). |
| `benchmarkMappings` | (Optional) KRI-to-parameter mappings. If present, a "Show KRI Mappings" button appears in the scenario card. Keys are benchmark names, values are arrays of **node names** (not IDs). |
| `nodes` | Array of node definitions (see below). |

### Node Types

Every variable in the Bayesian network is a node. There are three types.

#### Continuous nodes (MITRE ATT&CK tactics and techniques)

These represent probabilities (0–1 range). Shown in the **Probability Estimates** table.

```json
{
  "id": "RM1-cont-3",
  "name": "Initial Access",
  "nodeType": "continuous",
  "baselineRationale": "The email crafted by the actor passes standard filters for a majority of targets...",
  "sotaRationale": "LLM assistance improves phishing email quality and bypasses more filters...",
  "saturatedRationale": "A fully capable AI generates near-perfect phishing content..."
}
```

#### Technique nodes (children of tactics)

These are continuous nodes with extra fields that nest them under a parent tactic:

```json
{
  "id": "RM1-tech-ia-1",
  "name": "T1566.001 - Spearphishing Attachment",
  "nodeType": "continuous",
  "parentTactic": "RM1-cont-3",
  "combinationMode": "OR",
  "baselineRationale": "Spear-phishing campaigns targeting utility employees...",
  "sotaRationale": "LLM generates more convincing lures...",
  "saturatedRationale": "Fully capable AI creates perfect social engineering..."
}
```

| Field | Purpose |
|-------|---------|
| `parentTactic` | The `id` of the parent continuous (tactic) node. Creates nested drill-down in the Probability table. |
| `combinationMode` | `"AND"`, `"OR"`, or `"XOR"` — how techniques combine into the tactic. AND = all must succeed (probabilities multiply); OR = any one is sufficient and the actor can attempt all (inclusion-exclusion); XOR = only one is needed and the actor can only attempt one (exclusive choice — the actor commits to a single technique). Displayed as a colour-coded connector with an explanation row. |

All technique nodes under the same parent tactic should share the same `combinationMode`.

#### Important: tactic nodes that are broken into techniques

When a tactic is decomposed into techniques, the tactic node is **purely structural** in terms of rationale — it was never directly elicited. However, it still needs correct numerical data:

- **Rationale fields:** Set all three to `""` (empty string). The UI never displays tactic-level rationales when techniques exist — expanding the tactic shows the technique rows instead. **Do not write a summary rationale** — the tactic was not elicited, so there is no rationale to display.
- **Percentiles:** The tactic node **must still have valid percentiles** in the percentiles file. The dashboard does not compute tactic-level percentiles from technique children — it reads them directly from the file. These should be pre-computed from the AND/OR combination of the technique-level simulation outputs (e.g. if your simulation tool outputs tactic-level samples, compute percentiles from those). **Do not set these to 0.0** — the collapsed tactic row displays these values directly, and zeroes will be misleading.
- **Samples:** Same principle — if sample files are provided, include the tactic's simulation samples. These are used for distribution charts.

In short: a tactic broken into techniques has **no rationale text** but **must have valid numerical data** (percentiles and optionally samples).

#### Quantity nodes (computed real-valued outputs)

These represent counts, dollar amounts, rates, etc. Shown in the **Quantity Estimates** or **Impact Estimates** tables (impact if the unit contains "$").

```json
{
  "id": "RM1-qty-1",
  "name": "Number of Actors",
  "nodeType": "quantity",
  "unit": "actors",
  "baselineRationale": "Estimated number of threat actors with sufficient capability...",
  "sotaRationale": "AI lowers barrier to entry, increasing actor count...",
  "saturatedRationale": "Fully capable AI dramatically expands the threat actor pool..."
}
```

The `unit` field is displayed in column headers and chart axes. **A node named exactly `"Total Risk"` with `nodeType: "quantity"` is required** for the Overall Risk Distribution chart. Its samples drive the KDE chart and the Expected Value / 95th Percentile Risk stat cards.

#### Probability nodes (categorical/discrete)

These are benchmark categories. They are **not shown in the estimates tables** but are used internally.

```json
{
  "id": "RM1-prob-1",
  "name": "CyBench",
  "nodeType": "probability",
  "baselineRationale": "",
  "sotaRationale": "",
  "saturatedRationale": ""
}
```

### Rationale Fields

Every node has three rationale fields:

| Field | When shown |
|-------|-----------|
| `baselineRationale` | Shown in the expanded Baseline scenario row |
| `sotaRationale` | Shown in the expanded SOTA scenario row |
| `saturatedRationale` | Shown in the expanded Saturated scenario row |

**These are always strings.** The collapsed table row always shows "Toggle to view rationales" regardless of content. When expanded, each scenario sub-row renders whatever text is in the corresponding field (including nothing if empty).

**When to use empty strings vs explanatory notes:**

- **Tactic broken into techniques:** The tactic's rationale fields should be empty strings (`""`). The UI never displays them — expanding a tactic with techniques shows the technique rows, not the tactic's own scenario rows. The tactic-level rationale is effectively ignored.
- **Not elicited due to high baseline (or other reason):** Use an explanatory note like `"Not elicited due to high baseline probability."` so the user sees why the field is blank when they expand the row.
- **Normally elicited:** Full rationale text.

**Technique-level rationales** are independent per technique, per scenario. There is no aggregation of technique rationales into the tactic level. Each technique's expanded view shows its own Baseline/SOTA/Saturated rationale text.

---

## 3. Percentiles File

**Location:** `public/data/percentiles/`
**One file per model.** Contains pre-computed 5th/50th/95th percentiles for each node across all three scenarios.

```json
{
  "modelId": "RM1",
  "nodes": {
    "RM1-cont-1": {
      "baseline": { "p5": 0.85, "p50": 0.95, "p95": 0.99 },
      "sota": { "p5": 0.90, "p50": 0.97, "p95": 0.995 },
      "saturated": { "p5": 0.92, "p50": 0.98, "p95": 0.999 }
    },
    "RM1-qty-5": {
      "baseline": { "p5": 50000000, "p50": 150000000, "p95": 400000000 },
      "sota": { "p5": 70000000, "p50": 200000000, "p95": 550000000 },
      "saturated": { "p5": 90000000, "p50": 260000000, "p95": 700000000 }
    }
  }
}
```

The `nodes` object maps **node IDs** (matching those in the rationales file) to an object with `baseline`, `sota`, and `saturated` percentile sets. Each set has `p5`, `p50`, `p95`.

Every non-probability node in the rationales file should have a corresponding entry here. If a node ID is missing from percentiles, it will not appear in the tables.

---

## 4. Samples Files (Optional)

**Location:** `public/data/samples/`
**Three files per model** (one per scenario). These enable distribution charts and KDE curves.

```json
{
  "modelId": "RM1",
  "scenario": "baseline",
  "samples": {
    "RM1-cont-1": [0.784, 0.644, 0.879, ...],
    "RM1-qty-5": [52624175.3, 134030538.5, ...]
  }
}
```

| Field | Purpose |
|-------|---------|
| `modelId` | Must match the index. |
| `scenario` | `"baseline"`, `"sota"`, or `"saturated"`. |
| `samples` | Maps node IDs to arrays of numeric samples. Typically 1000 values per node. |

If sample files are not provided (or the fields are omitted from the index), the dashboard degrades gracefully: tables still work (using percentiles), but distribution chart buttons are disabled and the Overall Risk Distribution chart shows a placeholder.

**Continuous nodes:** array of floats, typically in [0, 1].
**Quantity nodes:** array of floats, in whatever unit applies.
**Probability nodes:** not needed in sample files (their samples are strings and are not used by the UI).

---

## 5. Scenarios Explained

Each model has three scenarios with distinct colours:

| Scenario | Colour | Hex | Meaning |
|----------|--------|-----|---------|
| Baseline | Blue | `#2B6CB0` | Current threat landscape without AI assistance |
| SOTA | Purple | `#700C8C` | Threat actors using current best AI capabilities |
| Saturated | Dark forest green | `#2D6A4F` | Threat actors with fully mature/saturated AI tools |

All three files per model should reference the same set of node IDs. The percentiles and samples will differ, reflecting each scenario's assumptions.

---

## 6. Adding a New Risk Model (Step-by-Step)

1. **Run your Bayesian network simulation** three times (baseline, SOTA, saturated), producing percentiles and (optionally) samples per node each time.

2. **Create the rationales file** (`public/data/rationales/{name}_rationales.json`):
   - List all nodes with their IDs, names, types, and per-scenario rationale text
   - Include `benchmarkMappings` if you want the KRI modal
   - Include a `modelDescription`

3. **Create the percentiles file** (`public/data/percentiles/{name}_percentiles.json`):
   - Pre-compute p5/p50/p95 for every non-probability node across all three scenarios

4. **(Optional) Create sample files** (`public/data/samples/{name}_samples_{scenario}.json`):
   - One file each for baseline, sota, saturated
   - Include raw MC samples for every non-probability node

5. **Register in the index** — add an entry to `public/data/risk_models_index.json`

6. **Enable on landing page** — edit `src/components/LandingPage.tsx` and add the model ID to the `modelsWithData` set.

---

## 7. File Tree Summary

```
public/
├── data/
│   ├── risk_models_index.json          ← Model registry
│   ├── rationales/
│   │   ├── OC1_SME_Phishing_and_BEC_llm_rationales.json
│   │   └── OC3_Ransomware_SME_target_human_rationales.json
│   ├── percentiles/
│   │   ├── OC1_SME_Phishing_and_BEC_llm_percentiles.json
│   │   └── OC3_Ransomware_SME_target_human_percentiles.json
│   └── samples/                        ← Optional, enables distribution charts
│       ├── OC1_SME_Phishing_and_BEC_llm_samples_baseline.json
│       ├── OC1_SME_Phishing_and_BEC_llm_samples_sota.json
│       └── OC1_SME_Phishing_and_BEC_llm_samples_saturated.json
├── fonts/
│   ├── SeasonSans-*.woff2             ← Body font
│   └── SeasonSerif-*.woff2            ← Heading font
└── images/
    └── SaferAI_Logo_White_RGB.svg     ← Header logo

src/
├── components/
│   ├── LandingPage.tsx                ← Edit modelsWithData set here
│   ├── ScenarioCard.tsx               ← Shows KRI Mappings button if data present
│   ├── FeedbackButton.tsx             ← Floating feedback link (all pages)
│   ├── ByParameterView.tsx            ← Tree-view parameter selector + cross-model table
│   └── BayesianNetworkPlaceholder.tsx ← Replace with real visualisation
├── hooks/
│   └── useModelData.ts                ← Data loading and processing logic
├── utils/
│   ├── formatters.ts                  ← Number/currency/percentage formatting
│   ├── statistics.ts                  ← Percentile, KDE, summary statistics
│   └── tickFormatter.ts              ← Currency axis tick labels ($X Billion/Million)
└── types/
    └── index.ts                       ← All TypeScript type definitions
```

---

## 8. Troubleshooting

| Symptom | Likely Cause |
|---------|-------------|
| Model card says "Coming Soon" | Model ID not in `modelsWithData` set in `LandingPage.tsx` |
| "Error loading risk model" after clicking Load | Rationales or percentiles JSON file missing, wrong path in index, or malformed JSON |
| Table shows no rows | No `continuous` or `quantity` nodes in rationales file, or node IDs missing from percentiles |
| Distribution chart button disabled | Sample files not provided or not referenced in index |
| Distribution chart is blank | Samples array empty or contains non-numeric values |
| No "Show KRI Mappings" button in scenario card | No `benchmarkMappings` field in the rationales JSON |
| Techniques not nesting under tactics | Missing `parentTactic` field on technique nodes |
| AND/OR/XOR connector not showing | Missing `combinationMode` field on technique nodes |
| Total Risk chart missing | No node with `name: "Total Risk"` and `nodeType: "quantity"` |
| Rationale says "Toggle to view rationales" | This is expected — expand the row to see per-scenario rationales |
| Expanded rationale is empty | Node's `baselineRationale`/`sotaRationale`/`saturatedRationale` field is empty |
