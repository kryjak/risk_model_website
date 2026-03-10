# Data Guide: Populating the SaferAI Risk Dashboard

This guide explains how to provide data for the dashboard. It is written for researchers (or AI agents) who have Bayesian network simulation outputs and need to plug them into the website.

---

## Quick Overview

The website reads all its data from static JSON files in `public/data/`. There is no backend — everything is fetched client-side. Data is split into **3 purpose-specific file types**:

| File type | Contains | Size | When loaded |
|-----------|----------|------|-------------|
| **Rationales** | Node metadata, per-scenario rationale strings, benchmark mappings | ~5–9 KB | Always (on model select) |
| **Percentiles** | User-supplied p5/p50/p95 for all 3 scenarios | ~5–8 KB | Always (on model select) |
| **Samples** | Raw Monte Carlo samples for KDE distribution charts | ~250–350 KB each | Optional (for distribution charts) |

To add a new model you need to:
1. Create **1 rationales file** (shared across scenarios)
2. Create **1 percentiles file** (all 3 scenarios in one file)
3. Optionally create **3 samples files** (one per scenario)
4. Register the model in the **index file**

---

## 1. The Model Index

**File:** `public/data/risk_models_index.json`

This is the master registry. Every model you want to appear on the landing page must be listed here.

```json
{
  "models": [
    {
      "id": "RM1",
      "name": "OC4 + Infrastructure (small) + Disruption",
      "description": "State-sponsored APT targeting regional power utilities...",
      "rationalesFile": "rationales/RM1_rationales.json",
      "percentilesFile": "percentiles/RM1_percentiles.json",
      "baselineSamplesFile": "samples/RM1_samples_baseline.json",
      "sotaSamplesFile": "samples/RM1_samples_sota.json",
      "saturatedSamplesFile": "samples/RM1_samples_saturated.json"
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
| `baselineSamplesFile` | *(Optional)* Relative path to baseline samples. |
| `sotaSamplesFile` | *(Optional)* Relative path to SOTA samples. |
| `saturatedSamplesFile` | *(Optional)* Relative path to saturated samples. |

When samples files are omitted, the dashboard still displays tables and percentiles — the distribution chart button is simply hidden.

**Important:** The landing page currently hardcodes which models have data in `src/components/LandingPage.tsx` (line ~12):
```ts
const modelsWithData = new Set(['RM1', 'RM2']);
```
When you add data files for a new model, **add its ID to this set** so the "Load Model" button becomes active.

---

## 2. Rationales File

**Location:** `public/data/rationales/`
**Naming:** `{ModelID}_rationales.json`
**Example:** `RM1_rationales.json`

One file per model, shared across all scenarios. Contains node metadata and per-scenario rationale strings.

```json
{
  "modelId": "RM1",
  "modelDescription": "State-sponsored APT targeting regional power utilities...",
  "benchmarkMappings": {
    "CyBench": ["Reconnaissance", "Initial Access", "Execution"]
  },
  "nodes": [
    {
      "id": "RM1-cont-3",
      "name": "Initial Access",
      "nodeType": "continuous",
      "baselineRationale": "Probability of initial access under current threat landscape...",
      "sotaRationale": "With SOTA AI tools, phishing detection bypass rates increase...",
      "saturatedRationale": "Full AI saturation enables automated exploit generation..."
    },
    {
      "id": "RM1-qty-1",
      "name": "Number of Actors",
      "nodeType": "quantity",
      "unit": "actors",
      "baselineRationale": "Based on OSINT analysis of active threat groups...",
      "sotaRationale": "AI lowers barriers to entry, increasing actor count...",
      "saturatedRationale": "Maximum projected actor pool with fully accessible AI..."
    },
    {
      "id": "RM1-tech-ia-1",
      "name": "Phishing",
      "nodeType": "continuous",
      "parentTactic": "RM1-cont-3",
      "combinationMode": "OR",
      "baselineRationale": "Spear-phishing campaigns targeting utility employees...",
      "sotaRationale": "AI-generated phishing content with improved social engineering...",
      "saturatedRationale": "Fully automated, personalized phishing at scale..."
    }
  ]
}
```

### Node fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (must match across percentiles and samples files). |
| `name` | Yes | Display name shown in tables. |
| `nodeType` | Yes | `"continuous"` (probabilities), `"quantity"` (counts/dollars), or `"probability"` (categorical — skipped by tables). |
| `unit` | For quantity | Unit string (e.g. `"actors"`, `"$ / year"`). If it contains `$`, the node appears in Impact Estimates. |
| `parentTactic` | For techniques | The `id` of the parent tactic node. Creates nested drill-down in tables. |
| `combinationMode` | For techniques | `"AND"` or `"OR"` — how techniques combine into the tactic. |
| `baselineRationale` | Yes | Rationale text for the baseline scenario. Supports markdown: `**bold**`, `*italic*`, `[link](url)`. |
| `sotaRationale` | Yes | Rationale text for the SOTA scenario. |
| `saturatedRationale` | Yes | Rationale text for the saturated scenario. |

### Benchmark mappings

The `benchmarkMappings` field is optional. When present, a "Show KRI Mappings" button appears in the scenario card, opening a modal listing Key Risk Indicators.

Keys are benchmark/KRI names. Values are arrays of **node names** (not IDs).

---

## 3. Percentiles File

**Location:** `public/data/percentiles/`
**Naming:** `{ModelID}_percentiles.json`

One file per model containing all 3 scenarios' percentiles. These are the **source of truth** for the table values displayed in the dashboard.

```json
{
  "modelId": "RM1",
  "nodes": {
    "RM1-cont-3": {
      "baseline": { "p5": 0.12, "p50": 0.35, "p95": 0.67 },
      "sota":     { "p5": 0.18, "p50": 0.48, "p95": 0.79 },
      "saturated":{ "p5": 0.25, "p50": 0.61, "p95": 0.88 }
    },
    "RM1-qty-1": {
      "baseline": { "p5": 15, "p50": 33, "p95": 68 },
      "sota":     { "p5": 20, "p50": 45, "p95": 95 },
      "saturated":{ "p5": 30, "p50": 60, "p95": 120 }
    }
  }
}
```

`nodes` is a `Record<nodeId, { baseline, sota, saturated }>` where each scenario has `p5`, `p50`, `p95`.

**Important:** You can supply these directly from expert elicitation — they do not need to be computed from samples.

---

## 4. Samples Files (Optional)

**Location:** `public/data/samples/`
**Naming:** `{ModelID}_samples_{scenario}.json`
**Example:** `RM1_samples_baseline.json`, `RM1_samples_sota.json`, `RM1_samples_saturated.json`

One file per scenario. Only needed for KDE distribution chart overlays.

```json
{
  "modelId": "RM1",
  "scenario": "baseline",
  "samples": {
    "RM1-cont-3": [0.31, 0.45, 0.22, 0.55, ...],
    "RM1-qty-1": [33.9, 51.9, 39.3, ...],
    "RM1-qty-5": [52624175.3, 134030538.5, ...]
  }
}
```

- `samples` is a `Record<nodeId, number[]>` — numeric arrays only (no strings).
- Typically 1000 samples per node. More samples = smoother KDE curves.
- Continuous nodes: floats in [0, 1].
- Quantity nodes: floats in their natural units.

### Graceful degradation

When samples files are absent (or their paths omitted from the index):
- Tables display percentiles normally (from the percentiles file).
- Rationales display normally.
- The distribution chart button is **hidden** for all parameters.
- The Total Risk Distribution chart at the top is hidden.

---

## 5. Scenarios Explained

Each model has three scenarios with distinct colours:

| Scenario | Colour | Hex | Meaning |
|----------|--------|-----|---------|
| Baseline | Blue | `#5B86B5` | Current threat landscape without AI assistance |
| SOTA | Purple | `#700C8C` | Threat actors using current best AI capabilities |
| Saturated | Teal | `#5B7B7A` | Threat actors with fully mature/saturated AI tools |

