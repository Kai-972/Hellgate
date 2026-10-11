#!/usr/bin/env python3
import json, sys, os
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
ANCHORS = ROOT / "anchors"
RESULTS = ROOT / "results"
REGISTRY = ROOT / "registry"

# import calibrate
sys.path.insert(0, str(ROOT / "scripts"))
from calibrate_judge import calibrate

def run_gate(suite="coding-agent", tol_pp=1.0, min_kappa=0.70, min_pred_pos=40):
    # get calibration
    cal = calibrate(suite)
    # run enhanced gate
    import subprocess
    res = subprocess.run([sys.executable, str(ROOT / "scripts" / "enhance_gate.py"), suite, str(tol_pp)], cwd=ROOT, capture_output=True, text=True)
    if res.returncode == 99:
        print(res.stderr); return 99
    gate = json.loads(res.stdout) if res.stdout.strip() else {}
    # merge calibration
    gate.update({
        "judgeKappa": cal.get("kappa"),
        "judgeAc1": cal.get("ac1"),
        "judgeDrifted": cal.get("drifted", False),
        "minKappa": min_kappa,
    })
    # re-evaluate verdict if drifted
    if cal.get("drifted"):
        gate["verdict"] = "BLOCK"
        gate["exitCode"] = 1
        if "Judge drift" not in " ".join(gate.get("reasons", [])):
            gate.setdefault("reasons", []).append(f"Judge drift kappa {cal.get('kappa')} < {min_kappa}")
    # write
    ts = datetime.utcnow().strftime('%Y%m%d%H%M%S')
    RESULTS.mkdir(exist_ok=True); REGISTRY.mkdir(exist_ok=True)
    (RESULTS / f"{suite}.gate.json").write_text(json.dumps(gate, indent=2))
    (REGISTRY / f"{suite}.gate.{ts}.json").write_text(json.dumps(gate, indent=2))
    print(json.dumps(gate, indent=2))
    return gate["exitCode"]

if __name__=="__main__":
    name = sys.argv[1] if len(sys.argv)>1 else "coding-agent"
    tol = float(sys.argv[2]) if len(sys.argv)>2 else 1.0
    sys.exit(run_gate(name, tol_pp=tol))
