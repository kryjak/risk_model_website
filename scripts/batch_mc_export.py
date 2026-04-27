#!/usr/bin/env python3
"""
Batch Monte Carlo export for Bayesian Network risk models.

Loads each BN model JSON, sets evidence for baseline/SOTA/saturated capability
levels, runs MC samples, subsamples, and exports in the website-compatible format.

Usage:
    python batch_mc_export.py                     # full run (all 30 combinations)
    python batch_mc_export.py --test              # single test (first model, baseline)
    python batch_mc_export.py --model RM1         # specific model
    python batch_mc_export.py --scenario baseline # specific scenario
    python batch_mc_export.py --num-samples 1000  # fewer samples (faster)
"""

import argparse
import json
import math
import os
import sys
import time
from collections import deque
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from scipy.optimize import minimize
from scipy.stats import beta as beta_dist

# ---------------------------------------------------------------------------
# SOTA evidence states — these represent the Dec 2025 SOTA capability levels.
# Different for LLM-elicited vs human-elicited models because the human
# elicitation used fewer benchmark tasks (coarser difficulty ordering).
# ---------------------------------------------------------------------------
SOTA_EVIDENCE = {
    "llm": {"CyBench": "Labyrinth Linguist", "BountyBench": "Paddle"},
    "human": {"CyBench": "Primary Knowledge", "BountyBench": "LibreChat"},
}

SCENARIOS = ["baseline", "sota", "saturated"]


# ---------------------------------------------------------------------------
# Beta distribution fitting (port of JS fitBetaDistribution)
# ---------------------------------------------------------------------------

def fit_beta_from_mode_ci(
    mode: float,
    low_ci: float,
    high_ci: float,
    ci_level: float,
    minimum: float = 0.0,
    maximum: float = 1.0,
) -> Tuple[float, float]:
    """Fit Beta(alpha, beta) from mode + CI on [minimum, maximum].

    Returns (alpha, beta) for the standard Beta on [0, 1].
    Caller must affine-map samples to [minimum, maximum].
    """
    range_ = maximum - minimum
    scaled_mode = (mode - minimum) / range_
    scaled_low = (low_ci - minimum) / range_
    scaled_high = (high_ci - minimum) / range_

    lower_q = (1 - ci_level) / 2
    upper_q = 1 - lower_q

    def objective(params):
        a = np.exp(params[0]) + 1
        b = np.exp(params[1]) + 1
        mode_calc = (a - 1) / (a + b - 2)
        lq = beta_dist.ppf(lower_q, a, b)
        uq = beta_dist.ppf(upper_q, a, b)
        return (mode_calc - scaled_mode) ** 2 + (lq - scaled_low) ** 2 + (uq - scaled_high) ** 2

    result = minimize(objective, [0.0, 0.0], method="Nelder-Mead")
    alpha = np.exp(result.x[0]) + 1
    beta_ = np.exp(result.x[1]) + 1
    return alpha, beta_


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_param_value(param) -> float:
    """Extract numeric value from {value, sourceNodeId} or plain number."""
    if isinstance(param, (int, float)):
        return float(param)
    if isinstance(param, dict) and "value" in param:
        return float(param["value"])
    raise ValueError(f"Invalid parameter format: {param}")


def get_topological_order(nodes: List[dict], links: List[dict]) -> List[str]:
    """Kahn's algorithm for topological sort."""
    node_ids = {n["id"] for n in nodes}
    adj: Dict[str, List[str]] = {nid: [] for nid in node_ids}
    in_deg: Dict[str, int] = {nid: 0 for nid in node_ids}

    for link in links:
        src, tgt = link["source"], link["target"]
        if src in node_ids and tgt in node_ids:
            adj[src].append(tgt)
            in_deg[tgt] += 1

    queue = deque(nid for nid, d in in_deg.items() if d == 0)
    order: List[str] = []
    while queue:
        nid = queue.popleft()
        order.append(nid)
        for child in adj[nid]:
            in_deg[child] -= 1
            if in_deg[child] == 0:
                queue.append(child)

    if len(order) != len(node_ids):
        raise ValueError(f"Cycle detected: sorted {len(order)} of {len(node_ids)} nodes")
    return order


def case_insensitive_lookup(d: dict, key: str):
    """Look up key in dict; fall back to case-insensitive match."""
    if key in d:
        return d[key]
    key_lower = key.lower()
    for k, v in d.items():
        if k.lower() == key_lower:
            return v
    return None


def get_elicitation_type(model_entry: dict) -> str:
    """Determine elicitation type (human/llm) from sample filename."""
    baseline_file = model_entry.get("baselineSamplesFile", "")
    return "human" if "_human_" in baseline_file else "llm"