The percentiles file contains all 3 scenarios. Each rationale node has 3 separate rationale strings (one per scenario), allowing you to explain the reasoning behind each scenario's estimates independently.

---

## 6. Adding a New Risk Model (Step-by-Step)

1. **Create the rationales file** at `public/data/rationales/RM3_rationales.json`:
   - List all nodes with per-scenario rationale strings.
   - Include benchmark mappings if available.
   - A node named `"Total Risk"` with `nodeType: "quantity"` is needed for the overall risk chart.

2. **Create the percentiles file** at `public/data/percentiles/RM3_percentiles.json`:
   - Provide p5/p50/p95 for each node under each scenario.
   - These can come from expert elicitation or computed from simulation.

3. *(Optional)* **Create samples files** at `public/data/samples/`:
   ```
   RM3_samples_baseline.json
   RM3_samples_sota.json
   RM3_samples_saturated.json
   ```
   Each with ~1000 numeric samples per node.

4. **Register in the index** — add an entry to `public/data/risk_models_index.json`:
   ```json
   {
     "id": "RM3",
     "name": "Your Scenario Name",
     "description": "Your scenario description...",
     "rationalesFile": "rationales/RM3_rationales.json",
     "percentilesFile": "percentiles/RM3_percentiles.json",
     "baselineSamplesFile": "samples/RM3_samples_baseline.json",
     "sotaSamplesFile": "samples/RM3_samples_sota.json",
     "saturatedSamplesFile": "samples/RM3_samples_saturated.json"
   }
   ```
   Omit the `*SamplesFile` fields if you don't have samples.

5. **Enable on landing page** — edit `src/components/LandingPage.tsx` and add `'RM3'` to the `modelsWithData` set.

6. *(Optional)* **Add a Bayesian network screenshot** — place it in `public/images/` and update `BayesianNetworkPlaceholder.tsx`.

---

## 7. File Tree Summary

