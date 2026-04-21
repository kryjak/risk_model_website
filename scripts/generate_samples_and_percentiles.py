#!/usr/bin/env python3
"""
Generate sample and percentile JSON files for the SaferAI Risk Dashboard
from Bayesian Network MC simulation export files.

Usage:
    python scripts/generate_samples_and_percentiles.py                  # all models
    python scripts/generate_samples_and_percentiles.py <scenario_name>  # single model
    python scripts/generate_samples_and_percentiles.py --exports-dir output/samples

Example:
    python scripts/generate_samples_and_percentiles.py OC1_SME_Phishing_and_BEC_llm

When called with no arguments, processes every model listed in
public/data/risk_models_index.json.

The script expects (run from the project root):
  - public/data/rationales/{scenario_name}_rationales.json  (required)
  - <exports_dir>/{scenario_name}_baseline.json   (optional)
  - <exports_dir>/{scenario_name}_sota.json       (optional)
  - <exports_dir>/{scenario_name}_saturated.json  (optional)

  where <exports_dir> defaults to public/data/risk_model_exports.

It produces:
  - public/data/samples/{scenario_name}_samples_{level}.json  (one per level found)
  - public/data/percentiles/{scenario_name}_percentiles.json  (all levels combined)

Node mapping:
  The export uses opaque node IDs (e.g. "node-1758548793791-1-216"). These are
  translated to semantic IDs (e.g. "OC1-phishing-cont-3") by matching the human-
  readable node *name* between the export's metadata section and the rationales file.
  Probability nodes (CyBench, BountyBench, Expert, etc.) have categorical string
  samples and are skipped entirely.

Validation:
  For continuous nodes the export stores pre-computed mean and variance in its
  'statistics' field. The script recomputes these from the sample array and raises
  a warning if the relative discrepancy exceeds STATS_WARN_TOLERANCE (2%), or an
  error above STATS_ERROR_TOLERANCE (20%). Validation is skipped when the export
  is subsampled (totalSamples > array length).
  Quantity nodes are not present in the export's statistics field, so no validation
  is performed for them.
"""

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np

LEVELS = ["baseline", "sota", "saturated"]
STATS_WARN_TOLERANCE = 0.02   # 2% — print a warning
STATS_ERROR_TOLERANCE = 0.20  # 20% — likely corruption, abort