def get_output_stem(model_entry: dict) -> str:
    """Extract output filename stem from baselineSamplesFile path."""
    baseline = model_entry.get("baselineSamplesFile", "")
    filename = os.path.basename(baseline)
    return filename.replace("_samples_baseline.json", "")


# ---------------------------------------------------------------------------
# Evidence construction
# ---------------------------------------------------------------------------

def build_evidence(
    model_data: dict, scenario: str, elicitation_type: str
) -> Dict[str, str]:
    """Build evidence dict {node_id: state_name} for the given scenario."""
    nodes_by_name = {n["name"]: n for n in model_data["nodes"]}
    cybench = nodes_by_name.get("CyBench")
    bountybench = nodes_by_name.get("BountyBench")
    if not cybench or not bountybench:
        raise ValueError("Model missing CyBench or BountyBench probability nodes")

    evidence: Dict[str, str] = {}
    if scenario == "baseline":
        evidence[cybench["id"]] = "None"
        evidence[bountybench["id"]] = "None"
    elif scenario == "sota":
        sota = SOTA_EVIDENCE[elicitation_type]
        evidence[cybench["id"]] = sota["CyBench"]
        evidence[bountybench["id"]] = sota["BountyBench"]
    elif scenario == "saturated":
        evidence[cybench["id"]] = cybench["states"][-1]
        evidence[bountybench["id"]] = bountybench["states"][-1]
    else:
        raise ValueError(f"Unknown scenario: {scenario}")

    for node_id, state in evidence.items():
        node = next(n for n in model_data["nodes"] if n["id"] == node_id)
        if state not in node["states"]:
            raise ValueError(
                f"State '{state}' not in node '{node['name']}'. "
                f"Available: {node['states']}"
            )
    return evidence


# ---------------------------------------------------------------------------
# Pre-computation of Beta distributions for conditionalBeta nodes
# ---------------------------------------------------------------------------

def precompute_beta_params(
    nodes: List[dict], links: List[dict], evidence: Dict[str, str]
) -> Dict[str, Dict[str, Tuple[float, float, float, float]]]:
    """Pre-compute (alpha, beta, min, max) for every reachable key of every
    conditionalBeta node.  Returns {node_id: {combo_key: (a, b, lo, hi)}}."""

    node_map = {n["id"]: n for n in nodes}
    precomputed: Dict[str, Dict[str, Tuple]] = {}

    for node in nodes:
        if node.get("nodeType") != "continuous":
            continue
        if node.get("distributionType") != "conditionalBeta":
            continue
        cond_params = node.get("conditionalParameters")
        if not cond_params:
            continue

        parent_ids = [l["source"] for l in links if l["target"] == node["id"]]
        discrete_parents = [
            node_map[pid]
            for pid in parent_ids
            if node_map[pid].get("nodeType") == "probability"
            and node_map[pid].get("states")
        ]
        if not discrete_parents:
            continue

        def _enumerate(parents, idx=0, current=None):
            if current is None:
                current = []
            if idx == len(parents):
                yield list(current)
                return
            p = parents[idx]
            if p["id"] in evidence:
                current.append(evidence[p["id"]])
                yield from _enumerate(parents, idx + 1, current)
                current.pop()
            else:
                for s in p["states"]:
                    current.append(s)
                    yield from _enumerate(parents, idx + 1, current)
                    current.pop()

        node_pre: Dict[str, Tuple] = {}
        for combo in _enumerate(discrete_parents):
            key = ",".join(combo)
            params = case_insensitive_lookup(cond_params, key)
            if params is None:
                print(f"  WARNING: no conditionalParameters for key '{key}' "
                      f"in node '{node['name']}' ({node['id']})")
                continue
            mode = get_param_value(params["mode"])
            low_ci = get_param_value(params["lowCI"])
            high_ci = get_param_value(params["highCI"])
            ci_level = get_param_value(params["ciLevel"])
            lo = get_param_value(params["minimum"])
            hi = get_param_value(params["maximum"])
            a, b = fit_beta_from_mode_ci(mode, low_ci, high_ci, ci_level, lo, hi)
            node_pre[key] = (a, b, lo, hi)

        precomputed[node["id"]] = node_pre

    return precomputed


# ---------------------------------------------------------------------------
# Sampling functions (per-sample)
# ---------------------------------------------------------------------------