```
public/
├── data/
│   ├── risk_models_index.json          ← Model registry
│   ├── rationales/
│   │   ├── RM1_rationales.json         ← Node metadata + per-scenario rationales
│   │   └── RM2_rationales.json
│   ├── percentiles/
│   │   ├── RM1_percentiles.json        ← User-supplied p5/p50/p95
│   │   └── RM2_percentiles.json
│   ├── samples/                        ← Optional, for KDE charts
│   │   ├── RM1_samples_baseline.json
│   │   ├── RM1_samples_sota.json
│   │   ├── RM1_samples_saturated.json
│   │   └── ...
│   └── monte_carlo/                    ← Legacy monolithic files (can be removed)
│       └── ...
├── fonts/
│   ├── SeasonSans-*.woff2
│   └── SeasonSerif-*.woff2
└── images/
    └── SaferAI_Logo_White_RGB.svg

src/
├── components/
│   ├── LandingPage.tsx                ← Edit modelsWithData set here
│   ├── EstimatesTable.tsx             ← Per-scenario rationales, gated dist button
│   ├── ByParameterView.tsx            ← Cross-model comparison using split data
│   └── BayesianNetworkPlaceholder.tsx ← Replace with real screenshot
├── hooks/
│   └── useModelData.ts                ← Two-phase data loading
├── utils/
│   ├── formatters.ts
│   ├── statistics.ts
│   └── tickFormatter.ts
└── types/
    └── index.ts                       ← All TypeScript type definitions
```

---

## 8. Troubleshooting

| Symptom | Likely Cause |
|---------|-------------|
| Model card says "Coming Soon" | Model ID not in `modelsWithData` set in `LandingPage.tsx` |
| "Error loading risk model" after clicking Load | Rationales or percentiles file missing, wrong path in index, or malformed JSON |
| Table shows no rows | No `continuous` or `quantity` nodes in rationales, or no matching percentiles |
| Distribution chart button is hidden | No samples files, or samples file paths omitted from index |
| Distribution chart is blank | Samples array empty or contains non-numeric values |
| No "Show KRI Mappings" button | No `benchmarkMappings` field in the rationales file |
| Techniques not nesting under tactics | Missing `parentTactic` field on technique nodes |
| AND/OR connector not showing | Missing `combinationMode` field on technique nodes |
| Total Risk chart missing | No node named `"Total Risk"` with `nodeType: "quantity"`, or no samples |
| Rationale says "Toggle to view rationales" | Expected — expand the row to see per-scenario rationales |
| Expanded rationale is empty | Node's rationale fields are empty or missing |

---

## 9. Minimal Working Example

The smallest possible model needs a rationales file, a percentiles file, and an index entry. Samples are optional.

**rationales/RM_test_rationales.json:**
```json
{
  "modelId": "RM_test",
  "modelDescription": "A minimal risk model for testing.",
  "nodes": [
    {
      "id": "n1",
      "name": "Initial Access",
      "nodeType": "continuous",
      "baselineRationale": "Probability of gaining initial access.",
      "sotaRationale": "With SOTA AI, initial access probability increases.",
      "saturatedRationale": "Full AI saturation maximizes initial access."
    },
    {
      "id": "n2",
      "name": "Damage per Attack",
      "nodeType": "quantity",
      "unit": "$ / attack",
      "baselineRationale": "Expected damage based on current threat landscape.",
      "sotaRationale": "AI-enhanced attacks cause more damage.",
      "saturatedRationale": "Maximum projected damage per attack."
    },
    {
      "id": "n3",
      "name": "Total Risk",
      "nodeType": "quantity",
      "unit": "$ / year",
      "baselineRationale": "Annualized total risk.",
      "sotaRationale": "Annualized risk with SOTA AI uplift.",
      "saturatedRationale": "Annualized risk at full AI saturation."
    }
  ]
}
```

**percentiles/RM_test_percentiles.json:**
```json
{
  "modelId": "RM_test",
  "nodes": {
    "n1": {
      "baseline":  { "p5": 0.10, "p50": 0.30, "p95": 0.60 },
      "sota":      { "p5": 0.15, "p50": 0.45, "p95": 0.75 },
      "saturated": { "p5": 0.25, "p50": 0.60, "p95": 0.85 }
    },
    "n2": {
      "baseline":  { "p5": 30000, "p50": 80000, "p95": 200000 },
      "sota":      { "p5": 50000, "p50": 120000, "p95": 350000 },
      "saturated": { "p5": 80000, "p50": 180000, "p95": 500000 }
    },
    "n3": {
      "baseline":  { "p5": 300000, "p50": 800000, "p95": 2000000 },
      "sota":      { "p5": 500000, "p50": 1200000, "p95": 3500000 },
      "saturated": { "p5": 800000, "p50": 1800000, "p95": 5000000 }
    }
  }
}
```

Register in the index with `rationalesFile` and `percentilesFile` (omit samples paths) and you'll have a working model with tables and rationales — just no distribution charts.
