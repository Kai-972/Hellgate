# EvalGate - Production Ready Setup

## Quick Start
```bash
cd evalgate
npx -y @royalpinto007/evalgate@latest baseline configs/coding-agent.suite.yaml --out baselines/coding-agent.baseline.json
npx -y @royalpinto007/evalgate@latest compare configs/coding-agent.suite.yaml --base baselines/coding-agent.baseline.json --tolerance 0.01 --md evalgate-report.md
```

## Enhanced Gates (Tri-state: PASS/INVESTIGATE/BLOCK)
```bash
python scripts/prod_gate.py coding-agent 1.0        # includes judge calibration + gates
python scripts/enhance_gate.py coding-agent 1.0     # compare + tri-state
python scripts/calibrate_judge.py coding-agent      # κ/AC1 + drift check
python scripts/snapshot.py coding-agent             # registry snapshot
```

## Exit Codes
- 0 = PASS (ship)
- 1 = BLOCK (regression or judge drift)
- 2 = INVESTIGATE (undersized n / straddling / uncertainty) - HITL required

## Gates Enforced
- Regression detection with tolerance (point + CI-aware via evalgate)
- Judge calibration: Cohen's κ + Gwet's AC1, drift if κ < 0.70
- Minimum predicted positives (undersized → INVESTIGATE)
- Config hashes (suite + anchors) for freeze detection
- Immutable registry + results with timestamps, schema-validated

## CI
See `.github/workflows/evalgate.yml`. Uses enhanced gates in production flows.
Schemas: `schemas/baseline.schema.json`, `schemas/compare.schema.json`.