def _sample_discrete(
    node: dict, sample: dict, model_nodes: List[dict], rng: np.random.RandomState
) -> str:
    """Sample a state from a discrete probability node."""
    states = node["states"]
    cpt = node.get("originalCPT") or node.get("cpt")

    has_parents = node.get("parents") and len(node["parents"]) > 0

    if has_parents:
        node_map_local = {n["id"]: n for n in model_nodes}
        discrete_parent_ids = [
            pid for pid in node["parents"]
            if node_map_local.get(pid, {}).get("nodeType") != "continuous"
        ]
        parent_vals = [str(sample[pid]) for pid in discrete_parent_ids]
        parent_key = ",".join(parent_vals)
    else:
        parent_key = ""

    probs = []
    source_idx = None
    for i, state in enumerate(states):
        suffix = f"|{parent_key}" if parent_key else ""
        key = f"{state}{suffix}"

        entry = None
        if isinstance(cpt, dict):
            entry = cpt.get(key)
            if entry is None:
                entry = case_insensitive_lookup(cpt, key)
        if entry is None:
            raise ValueError(f"CPT missing key '{key}' in node '{node['name']}'")

        if isinstance(entry, dict) and entry.get("sourceNodeId"):
            src_val = sample.get(entry["sourceNodeId"])
            probs.append(src_val if src_val is not None else get_param_value(entry))
            source_idx = i
        else:
            probs.append(get_param_value(entry))

    if source_idx is not None:
        occupied = probs[source_idx]
        other_sum = sum(p for j, p in enumerate(probs) if j != source_idx)
        if other_sum > 0:
            probs = [
                p if j == source_idx else p / other_sum * (1 - occupied)
                for j, p in enumerate(probs)
            ]

    total = sum(probs)
    if total > 0:
        probs = [p / total for p in probs]
    else:
        probs = [1.0 / len(states)] * len(states)

    r = rng.random()
    cumsum = 0.0
    for i, p in enumerate(probs):
        cumsum += p
        if r <= cumsum:
            return states[i]
    return states[-1]


def _sample_conditional_beta(
    node: dict,
    sample: dict,
    links: List[dict],
    node_map: Dict[str, dict],
    precomputed: Dict[str, Dict],
    rng: np.random.RandomState,
) -> float:
    """Sample from a conditionalBeta node using pre-computed distributions."""
    parent_ids = [l["source"] for l in links if l["target"] == node["id"]]
    discrete_parents = [
        node_map[pid]
        for pid in parent_ids
        if node_map[pid].get("nodeType") == "probability"
        and node_map[pid].get("states")
    ]
    parent_states = [str(sample[p["id"]]) for p in discrete_parents]
    key = ",".join(parent_states)

    node_pre = precomputed.get(node["id"], {})
    params = node_pre.get(key)
    if params is None:
        key_lower = key.lower()
        for k, v in node_pre.items():
            if k.lower() == key_lower:
                params = v
                break
    if params is None:
        raise ValueError(
            f"No precomputed Beta for node '{node['name']}', key='{key}'. "
            f"Available: {list(node_pre.keys())[:10]}"
        )

    a, b, lo, hi = params
    standard = rng.beta(a, b)
    return lo + (hi - lo) * standard


def _sample_quantity_multiply(
    node: dict,
    sample: dict,
    links: List[dict],
    node_map: Dict[str, dict],
) -> float:
    """Sample a quantity node in multiply mode."""
    if node.get("value") is not None:
        pv = node["value"]
        if isinstance(pv, dict) and pv.get("sourceNodeId"):
            sampled = sample.get(pv["sourceNodeId"])
            result = float(sampled) if sampled is not None else get_param_value(pv)
        else:
            result = get_param_value(pv)
    else:
        result = 1.0

    parent_links = [l for l in links if l["target"] == node["id"]]

    prob_parents = [
        node_map[l["source"]]
        for l in parent_links
        if node_map[l["source"]].get("nodeType") == "probability"
        and node_map[l["source"]].get("states")
    ]

    cond_table = node.get("conditionalTable", {})
    if prob_parents and cond_table:
        sampled_states = [str(sample[p["id"]]) for p in prob_parents]
        cond_key = ",".join(sampled_states)
        factor_entry = cond_table.get(cond_key)
        if factor_entry is None:
            factor_entry = case_insensitive_lookup(cond_table, cond_key)
        if factor_entry is not None:
            if isinstance(factor_entry, dict) and factor_entry.get("sourceNodeId"):
                sv = sample.get(factor_entry["sourceNodeId"])
                factor = float(sv) if sv is not None else get_param_value(factor_entry)
            else:
                factor = get_param_value(factor_entry)
            result *= factor
    elif prob_parents:
        for parent in prob_parents:
            sel = node.get("stateSelections", {}).get(parent["id"])
            sampled_state = sample[parent["id"]]
            if sel and sel.get("cmt") and isinstance(sel["cmt"], list):
                si = parent["states"].index(sampled_state) if sampled_state in parent["states"] else -1
                if 0 <= si < len(sel["cmt"]):
                    result *= sel["cmt"][si]
            elif isinstance(sampled_state, (int, float)):
                result *= sampled_state

    qty_parents = [
        node_map[l["source"]]
        for l in parent_links
        if node_map[l["source"]].get("nodeType") == "quantity"
    ]
    for parent in qty_parents:
        pv = sample.get(parent["id"])
        if pv is not None:
            result *= pv

    return result


