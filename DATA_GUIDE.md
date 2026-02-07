# Data Guide: Populating the SaferAI Risk Dashboard

This guide explains where and how to provide real data to make the dashboard functional. It is written for researchers (or AI agents) who have Bayesian network simulation outputs and need to plug them into the website.

---

## Quick Overview

The website reads all its data from static JSON files in `public/data/`. There is no backend — everything is fetched client-side. To populate the dashboard you need to:

1. Create **3 JSON files per risk model** (baseline, SOTA, saturated)
2. Register each model in the **index file**
3. Optionally provide a **Bayesian network image** and **benchmark mappings**

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
      "baselineFile": "monte_carlo/RM1_distributions_baseline.json",
      "sotaFile": "monte_carlo/RM1_distributions_sota.json",
      "saturatedFile": "monte_carlo/RM1_distributions_saturated.json"
    }
  ]
}
```

| Field | What to put |
|-------|-------------|
| `id` | Short identifier (e.g. `RM1`, `RM2`). Shown as a badge on the landing page. |
| `name` | Human-readable scenario name. Shown in model cards and the selector. |
| `description` | 1–3 sentence scenario summary. Shown on landing page cards and the scenario card. |
| `baselineFile` | Relative path (from `public/data/`) to the baseline Monte Carlo JSON. |
| `sotaFile` | Same, for the SOTA (state-of-the-art AI uplift) scenario. |
| `saturatedFile` | Same, for the saturated (full AI capability) scenario. |

**Important:** The landing page currently hardcodes which models have data in `src/components/LandingPage.tsx` (line ~12):
```ts
const modelsWithData = new Set(['RM1', 'RM2']);
```
When you add data files for RM3–RM9 (or any new model), **add its ID to this set** so the "Load Model" button becomes active.

---

## 2. Monte Carlo Distribution Files (the main data)

**Location:** `public/data/monte_carlo/`
**Naming convention:** `{ModelID}_distributions_{scenario}.json`
**Example:** `RM3_distributions_baseline.json`

Each file represents one scenario's simulation output. You need **three files per model**: baseline, sota, saturated.

### Full JSON Structure

```json
{
  "exportTimestamp": "2026-01-27T20:26:16.276Z",
  "modelName": "OC4 + Infrastructure (small) + Disruption",
  "modelDescription": "State-sponsored APT targeting regional power utilities. This scenario models sophisticated actors with nation-state resources...",
  "totalSamples": 1000,
  "cancelled": false,
  "completed": true,

  "metadata": {
    "nodes": [ ... ],
    "links": [ ... ]
  },

  "samples": { ... },
  "marginals": { ... },
  "marginalProbabilities": { ... },
  "statistics": { ... },

  "benchmarkMappings": { ... }
}
```

### 2a. Nodes (`metadata.nodes`)

Every variable in the Bayesian network is a node. There are three types:

#### Probability nodes (categorical/discrete)

These are benchmark categories. Their samples are **string arrays**. They appear in `marginals` but are **not shown in the estimates tables**.

```json
{
  "id": "RM1-prob-1",
  "name": "CyBench",
  "nodeType": "probability",
  "description": "Cybersecurity benchmark category",
  "position": { "x": 100, "y": 100 },
  "parents": [],
  "states": ["None", "LootStash", "Urgent", "Flag Command", "Primary Knowledge"],
  "distributionType": "discrete"
}
```

#### Continuous nodes (MITRE ATT&CK tactics/techniques)

These represent probabilities (0–1 range, Beta distributions). They appear in the **Probability Estimates** table.

```json
{
  "id": "RM1-cont-3",
  "name": "Initial Access",
  "nodeType": "continuous",
  "description": "Probability of successful initial access to the target network given the threat actor capabilities and defensive posture.",
  "position": { "x": 200, "y": 300 },
  "parents": ["RM1-prob-1"],
  "distributionType": "conditionalBeta"
}
```

The `description` field is displayed as the **rationale** in the table. Make it meaningful — it explains *why* this parameter has the value it does.

#### Technique nodes (children of tactics)

These are continuous nodes with extra fields that make them nest under a parent tactic:

```json
{
  "id": "RM1-tech-ia-1",
  "name": "Phishing",
  "nodeType": "continuous",
  "description": "Spear-phishing campaigns targeting utility employees...",
  "parentTactic": "RM1-cont-3",
  "combinationMode": "OR",
  "position": { "x": 350, "y": 150 },
  "parents": ["RM1-cont-3"],
  "distributionType": "beta",
  "alpha": 3.5,
  "beta": 4.5
}
```

| Field | Purpose |
|-------|---------|
| `parentTactic` | The `id` of the parent continuous (tactic) node. This creates the nested drill-down in the Probability table. |
| `combinationMode` | `"AND"` or `"OR"` — how techniques combine into the tactic. Displayed as a color-coded connector (blue = AND, red = OR). |

All technique nodes under the same parent tactic should share the same `combinationMode`.

#### Quantity nodes (computed real-valued outputs)

These represent counts, dollar amounts, rates, etc. They appear in the **Quantity Estimates** or **Impact Estimates** tables (impact if the name contains "damage" or the unit contains "$").

```json
{
  "id": "RM1-qty-1",
  "name": "Number of Actors",
  "nodeType": "quantity",
  "description": "Estimated number of threat actors with sufficient capability...",
  "position": { "x": 500, "y": 100 },
  "parents": ["RM1-cont-1"],
  "unit": "actors",
  "computationMode": "direct",
  "distributionType": null
}
```

The `unit` field is displayed in column headers and chart axes.

**Special node:** A quantity node named exactly `"Total Risk"` is required for the Overall Risk Distribution chart at the top. Its samples drive the big KDE chart and the Expected Value / VaR 95% stat cards.

### 2b. Links (`metadata.links`)

Directed edges in the Bayesian network. Currently used for the network visualization placeholder (future use).

```json
{
  "source": "RM1-prob-1",
  "target": "RM1-cont-1",
  "linkType": "probability",
  "parameterName": null
}
```

### 2c. Samples (`samples`)

This is where the actual simulation data lives. It's a flat object mapping node IDs to arrays of exactly `totalSamples` (typically 1000) values.

```json
{
  "RM1-prob-1": ["LootStash", "Urgent", "Primary Knowledge", ...],
  "RM1-cont-1": [0.784, 0.644, 0.879, ...],
  "RM1-qty-1": [33.9, 51.9, 39.3, ...],
  "RM1-qty-5": [52624175.3, 134030538.5, ...]
}
```

- **Probability nodes:** array of 1000 strings (state names)
- **Continuous nodes:** array of 1000 floats, typically in [0, 1]
- **Quantity nodes:** array of 1000 floats, in whatever unit applies

The dashboard computes percentiles (5th, 50th, 95th), means, standard deviations, and KDE curves from these samples. More samples = smoother KDE curves, but 1000 is sufficient.

### 2d. Other fields

These are present in the JSON but only lightly used:

| Field | Used for |
|-------|----------|
| `marginals` | Not currently displayed. Maps probability node IDs to state→probability objects. |
| `marginalProbabilities` | Not currently displayed. Same as marginals but 1000 repeated values per state. |
| `statistics` | Not currently displayed. Maps node IDs to `{ mean, variance, count }`. |

You can include these as empty objects `{}` if your simulation tool doesn't produce them.

### 2e. Benchmark Mappings (`benchmarkMappings`)

Optional. If present, a "Show KRI Mappings" button appears above the tables, opening a modal that shows which benchmarks map to which parameters.

```json
{
  "benchmarkMappings": {
    "CyBench": ["Reconnaissance", "Initial Access", "Execution"],
    "BountyBench": ["Initial Access", "Privilege Escalation"],
    "NIST CSF": ["Number of Actors", "Total Risk"]
  }
}
```

Keys are benchmark/KRI names. Values are arrays of **node names** (not IDs) that the benchmark maps to.

Place this at the **top level** of each Monte Carlo JSON file (same level as `metadata`, `samples`, etc.). It only needs to be in the baseline file — that's where the code reads it from.

---

## 3. Bayesian Network Visualization

**Current state:** Placeholder card with dashed border and text "Network visualization will be inserted here."

**File:** `src/components/BayesianNetworkPlaceholder.tsx`

The placeholder contains a `<div data-network-container>` element. To add a real visualization, you have two options:

### Option A: Static image (simplest)

Replace the placeholder content with an `<img>` tag pointing to your network diagram:

1. Place your image at `public/images/bayesian_network_RM1.png` (or SVG)
2. Edit `BayesianNetworkPlaceholder.tsx` to accept a `modelId` prop and render:
   ```tsx
   <img src={`/images/bayesian_network_${modelId}.png`} alt="Bayesian Network" />
   ```

### Option B: Interactive visualization (future)

The `metadata.nodes` (with `position.x`, `position.y`) and `metadata.links` (with `source`, `target`) provide everything needed to render an interactive graph using D3, Cytoscape.js, or similar. The `data-network-container` div is reserved for this purpose.

---

## 4. Scenarios Explained

Each model has three scenarios with distinct colors:

| Scenario | Color | Hex | Meaning |
|----------|-------|-----|---------|
| Baseline | Blue | `#5B86B5` | Current threat landscape without AI assistance |
| SOTA | Purple | `#700C8C` | Threat actors using current best AI capabilities |
| Saturated | Teal | `#5B7B7A` | Threat actors with fully mature/saturated AI tools |

