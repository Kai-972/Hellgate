# What Needs to Change (Practical Answer for Judge)

Judge says: handle structural/column ingestion changes (detect, show POS/failure, raise manual PR) + controlled replication prod->non-prod.

## 1. Controlled Replication (Prod ? Non-Prod)

**Problem:** Need safe, controlled sync (not accidental leakage of sealed/production data).

**Changes needed:**
- **Environment flag**: `HELLGATE_ENV=prod|nonprod` to know environment
- **Signed replication manifest**: Prod signs list of record IDs (change/build/recording) allowed to copy. Non-prod verifies signature before accepting.
- **One-directional + allowlist**: Only allow prod?nonprod, whitelist what can replicate. Block `sealed/` unless explicitly allowed with extra approval.
- **Dry-run + audit**: Log every replication (who/when/what). Add `hellgate replicate --from prod --to nonprod --dry-run` to preview.
- **Hub guard**: If non-prod, block pulling unapproved artifacts (enforced via manifest check)

**Why:** Controlled, auditable, prevents leaking held-out tests (sealed suite).

## 2. Structural/Column Ingestion Change Detection

**Problem:** If schema/columns change, old recording is incompatible. Must fail, not pass.

**Changes needed:**

### (a) Schema contract
Add optional `schema.json` per task defining expected output structure (required columns/fields). Also store a hash of expected schema in Recording when created.

### (b) Validate on replay (key point)
When verifiers replay recorded calls against new build, validate actual agent outputs match expected schema. If missing/extra/changed columns ? flag as **structural mismatch**.

### (c) Record mismatch explicitly
- Mark replay as `clean=false` with `issues[]` (e.g. "column 'amount' missing", "unexpected columns in output")
- Include this in Attestation (transparent)

### (d) Verdict must treat as failure (POS)
Map structural mismatch to verdict:
- If structural mismatch detected ? treat as `UNREPRODUCIBLE` (or new `SCHEMA_MISMATCH`) 
- Result: **NOT accepted** (REJECTED/VOID/CONTESTED as appropriate)
- Reason becomes explicit: "Structural/column ingestion change detected. Recording incompatible with new build. Re-record required."

### (e) Mechanical check early
On propose, detect incompatible schema early ? set `mechanical.status='schema-mismatch'` ? Verdict **VOID**, with clear detail. Fails before spending verifier compute.

### (f) CI must fail with clear message
Update `hellgate check`: when structural mismatch occurs, print "POS: STRUCTURAL/INGESTION MISMATCH - Recording incompatible with new build. Fix code OR re-record and create a new proposal." Exit code 1 ? PR fails (manual PR required). No silent pass.

## How This Directly Answers Judge
- **"shows POS and raise a manual PR"**: Non-accepted verdict + CI exit 1 + explicit POS message ? PR fails, forces manual action
- **"it is not working or needs to fix"**: Reason string tells exactly: re-record or fix schema/code
- **"controlled replication from prod to non-prod"**: Signed manifest + env allowlist + one-direction + audit + sealed-data protection

**Minimal fix first:** Add output schema validation in replay, set clean=false on mismatch, map to UNREPRODUCIBLE with explicit reason, make CI print POS message and fail. Add env-based signed manifest for prod?non-prod replication.