# ---------------------------------------------------------------------------
# Per-scenario name mappings
#
# When the export file uses a different node name than the rationales file,
# add an entry here. Keys are the rationale names; values are the
# corresponding export names.
# ---------------------------------------------------------------------------
SCENARIO_NAME_MAPPINGS: dict[str, dict[str, str]] = {
    "OC1_SME_Phishing_and_BEC_llm": {
        "Direct Cost of Invoice Payment": "Damage per Attack",
        "T1565.001 - Stored Data Manipulation": "Impact: Stored Data Manipulation",
        "T1657 - Financial Theft": "Impact: Financial Theft",
    },
    "OC2_Data_Rich_Data_Breach_llm": {
        'Damage': 'Damage per Attack',
        'T1074 - Data Staged': 'Collection: Data Staged - Uncertainty',
        'T1213 - Data from Information Repositories': 'Collection: Data from Information Repositories'
    },
    "OC2_SME_Social_Eng_Initial_Access_Ransom_llm": {
        'Command-and-Control': 'Command and Control',
        'Damage per Successful Attack': 'Damage per Attack',
        'Number of Attacks per Actor': 'Number of Attempts per Actor',
        'Initial Access: Spearphishing Link': 'Initial Access',
        'T1583 - Acquire Infrastructure': 'Acquire Infrastructure',
        'T1588 - Obtain Capabilities': 'Obtain Capabilities'
    },
    "OC3_Ransomware_SME_target_human": {
        'Ransom Payment': 'Damage per Attack: Ransom',
        'Recovery Cost': 'Damage per Attack',
    },
    "OC3_Ransomware_SME_target_llm": {
        'Ransom Payment': 'Damage per Attack: Ransom',
        'Recovery Cost': 'Damage per Attack',
        'T1486/T1490/T1489 - Data Encryption and System Disruption': 'Data Encryption and System Disruption',
        'T1657 - Extortion': 'Financial Theft',
    },
    "OC3_Ransomware_Large_enterprise_target_llm": {
        'Ransom Payment': 'Damage per Attack: Ransom',
        'Recovery Cost': 'Damage per Attack',
        'T1486, T1490, T1489 - Data Encryption & System Disruption': 'Data Encryption and System Disruption',
        'T1657 - Financial Theft': 'Financial Theft',
    },
    "OC3_Financial_DDoS_llm": {
        'Acquire Infrastructure: Botnet (T1583.005)': 'Resource Development: Acquire Botnet - Uncertainty',
        'Active Scanning (T1595)': 'Reconnaissance: Active Scanning- Uncertainty',
        'Command-and-Control': 'Command and Control',
        'Compromise Infrastructure: Botnet (T1584.005)': 'Resource Development: Build Compromise Botnet - Uncertainty',
        'Damage': 'Damage per Attack',
        'Defense Evasion': 'Defense Evasion: Non-Standard Port - Uncertainty',
        'Direct Network Flood (T1498.001)': 'Impact: Direct Network Flood',
        'Gather Victim Network Information (T1590)': 'Reconnaissance: Gather Victim Network Information - Uncertainty',
        'Masquerading (T1036)': 'Defense Evasion: Masquerading - Uncertainty',
        'Non-Standard Port (T1571)': 'Defence Evasion',
        'Reflection/Amplification Attack (T1498.002)': 'Impact: Reflection/Amplification Attack'
    },
    "OC4_Infrastructure_small_Disruption_llm": {
        'Damage': 'Damage per Attack',
        'Number of Attempts per Actor per Year': 'Number of Attempts per Actor',
        'T0803 Loss of Control': 'Impact: Loss of Control',
        'T0821 Modify Controller Tasking': 'Impact: Modify Controller Tasking',
        'T0829 Loss of View': 'Impact: Loss of View',
        'T0858 Change Operating Mode': 'Impact: Change Operating Mode',
        'T1055 Process Injection': 'Privilege Escalation: Process Injection',
        'T1068 Exploitation for Privilege Escalation': 'Privilege Escalation: Local Exploit',
        'T1133 External Remote Services': 'Initial Access: External Remote Services',
        'T1134 Access Token Manipulation': 'Privilege Escalation: Token Manipulation',
        'T1190 Exploit Public-Facing Application': 'Initial Access: Exploit Public-Facing App',
        'T1566.001 Spearphishing Attachment': 'Initial Access: Spear-phishing Attachment'
    },
    "OC4_Infrastructure_large_Disruption_llm": {
        'Damage': 'Damage per Attack',
        'Number of Attempts per Actor per Year': 'Number of Attempts per Actor',
        'T1021.001 - Remote Services: RDP into EMS servers': 'Lateral Movement: RDP into EMS servers',
        'T1021.002 - SMB/WMI into Engineering PCs': 'Lateral Movement: SMB_WMI into Engineering PCs',
        'T1048 - OT Protocol Tunnel (ICCP/MQTT)': 'C2: OT Protocol Tunnel',
        'T1055 - Process Injection': 'Privilege Escalation: Process Injection',
        'T1068 - Exploitation for Privilege Escalation': 'Privilege Escalation: Exploitation for PrivEsc',
        'T1071.001 - Web Protocols (HTTPS/443)': 'C2: Web Protocols (HTTPS)',
        'T1071.004 - DNS-over-HTTPS': 'C2: DNS-over-HTTPS',
        'T1105 - Ingress Tool Transfer via OT jump-server': 'Lateral Movement: Ingress Tool Transfer',
        'T1133 - External Remote Services (stolen vendor VPN creds)': 'Initial Access: External Remote Services',
        'T1134 - Access-Token Manipulation': 'Privilege Escalation: Token Manipulation',
        'T1190 - Exploit Public-Facing Application (FortiGate 0-day)': 'Initial Access: Exploit Public-Facing App',
        'T1566.001 - Spearphishing Attachment (utility staff)': 'Initial Access: Spear-phishing Attachment',
    },
    "OC5_Espionage_Polymorphic_llm": {
        'Damage': 'Damage per Attack',
        'Privilege Escalation': 'Privillege Escalation',
        'T1055 Process Injection': 'Privilege Escalation: Process Injection',
        'T1068 Exploitation for Priv-Esc': 'Privilege Escalation: Exploitation for Priv-Esc',
        'T1071.001 Web Protocols (HTTPS)': 'C2: Web Protocols (HTTPS)',
        'T1071.004 DNS-over-HTTPS': 'C2: DNS-over-HTTPS',
        'T1090.003 Multi-hop Proxy': 'C2: Multi-hop Proxy',
        'T1133 External Remote Services': 'Initial Access: External Remote Services',
        'T1134 Access-Token Manipulation': 'Privilege Escalation: Access-Token Manipulation',
        'T1195 Supply-Chain Compromise': 'Initial Access: Supply-Chain Compromise',
        'T1566.001 Spear-phishing Attachment': 'Initial Access: Spear-phishing Attachment' 
    },
}
# ---------------------------------------------------------------------------
# Per-scenario fixed percentiles
#
# Some nodes appear in the rationales file but were never modelled as separate
# nodes in the Bayesian Network (e.g. technique nodes that are always ~100%
# and were folded into their parent tactic in the BN). These nodes have no
# samples in the export, so the script cannot compute their percentiles.
# Add them here with hardcoded values — the script will merge them into the
# percentiles output after processing the export, and will warn if an entry
# here conflicts with one derived from the export.
#
# Structure: {scenario_name: {semantic_id: {level: {p5, p50, p95}}}}
# All three levels (baseline, sota, saturated) must be provided for each node.
# ---------------------------------------------------------------------------
SCENARIO_FIXED_PERCENTILES: dict[str, dict[str, dict[str, dict[str, float]]]] = {
    # RM4 (human): Reconnaissance and Resource Development not modelled in the BN
    # (both are effectively certain — vignette says 100% / 100% / 100%).
    "OC3_Ransomware_SME_target_human": {
        "OC3-ransomware-sme-cont-1": {  # Reconnaissance
            "baseline":  {"p5": 1.0, "p50": 1.0, "p95": 1.0},
            "sota":      {"p5": 1.0, "p50": 1.0, "p95": 1.0},
            "saturated": {"p5": 1.0, "p50": 1.0, "p95": 1.0},
        },
        "OC3-ransomware-sme-cont-2": {  # Resource Development
            "baseline":  {"p5": 1.0, "p50": 1.0, "p95": 1.0},
            "sota":      {"p5": 1.0, "p50": 1.0, "p95": 1.0},
            "saturated": {"p5": 1.0, "p50": 1.0, "p95": 1.0},
        },
    },
    # RM4 (LLM) and RM5: Impact tactic now reads directly from the BN export node
    # 'Impact' (matched by name).  No hardcoded entry needed here provided the
    # rationale technique node T1486/T1490/T1489 has been removed, leaving Impact
    # as a leaf tactic.  If that technique node is still present it will generate
    # a "no data" warning and display 0% — remove it from the rationale.
    "OC2_SME_Social_Eng_Initial_Access_Ransom_llm": {
        "OC2-iab-cont-2a": {
            "baseline":   {"p5": 1.0, "p50": 1.0, "p95": 1.0},
            "sota":       {"p5": 1.0, "p50": 1.0, "p95": 1.0},
            "saturated":  {"p5": 1.0, "p50": 1.0, "p95": 1.0},
        },
        "OC2-iab-cont-2b": {
            "baseline":   {"p5": 1.0, "p50": 1.0, "p95": 1.0},
            "sota":       {"p5": 1.0, "p50": 1.0, "p95": 1.0},
            "saturated":  {"p5": 1.0, "p50": 1.0, "p95": 1.0},
        },
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_json(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def build_name_to_id(rationales: dict) -> dict[str, str]:
    """
    Return {node_name: semantic_id} for every non-probability node in the
    rationales file. Raises ValueError on duplicate names.
    """
    name_to_id: dict[str, str] = {}
    for node in rationales["nodes"]:
        if node["nodeType"] == "probability":
            continue
        name = node["name"]
        if name in name_to_id:
            raise ValueError(
                f"Duplicate node name in rationales file: {name!r}. "
                "Each node name must be unique."
            )
        name_to_id[name] = node["id"]
    return name_to_id


def check_stats(semantic_id: str, name: str, arr: np.ndarray, stored: dict) -> None:
    """
    Validate recomputed mean and variance against stored values.
    Uses population variance (ddof=0), consistent with a Monte Carlo sampler
    reporting the empirical statistics of its own sample array.

    Two thresholds:
      STATS_WARN_TOLERANCE  — print a warning (expected from subsampling / rounding)
      STATS_ERROR_TOLERANCE — raise an error (likely corruption)
    """
    computed_mean = float(np.mean(arr))
    computed_var = float(np.var(arr, ddof=0))
    stored_mean = stored["mean"]
    stored_var = stored["variance"]

    def rel_err(computed: float, stored: float) -> float:
        if abs(stored) < 1e-12:
            return abs(computed - stored)
        return abs(computed - stored) / abs(stored)

    mean_err = rel_err(computed_mean, stored_mean)
    var_err = rel_err(computed_var, stored_var)
    max_err = max(mean_err, var_err)

    if max_err <= STATS_WARN_TOLERANCE:
        return

    lines = []
    if mean_err > STATS_WARN_TOLERANCE:
        lines.append(
            f"  mean:     computed={computed_mean:.8g}, stored={stored_mean:.8g}, "
            f"rel_err={mean_err:.4f}"
        )
    if var_err > STATS_WARN_TOLERANCE:
        lines.append(
            f"  variance: computed={computed_var:.8g}, stored={stored_var:.8g}, "
            f"rel_err={var_err:.4f}"
        )

    if max_err > STATS_ERROR_TOLERANCE:
        raise ValueError(
            f"Statistics mismatch for node {name!r} ({semantic_id}):\n"
            + "\n".join(lines)
            + "\nThis likely indicates corrupted sample data."
        )

    print(
        f"  [WARNING] Statistics drift for node {name!r} ({semantic_id}):\n"
        + "\n".join(lines)
    )


# ---------------------------------------------------------------------------
# Per-level processing
# ---------------------------------------------------------------------------

def process_level(
    scenario_name: str,
    level: str,
    name_to_id: dict[str, str],
    base_dir: Path,
    exports_dir: Path | None = None,
) -> tuple[dict | None, dict | None]:
    """
    Load and process one export file.

    Returns (samples_dict, percentiles_dict) where:
      samples_dict    = {semantic_id: [float, ...]}
      percentiles_dict = {semantic_id: {"p5": float, "p50": float, "p95": float}}

    Returns (None, None) if the export file is missing.
    """
    if exports_dir is None:
        exports_dir = base_dir / "public" / "data" / "risk_model_exports"
    export_path = exports_dir / f"{scenario_name}_{level}.json"
    if not export_path.exists():
        print(f"  [SKIP] Export file not found: {export_path.name}")
        return None, None

    print(f"  Loading {export_path.name} ...")
    export = load_json(export_path)

    total_samples = export.get("totalSamples", "?")
    print(f"    totalSamples = {total_samples}")

    raw_samples: dict = export["samples"]
    meta_nodes: list = export["metadata"]["nodes"]
    statistics: dict = export.get("statistics", {})

    # Detect subsampling: if totalSamples > actual array length, the stored
    # statistics were computed on a larger set and validation would be noisy.
    first_numeric = next(
        (v for v in raw_samples.values() if v and isinstance(v[0], (int, float))),
        None,
    )
    actual_count = len(first_numeric) if first_numeric else 0
    is_subsampled = (
        isinstance(total_samples, int)
        and actual_count > 0
        and total_samples > actual_count
    )
    if is_subsampled:
        print(
            f"    Subsampled export detected ({actual_count} of {total_samples}), "
            f"skipping statistics validation"
        )
        statistics = {}

    raw_id_to_name = {n["id"]: n["name"] for n in meta_nodes}

    # Per-scenario name mapping: rationale name -> export name
    name_map = SCENARIO_NAME_MAPPINGS.get(scenario_name, {})
    # Invert for lookup: export name -> rationale name
    export_to_rationale = {v: k for k, v in name_map.items()}

    if name_map:
        print(f"    Applying {len(name_map)} name mapping(s) for {scenario_name!r}")

    # Build the effective export name set (after applying inverse mapping)
    numeric_export_names: set[str] = set()
    for rid, slist in raw_samples.items():
        if slist and isinstance(slist[0], (int, float)) and rid in raw_id_to_name:
            export_name = raw_id_to_name[rid]
            # Resolve to rationale-side name if a mapping exists
            effective_name = export_to_rationale.get(export_name, export_name)
            numeric_export_names.add(effective_name)

    rationale_names = set(name_to_id.keys())

    only_in_export = numeric_export_names - rationale_names
    only_in_rationales = rationale_names - numeric_export_names

    if only_in_export:
        print(
            f"  [WARNING] Numeric nodes in export but not in rationales "
            f"(skipped):\n    {sorted(only_in_export)}"
        )
    if only_in_rationales:
        print(
            f"  [WARNING] Nodes in rationales but not in export "
            f"(will have no data for {level}):\n    {sorted(only_in_rationales)}"
        )

    samples_out: dict = {}
    percentiles_out: dict = {}

    for raw_id, sample_list in raw_samples.items():
        if not sample_list:
            continue

        # Skip categorical (probability) nodes — their samples are strings
        if not isinstance(sample_list[0], (int, float)):
            continue

        export_name = raw_id_to_name.get(raw_id)
        if export_name is None:
            print(f"  [WARNING] raw_id {raw_id!r} not in metadata, skipping")
            continue

        # Apply name mapping if present (export name -> rationale name)
        name = export_to_rationale.get(export_name, export_name)

        semantic_id = name_to_id.get(name)
        if semantic_id is None:
            continue  # already warned above

        arr = np.array(sample_list, dtype=float)

        if np.any(~np.isfinite(arr)):
            n_bad = int(np.sum(~np.isfinite(arr)))
            print(
                f"  [WARNING] Node {export_name!r} has {n_bad} non-finite samples "
                f"(NaN/Inf). Results may be unreliable."
            )

        # Validate mean/variance for nodes that have stored statistics
        if raw_id in statistics:
            check_stats(semantic_id, export_name, arr, statistics[raw_id])

        samples_out[semantic_id] = sample_list  # preserve original Python list
        p5, p50, p95 = np.percentile(arr, [5, 50, 95]).tolist()
        percentiles_out[semantic_id] = {"p5": p5, "p50": p50, "p95": p95}

    print(f"    Mapped {len(samples_out)} nodes successfully.")
    return samples_out, percentiles_out


# ---------------------------------------------------------------------------
# Per-scenario driver
# ---------------------------------------------------------------------------

def process_scenario(
    scenario_name: str,
    base_dir: Path,
    exports_dir: Path,
) -> bool:
    """Process a single scenario end-to-end. Returns True on success."""
    rationales_path = (
        base_dir / "public" / "data" / "rationales"
        / f"{scenario_name}_rationales.json"
    )
    if not rationales_path.exists():
        print(f"ERROR: Rationales file not found: {rationales_path}")
        return False

    print(f"Loading rationales: {rationales_path.name}")
    rationales = load_json(rationales_path)
    model_id: str = rationales["modelId"]
    name_to_id = build_name_to_id(rationales)

    n_prob = sum(1 for n in rationales["nodes"] if n["nodeType"] == "probability")
    n_cont = sum(1 for n in rationales["nodes"] if n["nodeType"] == "continuous")
    n_qty  = sum(1 for n in rationales["nodes"] if n["nodeType"] == "quantity")
    print(f"  modelId = {model_id!r}")
    print(
        f"  Rationale nodes: {len(rationales['nodes'])} total "
        f"({n_cont} continuous, {n_qty} quantity, {n_prob} benchmark/categorical — "
        f"processing {n_cont + n_qty})"
    )

    samples_dir = base_dir / "public" / "data" / "samples"
    percentiles_dir = base_dir / "public" / "data" / "percentiles"
    samples_dir.mkdir(parents=True, exist_ok=True)
    percentiles_dir.mkdir(parents=True, exist_ok=True)

    all_percentiles: dict = {}
    processed_levels: list[str] = []

    for level in LEVELS:
        print(f"\n--- {level.upper()} ---")
        samples_dict, percentiles_dict = process_level(
            scenario_name, level, name_to_id, base_dir, exports_dir,
        )
        if samples_dict is None:
            continue

        processed_levels.append(level)

        samples_payload = {
            "modelId": model_id,
            "scenario": level,
            "samples": samples_dict,
        }
        samples_path = samples_dir / f"{scenario_name}_samples_{level}.json"
        with open(samples_path, "w") as f:
            json.dump(samples_payload, f, separators=(",", ":"))
        print(f"  Wrote {samples_path.relative_to(base_dir)}")

        for semantic_id, percs in percentiles_dict.items():
            all_percentiles.setdefault(semantic_id, {})[level] = percs

    if not processed_levels:
        print("\nERROR: No export files were found for any level. Nothing written.")
        return False

    missing_levels = [lv for lv in LEVELS if lv not in processed_levels]
    if missing_levels:
        print(
            f"\n[WARNING] Percentiles file will be incomplete — "
            f"missing levels: {missing_levels}"
        )

    fixed = SCENARIO_FIXED_PERCENTILES.get(scenario_name, {})
    if fixed:
        print(f"\nMerging {len(fixed)} fixed percentile entry/entries for {scenario_name!r}")
        for semantic_id, level_data in fixed.items():
            if semantic_id in all_percentiles:
                print(
                    f"  [WARNING] {semantic_id!r} already has export-derived percentiles; "
                    f"fixed entry ignored."
                )
                continue
            all_percentiles[semantic_id] = level_data
            print(f"  Added fixed percentiles for {semantic_id!r}")

    # Propagate percentiles between a tactic and its single technique child when
    # the BN models them as the same node (one has data, the other doesn't).
    # This avoids hardcoding for the degenerate tactic-equals-technique case.
    tactic_to_techniques: dict[str, list[str]] = {}
    for node in rationales["nodes"]:
        parent = node.get("parentTactic")
        if parent:
            tactic_to_techniques.setdefault(parent, []).append(node["id"])

    for tactic_id, tech_ids in tactic_to_techniques.items():
        if len(tech_ids) != 1:
            continue
        tech_id = tech_ids[0]
        tactic_has = tactic_id in all_percentiles
        tech_has = tech_id in all_percentiles
        if tactic_has and not tech_has:
            all_percentiles[tech_id] = all_percentiles[tactic_id]
            tactic_name = name_to_id and next(
                (n["name"] for n in rationales["nodes"] if n["id"] == tech_id), tech_id
            )
            print(
                f"\n  [INFO] Single-technique tactic: copied percentiles from tactic "
                f"{tactic_id!r} → technique {tech_id!r} ({tactic_name!r})"
            )
        elif tech_has and not tactic_has:
            all_percentiles[tactic_id] = all_percentiles[tech_id]
            tech_name = next(
                (n["name"] for n in rationales["nodes"] if n["id"] == tech_id), tech_id
            )
            print(
                f"\n  [INFO] Single-technique tactic: copied percentiles from technique "
                f"{tech_id!r} ({tech_name!r}) → tactic {tactic_id!r}"
            )

    percentiles_payload = {
        "modelId": model_id,
        "nodes": all_percentiles,
    }
    percentiles_path = percentiles_dir / f"{scenario_name}_percentiles.json"
    with open(percentiles_path, "w") as f:
        json.dump(percentiles_payload, f, indent=2)
    print(f"\nWrote {percentiles_path.relative_to(base_dir)}")

    name_map = SCENARIO_NAME_MAPPINGS.get(scenario_name, {})
    if name_map:
        overrides_path = base_dir / "public" / "data" / "display_name_overrides.json"
        if overrides_path.exists():
            existing = load_json(overrides_path)
        else:
            existing = {}
        clean_map = {k: v.removesuffix(' - Uncertainty').removesuffix('- Uncertainty')
                     for k, v in name_map.items()}
        existing[model_id] = clean_map
        with open(overrides_path, "w") as f:
            json.dump(existing, f, indent=2)
        print(f"Updated {overrides_path.relative_to(base_dir)} with {len(name_map)} override(s) for {model_id!r}")

    print(f"\nDone. Processed levels: {processed_levels}")
    return True


def get_all_scenario_names(base_dir: Path) -> list[str]:
    """Derive scenario names from risk_models_index.json."""
    index_path = base_dir / "public" / "data" / "risk_models_index.json"
    if not index_path.exists():
        print(f"ERROR: Index file not found: {index_path}")
        sys.exit(1)
    index = load_json(index_path)
    names: list[str] = []
    for model in index["models"]:
        baseline = model.get("baselineSamplesFile", "")
        stem = os.path.basename(baseline).replace("_samples_baseline.json", "")
        if stem:
            names.append(stem)
    return names


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate sample and percentile JSON files from BN export files.",
    )
    parser.add_argument(
        "scenario_name", nargs="?", default=None,
        help="Scenario to process (e.g. OC1_SME_Phishing_and_BEC_llm). "
             "If omitted, processes all models from risk_models_index.json.",
    )
    parser.add_argument(
        "--exports-dir", default=None,
        help="Directory containing export JSON files. "
             "Defaults to public/data/risk_model_exports.",
    )
    args = parser.parse_args()

    base_dir = Path(__file__).parent.parent

    if args.exports_dir is not None:
        exports_dir = Path(args.exports_dir)
        if not exports_dir.is_absolute():
            exports_dir = base_dir / exports_dir
    else:
        exports_dir = base_dir / "public" / "data" / "risk_model_exports"

    if args.scenario_name:
        scenarios = [args.scenario_name]
    else:
        scenarios = get_all_scenario_names(base_dir)
        print(f"Processing all {len(scenarios)} scenario(s) from risk_models_index.json\n")

    if not scenarios:
        print("No scenarios found.")
        sys.exit(1)

    failed: list[str] = []
    for i, scenario_name in enumerate(scenarios):
        if len(scenarios) > 1:
            print(f"\n{'='*70}")
            print(f"[{i+1}/{len(scenarios)}] {scenario_name}")
            print(f"{'='*70}")
        if not process_scenario(scenario_name, base_dir, exports_dir):
            failed.append(scenario_name)

    if len(scenarios) > 1:
        print(f"\n{'='*70}")
        print(f"Finished: {len(scenarios) - len(failed)}/{len(scenarios)} succeeded")
        if failed:
            print(f"Failed: {failed}")


if __name__ == "__main__":
    main()