The three JSON files per model should contain the same node structure (same IDs, same names) but different sample values reflecting each scenario's assumptions.

---

## 5. Adding a New Risk Model (Step-by-Step)

1. **Run your Bayesian network simulation** three times (baseline, SOTA, saturated), producing 1000 samples per node each time.

2. **Export to JSON** following the structure in Section 2. Ensure:
   - All three files have identical `metadata.nodes` and `metadata.links`
   - Each file has a `samples` object with 1000 values per node
   - There is a node named `"Total Risk"` with `nodeType: "quantity"`
   - Continuous nodes have values in [0, 1]
   - Quantity nodes have values in their natural units

3. **Place the files** in `public/data/monte_carlo/`:
   ```
   RM3_distributions_baseline.json
   RM3_distributions_sota.json
   RM3_distributions_saturated.json
   ```

4. **Register in the index** — add an entry to `public/data/risk_models_index.json`:
   ```json
   {
     "id": "RM3",
     "name": "Your Scenario Name",
     "description": "Your scenario description...",
     "baselineFile": "monte_carlo/RM3_distributions_baseline.json",
     "sotaFile": "monte_carlo/RM3_distributions_sota.json",
     "saturatedFile": "monte_carlo/RM3_distributions_saturated.json"
   }
   ```

5. **Enable on landing page** — edit `src/components/LandingPage.tsx` and add `'RM3'` to the `modelsWithData` set.

