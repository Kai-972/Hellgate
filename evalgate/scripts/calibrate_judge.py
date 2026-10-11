#!/usr/bin/env python3
# judge calibration helper (κ/AC1)
import json, sys
from pathlib import Path
from math import sqrt

ROOT = Path(__file__).resolve().parent.parent
ANCHORS = ROOT / "anchors"

def cohens_kappa(a: list[int], b: list[int]):
    if len(a) != len(b) or len(a) == 0: return None, 0,0
    classes = set(a) | set(b)
    n = len(a)
    po = sum(1 for x,y in zip(a,b) if x==y)/n
    # marginals
    from collections import Counter
    ca, cb = Counter(a), Counter(b)
    pe = sum((ca.get(c,0)*cb.get(c,0)) for c in classes)/ (n*n) if n>0 else 0
    if pe >= 1.0: k = 1.0 if po >=1.0 else 0.0
    else: k = (po-pe)/(1-pe)
    return round(k,4), po, pe

def gwet_ac1(a: list[int], b: list[int]):
    if len(a) != len(b) or len(a) == 0: return None
    from collections import Counter
    n = len(a)
    agree = sum(1 for x,y in zip(a,b) if x==y)
    # category probs
    ca, cb = Counter(a), Counter(b)
    cats = set(ca)|set(cb)
    pe2 = sum((ca.get(c,0)/n)*(cb.get(c,0)/n) for c in cats)
    if pe2 >= 1.0: return 1.0
    ac1 = (agree/n - pe2)/(1-pe2)
    return round(ac1,4)

def calibrate(name: str):
    p = ANCHORS / f"{name}.anchors.json"
    if not p.exists():
        return {"ok": False, "error": "anchors missing"}
    data = json.loads(p.read_text())
    a,b=[],[]
    for r in data:
        hl = r.get("human_label", 0)
        jl = r.get("judge_label", hl)  # fallback if missing
        a.append(int(hl)); b.append(int(jl))
    k,po,pe = cohens_kappa(a,b)
    ac1 = gwet_ac1(a,b)
    drift = k is not None and k < 0.70
    return {
        "ok": True, "n": len(a), "kappa": k, "ac1": ac1, "po": round(po,4), "pe": round(pe,4),
        "minKappa": 0.70, "drifted": drift
    }

if __name__=="__main__":
    name = sys.argv[1] if len(sys.argv)>1 else "coding-agent"
    print(json.dumps(calibrate(name), indent=2))