_MATH_SCOPE = {
    "__builtins__": {},
    "abs": abs, "max": max, "min": min, "round": round, "pow": pow,
    "sqrt": math.sqrt, "log": math.log, "log2": math.log2, "log10": math.log10,
    "exp": math.exp, "sin": math.sin, "cos": math.cos, "tan": math.tan,
    "ceil": math.ceil, "floor": math.floor,
    "pi": math.pi, "e": math.e,
    "true": True, "false": False,
}

import re
import keyword

_KEYWORD_PREFIX = "_kw_"


def _sanitise_var_names(expr: str, mapping: dict) -> Tuple[str, dict]:
    """Rename any Python keywords used as variable names in expression/mapping."""
    new_mapping = {}
    for var_name, node_id in mapping.items():
        if keyword.iskeyword(var_name):
            safe = _KEYWORD_PREFIX + var_name
            expr = re.sub(r'\b' + var_name + r'\b', safe, expr)
            new_mapping[safe] = node_id
        else:
            new_mapping[var_name] = node_id
    return expr, new_mapping


def _convert_mathjs_to_python(expr: str) -> str:
    """Convert mathjs expression syntax to Python.

    Handles:
      - equalText(x, 'y') / equalText(x, "y") → (x == 'y')
      - cond ? a : b → (a if cond else b), including nesting
    """
    expr = re.sub(
        r"""equalText\(\s*(\w+)\s*,\s*(['"])(.*?)\2\s*\)""",
        r"(\1 == '\3')",
        expr,
    )

    if "?" not in expr:
        return expr

    return _convert_ternary(expr)


def _convert_ternary(expr: str) -> str:
    """Recursively convert C-style ternary (cond ? a : b) to Python."""
    # Find the first top-level '?' (not inside parens)
    depth = 0
    q_pos = -1
    for i, ch in enumerate(expr):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "?" and depth == 0:
            q_pos = i
            break

    if q_pos == -1:
        return expr

    cond = expr[:q_pos].strip()
    rest = expr[q_pos + 1:]

    # Find the matching ':' at depth 0
    depth = 0
    colon_pos = -1
    for i, ch in enumerate(rest):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == ":" and depth == 0:
            colon_pos = i
            break

    if colon_pos == -1:
        return expr

    then_branch = rest[:colon_pos].strip()
    else_branch = rest[colon_pos + 1:].strip()

    # Recursively convert branches (they may contain nested ternaries)
    then_py = _convert_ternary(then_branch)
    else_py = _convert_ternary(else_branch)
    # Unwrap single-layer parens from else if it was a grouped sub-ternary
    if else_py.startswith("(") and else_py.endswith(")"):
        inner = else_py[1:-1]
        if inner.count("(") == inner.count(")"):
            else_py = inner

    return f"({then_py} if {cond} else {_convert_ternary(else_py)})"


def _sample_quantity_expression(
    node: dict, sample: dict, node_map: Dict[str, dict]
) -> float:
    """Evaluate a quantity node's expression with parent values."""
    expr = node.get("expression", "")
    mapping = node.get("inputMapping", {})
    if not expr or not mapping:
        return 0.0

    expr, mapping = _sanitise_var_names(expr, mapping)
    expr = _convert_mathjs_to_python(expr)
    scope = dict(_MATH_SCOPE)
    for var_name, parent_id in mapping.items():
        scope[var_name] = sample.get(parent_id, 0)

    try:
        result = eval(expr, scope)
        if not isinstance(result, (int, float)) or not math.isfinite(result):
            return 0.0
        return float(result)
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# MC simulation runner (vectorised)
# ---------------------------------------------------------------------------

def _resolve_cond_table_key(
    node: dict,
    links: List[dict],
    node_map: Dict[str, dict],
    evidence: Dict[str, str],
    expert_state: str,
) -> Optional[float]:
    """Resolve the conditional-table multiplication factor for a quantity node
    given a specific expert state and the current evidence."""
    cond_table = node.get("conditionalTable", {})
    if not cond_table:
        return None

    parent_links = [l for l in links if l["target"] == node["id"]]
    prob_parents = [
        node_map[l["source"]]
        for l in parent_links
        if node_map[l["source"]].get("nodeType") == "probability"
        and node_map[l["source"]].get("states")
    ]
    if not prob_parents:
        return None

    states = []
    for p in prob_parents:
        if p["id"] in evidence:
            states.append(evidence[p["id"]])
        elif p.get("name") == "Expert":
            states.append(expert_state)
        else:
            return None  # can't resolve statically
    key = ",".join(states)
    entry = cond_table.get(key)
    if entry is None:
        entry = case_insensitive_lookup(cond_table, key)
    if entry is None:
        return None
    if isinstance(entry, dict) and entry.get("sourceNodeId"):
        return None  # depends on a sampled node — handled per-sample
    return get_param_value(entry)