6. **Optionally add benchmark mappings** — add a `benchmarkMappings` field to the baseline JSON.

7. **Optionally add a network image** — place it in `public/images/` and update the placeholder component.

---

## 6. File Tree Summary

```
public/
├── data/
│   ├── risk_models_index.json          ← Model registry
│   └── monte_carlo/
│       ├── RM1_distributions_baseline.json
│       ├── RM1_distributions_sota.json
│       ├── RM1_distributions_saturated.json
│       ├── RM2_distributions_baseline.json
│       ├── RM2_distributions_sota.json
│       ├── RM2_distributions_saturated.json
│       └── ... (add more as needed)
├── fonts/
│   ├── SeasonSans-*.woff2             ← Body font (12 variants)
│   └── SeasonSerif-*.woff2            ← Heading font (2 variants)
└── images/
    └── SaferAI_Logo_White_RGB.svg     ← Header logo

src/
├── components/
│   ├── LandingPage.tsx                ← Edit modelsWithData set here
│   └── BayesianNetworkPlaceholder.tsx ← Replace with real visualization
├── hooks/
│   └── useModelData.ts                ← Data loading and processing logic
└── types/
    └── index.ts                       ← All TypeScript type definitions
```

---

## 7. Troubleshooting

| Symptom | Likely Cause |
|---------|-------------|
| Model card says "Coming Soon" | Model ID not in `modelsWithData` set in `LandingPage.tsx` |
| "Error loading risk model" after clicking Load | JSON file missing, wrong path in index, or malformed JSON |
| Table shows no rows | No `continuous` or `quantity` nodes in `metadata.nodes`, or samples missing |
| Distribution chart is blank | Samples array empty or contains non-numeric values |
| No "Show KRI Mappings" button | No `benchmarkMappings` field in the baseline JSON |
| Techniques not nesting under tactics | Missing `parentTactic` field on technique nodes |
| AND/OR connector not showing | Missing `combinationMode` field on technique nodes |
| Total Risk chart missing | No node with `name: "Total Risk"` and `nodeType: "quantity"` |
| Rationale says "No rationale available" | Node's `description` field is empty or missing |

---

## 8. Minimal Working Example

The smallest possible model that will display everything:

```json
{
  "exportTimestamp": "2026-01-01T00:00:00.000Z",
  "modelName": "Minimal Example",
  "modelDescription": "A minimal risk model for testing.",
  "totalSamples": 100,
  "cancelled": false,
  "completed": true,
  "metadata": {
    "nodes": [
      {
        "id": "n1",
        "name": "Initial Access",
        "nodeType": "continuous",
        "description": "Probability of gaining initial access.",
        "position": { "x": 100, "y": 100 },
        "parents": [],
        "distributionType": "conditionalBeta"
      },
      {
        "id": "n2",
        "name": "Damage per Attack",
        "nodeType": "quantity",
        "description": "Expected financial damage per successful attack.",
        "position": { "x": 300, "y": 100 },
        "parents": ["n1"],
        "unit": "$ / attack",
        "computationMode": "direct",
        "distributionType": null
      },
      {
        "id": "n3",
        "name": "Total Risk",
        "nodeType": "quantity",
        "description": "Annualized total risk in dollars.",
        "position": { "x": 500, "y": 100 },
        "parents": ["n2"],
        "unit": "$ / year",
        "computationMode": "multiply",
        "distributionType": null
      }
    ],
    "links": [
      { "source": "n1", "target": "n2", "linkType": "probability", "parameterName": null },
      { "source": "n2", "target": "n3", "linkType": "probability", "parameterName": null }
    ]
  },
  "samples": {
    "n1": [0.3, 0.45, 0.2, 0.55, 0.4, "... 100 floats in [0,1]"],
    "n2": [50000, 120000, 30000, 80000, "... 100 floats in dollars"],
    "n3": [500000, 1200000, 300000, "... 100 floats in $/year"]
  },
  "marginals": {},
  "marginalProbabilities": {},
  "statistics": {},
  "benchmarkMappings": {
    "Example Benchmark": ["Initial Access", "Total Risk"]
  }
}
```

Create three copies of this (adjusting sample values for each scenario) and you'll have a working model.
