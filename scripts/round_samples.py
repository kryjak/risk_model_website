#!/usr/bin/env python3
"""
Shrink samples JSON files by rounding each float to 5 significant figures.
KDE plots are visually identical, percentiles barely shift, file size roughly
halves.

Usage:
    python scripts/round_samples.py                   # process all files
    python scripts/round_samples.py path/to/file.json # single file

Operates in-place. Rewrites only the `samples` field; metadata is preserved.
"""

import json
import sys
from pathlib import Path


SIG_FIGS = 5


def round_sig(x: float, sig: int = SIG_FIGS) -> float:
    if x == 0 or not isinstance(x, (int, float)):
        return x
    return float(f"{x:.{sig}g}")


def process(path: Path) -> None:
    before = path.stat().st_size
    with open(path) as f:
        data = json.load(f)
    samples = data.get("samples", {})
    for nid, arr in samples.items():
        if arr and isinstance(arr[0], (int, float)):
            samples[nid] = [round_sig(v) for v in arr]
    with open(path, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    after = path.stat().st_size
    pct = 100 * (1 - after / before)
    print(f"  {path.name}: {before/1024:.0f}KB -> {after/1024:.0f}KB ({pct:.0f}% smaller)")


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    if len(sys.argv) > 1:
        targets = [Path(sys.argv[1])]
    else:
        targets = sorted((repo_root / "public/data/samples").glob("*.json"))
    print(f"Rounding {len(targets)} file(s) to {SIG_FIGS} significant figures.")
    for p in targets:
        process(p)


if __name__ == "__main__":
    main()