def run_simulation(
    model_data: dict,
    evidence: Dict[str, str],
    num_samples: int,
    seed: int = 42,
) -> Dict[str, list]:
    """Run MC simulation with vectorised sampling.

    Strategy: since evidence fixes both benchmarks, only the Expert state
    varies among discrete nodes.  We pre-sample Expert states, then for each
    expert group, batch-generate all Beta samples and compute quantities.
    """
    nodes = model_data["nodes"]
    links = model_data["links"]
    node_map: Dict[str, dict] = {n["id"]: n for n in nodes}
    topo_order = get_topological_order(nodes, links)

    print("  Pre-computing Beta distributions...")
    precomputed = precompute_beta_params(nodes, links, evidence)
    n_pre = sum(len(v) for v in precomputed.values())
    print(f"  Pre-computed {n_pre} distributions across {len(precomputed)} nodes")

    rng = np.random.RandomState(seed)

    # Identify the Expert node
    expert_node = next(
        (n for n in nodes if n.get("name") == "Expert"), None
    )
    if expert_node is None:
        raise ValueError("No Expert probability node found in model")

    expert_states = expert_node["states"]
    cpt = expert_node.get("originalCPT") or expert_node.get("cpt", {})
    expert_weights = np.array([get_param_value(cpt[s]) for s in expert_states])
    expert_weights = expert_weights / expert_weights.sum()
    n_experts = len(expert_states)

    # Pre-sample expert indices for ALL iterations
    expert_indices = rng.choice(n_experts, size=num_samples, p=expert_weights)

    # Build result arrays — numeric nodes get float64, probability nodes get object
    results: Dict[str, np.ndarray] = {}
    for nid in topo_order:
        nd = node_map[nid]
        if nd.get("nodeType") == "probability":
            results[nid] = np.empty(num_samples, dtype=object)
        else:
            results[nid] = np.zeros(num_samples, dtype=np.float64)

    # Fill evidence nodes
    for nid, state in evidence.items():
        results[nid][:] = state

    # Fill expert node
    for ei, es in enumerate(expert_states):
        mask = expert_indices == ei
        results[expert_node["id"]][mask] = es

    # Determine link-parent lookups (cached)
    _parent_links_cache: Dict[str, List[dict]] = {}
    for nid in topo_order:
        _parent_links_cache[nid] = [l for l in links if l["target"] == nid]

    print(f"  Running {num_samples:,} MC samples (vectorised by expert group)...")
    t0 = time.time()

    # Process nodes in topological order
    for node_id in topo_order:
        node = node_map[node_id]
        ntype = node.get("nodeType")
        dtype = node.get("distributionType")

        # Skip already-filled nodes
        if node_id in evidence or node_id == expert_node["id"]:
            continue

        # --- Probability nodes other than Expert ---
        if ntype == "probability":
            # Rare case: another probability node not in evidence.
            # Fall back to per-sample (should not happen in standard models).
            for i in range(num_samples):
                current = {nid: results[nid][i] for nid in topo_order
                           if results[nid][i] is not None}
                results[node_id][i] = _sample_discrete(node, current, nodes, rng)
            continue

        # --- ConditionalBeta nodes: vectorise per expert group ---
        if ntype == "continuous" and dtype == "conditionalBeta":
            parent_ids = [l["source"] for l in _parent_links_cache[node_id]]
            discrete_parents = [
                node_map[pid] for pid in parent_ids
                if node_map[pid].get("nodeType") == "probability"
                and node_map[pid].get("states")
            ]

            for ei, expert_state in enumerate(expert_states):
                mask = expert_indices == ei
                count = int(mask.sum())
                if count == 0:
                    continue

                parent_state_list = []
                for dp in discrete_parents:
                    if dp["id"] in evidence:
                        parent_state_list.append(evidence[dp["id"]])
                    elif dp["id"] == expert_node["id"]:
                        parent_state_list.append(expert_state)
                    else:
                        parent_state_list.append(str(results[dp["id"]][np.where(mask)[0][0]]))
                key = ",".join(parent_state_list)

                node_pre = precomputed.get(node_id, {})
                params = node_pre.get(key)
                if params is None:
                    key_lower = key.lower()
                    for k, v in node_pre.items():
                        if k.lower() == key_lower:
                            params = v
                            break
                if params is None:
                    raise ValueError(
                        f"No precomputed Beta for '{node['name']}', key='{key}'. "
                        f"Available: {list(node_pre.keys())[:5]}"
                    )
                a, b, lo, hi = params
                standard = rng.beta(a, b, size=count)
                results[node_id][mask] = lo + (hi - lo) * standard
            continue

        # --- Plain Beta nodes ---
        if ntype == "continuous" and dtype == "beta":
            params = node.get("parameters", {})
            pt = node.get("parameterizationType", "alphaBeta")
            if pt == "alphaBeta":
                a = get_param_value(params.get("alpha", {"value": 2}))
                b_ = get_param_value(params.get("beta", {"value": 2}))
            elif pt == "modeCI":
                a, b_ = fit_beta_from_mode_ci(
                    get_param_value(params.get("mode", {"value": 0.5})),
                    get_param_value(params.get("lowCI", {"value": 0.1})),
                    get_param_value(params.get("highCI", {"value": 0.9})),
                    get_param_value(params.get("ciLevel", {"value": 0.9})),
                    get_param_value(params.get("minimum", {"value": 0})),
                    get_param_value(params.get("maximum", {"value": 1})),
                )
            else:
                a, b_ = 2.0, 2.0
            lo = get_param_value(params.get("minimum", {"value": 0}))
            hi = get_param_value(params.get("maximum", {"value": 1}))
            results[node_id][:] = lo + (hi - lo) * rng.beta(a, b_, size=num_samples)
            continue

        # --- Quantity nodes ---
        if ntype == "quantity":
            cmode = node.get("computationMode", "multiply")

            if cmode == "expression":
                expr = node.get("expression", "")
                mapping = node.get("inputMapping", {})
                if expr and mapping:
                    expr, mapping = _sanitise_var_names(expr, mapping)
                    py_expr = _convert_mathjs_to_python(expr)
                    # Check if any input is a string/object array (discrete parent)
                    has_discrete_input = any(
                        results.get(pid, np.zeros(1)).dtype == object
                        for pid in mapping.values()
                    )
                    if has_discrete_input:
                        # Per-expert-group evaluation for expressions
                        # involving discrete parent states
                        for ei, expert_state in enumerate(expert_states):
                            mask = expert_indices == ei
                            count = int(mask.sum())
                            if count == 0:
                                continue
                            scope = dict(_MATH_SCOPE)
                            scope.update({
                                "sqrt": np.sqrt, "log": np.log, "log2": np.log2,
                                "log10": np.log10, "exp": np.exp, "abs": np.abs,
                                "sin": np.sin, "cos": np.cos, "tan": np.tan,
                                "ceil": np.ceil, "floor": np.floor,
                                "max": np.maximum, "min": np.minimum,
                                "pow": np.power,
                            })
                            for var_name, parent_id in mapping.items():
                                parr = results.get(parent_id, np.zeros(num_samples))
                                if parr.dtype == object:
                                    scope[var_name] = parr[mask][0]
                                else:
                                    scope[var_name] = parr[mask]
                            try:
                                val = eval(py_expr, scope)
                                if isinstance(val, np.ndarray):
                                    results[node_id][mask] = np.where(
                                        np.isfinite(val), val, 0.0
                                    )
                                else:
                                    results[node_id][mask] = (
                                        float(val) if math.isfinite(val) else 0.0
                                    )
                            except Exception as exc:
                                print(f"  WARNING: expression eval failed for "
                                      f"'{node['name']}' (expert={expert_state}): {exc}")
                    else:
                        scope = dict(_MATH_SCOPE)
                        scope.update({
                            "sqrt": np.sqrt, "log": np.log, "log2": np.log2,
                            "log10": np.log10, "exp": np.exp, "abs": np.abs,
                            "sin": np.sin, "cos": np.cos, "tan": np.tan,
                            "ceil": np.ceil, "floor": np.floor,
                            "max": np.maximum, "min": np.minimum,
                            "pow": np.power,
                        })
                        for var_name, parent_id in mapping.items():
                            scope[var_name] = results.get(
                                parent_id, np.zeros(num_samples)
                            )
                        try:
                            val = eval(py_expr, scope)
                            if isinstance(val, np.ndarray):
                                results[node_id][:] = np.where(
                                    np.isfinite(val), val, 0.0
                                )
                            else:
                                results[node_id][:] = (
                                    float(val) if math.isfinite(val) else 0.0
                                )
                        except Exception as exc:
                            print(f"  WARNING: expression eval failed for "
                                  f"'{node['name']}': {exc}")
                continue

            # Multiply mode — vectorise per expert group
            if node.get("value") is not None:
                pv = node["value"]
                if isinstance(pv, dict) and pv.get("sourceNodeId"):
                    base = results.get(pv["sourceNodeId"], np.ones(num_samples)).copy()
                else:
                    base = np.full(num_samples, get_param_value(pv))
            else:
                base = np.ones(num_samples)

            parent_lnks = _parent_links_cache[node_id]

            # Conditional table factor (depends on expert state)
            cond_table = node.get("conditionalTable", {})
            prob_parents = [
                node_map[l["source"]] for l in parent_lnks
                if node_map[l["source"]].get("nodeType") == "probability"
                and node_map[l["source"]].get("states")
            ]
            has_source_node_factor = False

            if prob_parents and cond_table:
                factor_arr = np.ones(num_samples)
                for ei, expert_state in enumerate(expert_states):
                    mask = expert_indices == ei
                    if not mask.any():
                        continue
                    f = _resolve_cond_table_key(
                        node, links, node_map, evidence, expert_state
                    )
                    if f is not None:
                        factor_arr[mask] = f
                    else:
                        # Factor depends on a sampled continuous source node
                        has_source_node_factor = True
                        states_for_key = []
                        for p in prob_parents:
                            if p["id"] in evidence:
                                states_for_key.append(evidence[p["id"]])
                            elif p["id"] == expert_node["id"]:
                                states_for_key.append(expert_state)
                        key = ",".join(states_for_key)
                        entry = cond_table.get(key)
                        if entry is None:
                            entry = case_insensitive_lookup(cond_table, key)
                        if entry and isinstance(entry, dict) and entry.get("sourceNodeId"):
                            src_arr = results.get(entry["sourceNodeId"], np.ones(num_samples))
                            factor_arr[mask] = src_arr[mask]
                        # else leave as 1.0
                base *= factor_arr
            elif prob_parents:
                # Legacy stateSelections path
                for parent in prob_parents:
                    sel = node.get("stateSelections", {}).get(parent["id"])
                    if sel and sel.get("cmt") and isinstance(sel["cmt"], list):
                        cmt = sel["cmt"]
                        for si, s in enumerate(parent["states"]):
                            mask = results[parent["id"]] == s
                            if mask.any() and si < len(cmt):
                                base[mask] *= cmt[si]

            # Multiply by quantity parents
            qty_parents = [
                node_map[l["source"]] for l in parent_lnks
                if node_map[l["source"]].get("nodeType") == "quantity"
            ]
            for qp in qty_parents:
                base *= results[qp["id"]]

            results[node_id][:] = base
            continue

    elapsed = time.time() - t0
    print(f"  Completed in {elapsed:.1f}s ({num_samples / max(elapsed, 0.001):,.0f} samples/s)")

    # Convert to lists for the export step
    samples_dict: Dict[str, list] = {}
    for nid in topo_order:
        arr = results[nid]
        samples_dict[nid] = arr.tolist()
    return samples_dict


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def subsample_and_export(
    samples: Dict[str, list],
    nodes: List[dict],
    model_id: str,
    scenario: str,
    num_samples: int,
    subsample_size: int,
    output_path: Path,
    seed: int = 43,
) -> None:
    """Subsample numeric nodes and export in website JSON format."""
    node_map = {n["id"]: n for n in nodes}
    export_ids = {
        nid for nid in samples
        if node_map[nid].get("nodeType") in ("continuous", "quantity")
    }

    if subsample_size < num_samples:
        rng = np.random.RandomState(seed)
        indices = np.sort(rng.choice(num_samples, size=subsample_size, replace=False))
    else:
        indices = np.arange(num_samples)

    # Round each exported sample to 5 significant figures. Plenty for KDE /
    # percentile display and shrinks the JSON payload by ~55%. Full-precision
    # mean/variance from the 100k run are still reported in `statistics`.
    export_samples: Dict[str, list] = {}
    for nid in export_ids:
        vals = samples[nid]
        export_samples[nid] = [float(f"{vals[i]:.5g}") for i in indices]

    # Statistics from FULL sample arrays (pre-subsample) for continuous nodes
    statistics: Dict[str, dict] = {}
    for nid in export_ids:
        if node_map[nid].get("nodeType") == "continuous":
            full_arr = np.array(samples[nid])
            statistics[nid] = {
                "mean": float(np.mean(full_arr)),
                "variance": float(np.var(full_arr, ddof=0)),
            }

    output_data = {
        "modelId": model_id,
        "scenario": scenario,
        "totalSamples": len(indices),
        "samples": export_samples,
        "metadata": {
            "nodes": [
                {"id": n["id"], "name": n["name"], "nodeType": n.get("nodeType", "")}
                for n in nodes
            ]
        },
        "statistics": statistics,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output_data, f)

    size_kb = output_path.stat().st_size / 1024
    print(f"  Exported {output_path.name} ({size_kb:.0f} KB, {len(indices)} samples)")

    print("  Summary (subsampled):")
    for nid in sorted(export_ids):
        arr = np.array(export_samples[nid])
        name = node_map[nid].get("name", nid)
        ntype = node_map[nid].get("nodeType")
        print(
            f"    {name:40s} ({ntype:10s}): "
            f"mean={arr.mean():.4g}, "
            f"p5={np.percentile(arr, 5):.4g}, "
            f"p50={np.percentile(arr, 50):.4g}, "
            f"p95={np.percentile(arr, 95):.4g}"
        )


