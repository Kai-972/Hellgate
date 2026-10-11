#!/usr/bin/env python3
import json
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
BASELINES = ROOT / "baselines"
SUITES = ROOT / "configs"

def baseline_snapshot(name: str):
    suite = SUITES / f"{name}.suite.yaml"
    base = BASELINES / f"{name}.baseline.json"
    snap = {
        "name": name,
        "timestamp": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "suiteExists": suite.exists(),
        "baselineExists": base.exists(),
        "schemaVersion": "1.0.0"
    }
    if base.exists():
        snap["baseline"] = json.loads(base.read_text())
    # simple hash
    import hashlib
    h = hashlib.sha256()
    if suite.exists(): h.update(suite.read_bytes())
    if base.exists(): h.update(base.read_bytes())
    snap["hash"] = h.hexdigest()
    out = ROOT / "registry" / f"{name}.snapshot.{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.json"
    ROOT.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snap, indent=2))
    print(json.dumps(snap, indent=2))
    return snap

if __name__=="__main__":
    import sys
    name = sys.argv[1] if len(sys.argv)>1 else "coding-agent"
    baseline_snapshot(name)
