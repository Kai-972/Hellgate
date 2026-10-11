# evalgate pipeline (pre-benchmark → prod→non-prod replication → HITL)

## 1) Pre-benchmark (before comparing vs previous)
- [x] Frozen rubric + anchors (anchors/coding-agent.anchors.json)
- [x] Versioned suite/configs (configs/*.yaml)
- [x] Baseline stored (baselines/*.json)
- [ ] Seal holdout (blind labeling, refusal on assisted) — add goldgate later
- [ ] Judge calibration (κ/AC1) against anchors; block on drift
- [ ] Multi-trial (Pass@k/Pass^k) + env matrix + stratified sampling

## 2) Comparison vs previous (pipeline)
- [x] Paired compare with tolerance (evalgate compare)
- [x] CI-bounded deltas + worst-case pp drop
- [ ] Wilson CI on pass-rate + delta, McNemar for paired
- [ ] Non-inferiority/conformal gate (ship/investigate/block)
- [ ] PPI awareness (random/stratified; never uncertainty with PPI)

## 3) Controlled replication prod→non-prod (parallel changes)
- [x] Versioned suites/baselines
- [ ] Immutable registry (content hashes) for datasets/rubrics/judges
- [ ] Shadow canary on stratified prod sample (OTel GenAI spans)
- [ ] Configuration freeze check at eval time
- [ ] Isolated sandboxes + temporal firewall (separate from grading artifacts)
- [ ] Stage gates (shadow→canary→ring→full) with CI bounds

## 4) Conflict detection + HITL
- [x] Regression → BLOCK (exit 1)
- [x] Removed cases tracked
- [ ] Interval straddles tolerance → INVESTIGATE (HITL), no auto-ship
- [ ] Judge drift (κ<min) → BLOCK + HITL
- [ ] Evaluator disagreement / order-swap inconsistent → HITL
- [ ] Undersized denominator (< minPredPos) → refuse to gate (HITL)
- [ ] Trajectory-opaque misses (use traces/logs/snapshots) → HITL
- [ ] Benchmark defects detected → HITL

## CLI (working now)
```bash
cd D:\hackinverse\Hellgate\evalgate
npx -y @royalpinto007/evalgate@latest baseline configs/coding-agent.suite.yaml --out baselines/coding-agent.baseline.json
npx -y @royalpinto007/evalgate@latest compare configs/coding-agent.suite.yaml --base baselines/coding-agent.baseline.json --tolerance 0.01
```

Exit code 1 on regression (CI blocks). Markdown report available with --md.