# ---------------------------------------------------------------------------
# CLI & main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Batch MC export for BN risk models"
    )
    parser.add_argument("--test", action="store_true",
                        help="Run single test (first model, baseline)")
    parser.add_argument("--model", type=str,
                        help="Run specific model by ID (e.g. RM1)")
    parser.add_argument("--scenario", type=str, choices=SCENARIOS,
                        help="Run specific scenario")
    parser.add_argument("--num-samples", type=int, default=100_000,
                        help="Number of MC samples (default 100000)")
    parser.add_argument("--subsample-size", type=int, default=10_000,
                        help="Subsample size for export (default 10000)")
    parser.add_argument("--output-dir", type=str, default="output/samples",
                        help="Output directory")
    parser.add_argument("--seed", type=int, default=42,
                        help="Random seed for reproducibility")
    parser.add_argument("--index-file", type=str,
                        default="risk_models_index.json",
                        help="Path to risk models index JSON")
    parser.add_argument("--models-dir", type=str, default="public/models",
                        help="Directory containing BN model JSON files")
    args = parser.parse_args()

    # Paths are resolved relative to the repo root (one level up from scripts/).
    script_dir = Path(__file__).resolve().parent.parent
    index_path = script_dir / args.index_file

    with open(index_path) as f:
        index = json.load(f)

    models = index["models"]

    if args.test:
        models = models[:1]
        scenarios = ["baseline"]
        print("=== TEST MODE: first model, baseline only ===\n")
    else:
        if args.model:
            models = [m for m in models if m["id"] == args.model]
            if not models:
                available = [m["id"] for m in index["models"]]
                print(f"Model '{args.model}' not found. Available: {available}")
                sys.exit(1)
        scenarios = [args.scenario] if args.scenario else SCENARIOS

    total = len(models) * len(scenarios)
    print(f"Combinations: {total} ({len(models)} models x {len(scenarios)} scenarios)")
    print(f"Samples: {args.num_samples:,}, subsample: {args.subsample_size:,}, "
          f"seed: {args.seed}")
    print(f"Output: {args.output_dir}/\n")

    t_global = time.time()

    for mi, entry in enumerate(models):
        model_id = entry["id"]
        model_name = entry["name"]
        network_file = entry.get("networkFile")

        if not network_file:
            print(f"SKIP {model_id}: no networkFile field in index")
            continue

        model_path = script_dir / args.models_dir / network_file
        if not model_path.exists():
            print(f"SKIP {model_id}: file not found: {model_path}")
            continue

        elicitation = get_elicitation_type(entry)
        stem = get_output_stem(entry)

        print(f"{'='*70}")
        print(f"[{mi+1}/{len(models)}] {model_id}: {model_name}")
        print(f"  File: {network_file}  |  elicitation: {elicitation}")

        with open(model_path) as f:
            model_data = json.load(f)

        expert_node = next(
            (n for n in model_data["nodes"] if n.get("name") == "Expert"), None
        )
        if expert_node:
            cpt = expert_node.get("cpt", {})
            weights = [get_param_value(v) for v in cpt.values()]
            expected_w = 1.0 / len(weights) if weights else 0
            if not all(abs(w - expected_w) < 0.01 for w in weights):
                print(f"  WARNING: Expert weights not uniform: {weights}")
            else:
                print(f"  Expert node: {len(weights)} experts, equal weights")

        for scenario in scenarios:
            print(f"\n  --- {scenario.upper()} ---")

            evidence = build_evidence(model_data, scenario, elicitation)
            for nid, state in evidence.items():
                nname = next(n["name"] for n in model_data["nodes"] if n["id"] == nid)
                print(f"  Evidence: {nname} = {state}")

            samples = run_simulation(
                model_data, evidence, args.num_samples, seed=args.seed
            )

            out_name = f"{stem}_{scenario}.json"
            out_path = script_dir / args.output_dir / out_name
            subsample_and_export(
                samples, model_data["nodes"], model_id, scenario,
                args.num_samples, args.subsample_size, out_path,
                seed=args.seed + 1,
            )

        print()

    elapsed = time.time() - t_global
    print(f"{'='*70}")
    print(f"All done in {elapsed:.1f}s ({elapsed/60:.1f} min)")


if __name__ == "__main__":
    main()
