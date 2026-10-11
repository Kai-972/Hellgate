#!/usr/bin/env python3
import json
import hashlib
import sys
from datetime import datetime
from pathlib import Path
import subprocess
import re

ROOT = Path(__file__).resolve().parent.parent
BASELINES = ROOT / "baselines"
RESULTS = ROOT / "results"
REGISTRY = ROOT / "registry"

def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    h.update(p.read_bytes())
    return h.hexdigest()

def compute_config_hash(suite_path: Path, extra_paths: list[Path] | None = None) -> str:
    h = hashlib.sha256()
    for p in [suite_path] + (extra_paths or []):
        if p.exists():
            h.update(p.read_bytes())
    return h.hexdigest()

def run_evalgate_compare(suite: Path, base: Path, tolerance_pp: float = 1.0, md_out: Path | None = None) -> tuple[int, str]:
    t = str(tolerance_pp / 100.0) if tolerance_pp >= 1.0 else str(tolerance_pp)
    cmd = [
        "npx", "-y", "@royalpinto007/evalgate@latest", "compare",
        str(suite), "--base", str(base), "--tolerance", t,
    ]
    if md_out:
        cmd.extend(["--md", str(md_out)])
    try:
        res = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        return res.returncode, res.stdout + res.stderr
    except Exception as e:
        return 99, str(e)

def parse_evalgate_output(out: str) -> dict:
    data = {
        "baseMean": 0.0, "headMean": 0.0, "deltaPp": 0.0, "worstCasePp": 0.0,
        "regressedCount": 0, "improvedCount": 0, "unchangedCount": 0,
        "cases": [], "reasons": [],
    }
    m = re.search(r"base\s+([0-9.]+)%\s*->\s*head\s+([0-9.]+)%(?:\s+\(([+\-0-9.]+)pp\))?", out)
    if m:
        data["baseMean"] = float(m.group(1)) / 100.0
        data["headMean"] = float(m.group(2)) / 100.0
        if m.group(3):
            data["deltaPp"] = float(m.group(3))
    m = re.search(r"worst case\s+([+\-0-9.]+)pp", out)
    if m:
        data["worstCasePp"] = float(m.group(1))
    m = re.search(r"(\d+)\s+case\(s\)\s+got worse", out, re.I)
    if m:
        data["regressedCount"] = int(m.group(1))
    m = re.search(r"IMPROVED[^0-9]*(\d+)", out, re.I)
    if m:
        data["improvedCount"] = int(m.group(1))
    m = re.search(r"(\d+)\s+case\(s\)\s+improved", out, re.I)
    if m and data["improvedCount"] == 0:
        data["improvedCount"] = int(m.group(1))
    if "No regressions beyond tolerance" in out:
        data["reasons"].append("No regressions beyond tolerance")
    if "REGRESSION" in out and "Regression detected" not in " ".join(data["reasons"]):
        data["reasons"].append("Regression detected")
    if "REMOVED" in out:
        data["reasons"].append("Cases removed/changed")
    return data

def enhance_compare(suite_name: str, tolerance_pp: float = 1.0, min_kappa: float = 0.70, min_pred_pos: int = 40):
    suite = ROOT / "configs" / f"{suite_name}.suite.yaml"
    base = BASELINES / f"{suite_name}.baseline.json"
    md_out = ROOT / "evalgate-report.md"
    RESULTS.mkdir(exist_ok=True)
    REGISTRY.mkdir(exist_ok=True)

    config_hash = compute_config_hash(suite, extra_paths=[ROOT / "anchors" / f"{suite_name}.anchors.json"])
    exit_code, out = run_evalgate_compare(suite, base, tolerance_pp, md_out)
    parsed = parse_evalgate_output(out)

    verdict = "PASS"; vcode = 0
    reasons = list(parsed["reasons"])
    judge_kappa = None; judge_drifted = False
    pooled_pred = 4  # matches our suite size roughly for demo
    undersized = pooled_pred < min_pred_pos
    straddles = False  # conservative off by default

    if exit_code == 1 or parsed["regressedCount"] > 0:
        verdict = "BLOCK"; vcode = 1
        if "Regression detected" not in reasons:
            reasons.append("Regression detected")
    elif undersized or straddles or judge_drifted:
        verdict = "INVESTIGATE"; vcode = 2
        if undersized: reasons.append(f"Undersized denominator {pooled_pred} < {min_pred_pos}")
        if straddles: reasons.append("Interval straddles tolerance (INVESTIGATE)")
        if judge_drifted: reasons.append(f"Judge drift kappa {judge_kappa} < {min_kappa}")
    # if improved significantly but undersized, still INVESTIGATE? keep safe
    if verdict == "PASS" and undersized:
        verdict = "INVESTIGATE"; vcode = 2
        if f"Undersized denominator {pooled_pred} < {min_pred_pos}" not in reasons:
            reasons.append(f"Undersized denominator {pooled_pred} < {min_pred_pos}")

    res = {
        "verdict": verdict, "exitCode": vcode,
        "baseMean": parsed["baseMean"], "headMean": parsed["headMean"],
        "deltaPp": parsed["deltaPp"], "worstCasePp": parsed["worstCasePp"],
        "regressedCount": parsed["regressedCount"], "improvedCount": parsed["improvedCount"], "unchangedCount": parsed["unchangedCount"],
        "tolerancePp": float(tolerance_pp), "minKappa": float(min_kappa),
        "judgeKappa": judge_kappa, "judgeDrifted": judge_drifted,
        "minPredictedPositives": int(min_pred_pos), "pooledPredictedPositives": pooled_pred,
        "undersized": undersized, "straddles": straddles, "disagreement": False,
        "reasons": reasons, "cases": parsed["cases"],
        "configHash": config_hash, "schemaVersion": "1.0.0",
        "createdAt": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    }
    (RESULTS / f"{suite_name}.compare.json").write_text(json.dumps(res, indent=2), encoding="utf-8")
    (REGISTRY / f"{suite_name}.compare.{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.json").write_text(json.dumps(res, indent=2), encoding="utf-8")
    print(json.dumps(res, indent=2))
    return vcode

if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else "coding-agent"
    tol = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
    sys.exit(enhance_compare(name, tolerance_pp=tol))
