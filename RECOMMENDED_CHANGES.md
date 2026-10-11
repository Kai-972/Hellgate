# Recommended Implementation Changes to Handle This Explicitly

Based on judge concern: need explicit "structural/schema/column ingestion change" detection that shows POS/failure and triggers manual PR.

## 1. Add `structuralIngestionChanged` detection in mechanical/checks

In propose/verify path, detect when agent code changes affect expected I/O/schema vs recorded.
Add field in mechanical: `structuralIngestionChanged: boolean, structuralDetail?: string`

Detection ideas:
- Compare expected schema (from task/cases or recorded shape) vs actual outputs on dry run
- Hash of ingestion/column mapping files
- Detect when cases expect certain keys/columns and output shape differs

## 2. Strengthen resultsDigest to include shape/signature
Include output schema/column keys in resultsDigest computation (not just pass/fail). So any column/field addition/removal changes digest.

Current: resultsDigest hashes case outcomes (0/1). Enhance to also hash normalized output shape per case (sorted column names/keys) ? structural change forces digest mismatch.

## 3. Add explicit "Schema Mismatch" verdict code
Add new codes: SCHEMA_MISMATCH, INCOMPATIBLE_RECORDING
Map to:
- If replay detects shape mismatch vs recording ? mark batch unclean + add reason
- On decide: unclean replay with structural reason ? REJECTED, code SCHEMA_MISMATCH, reason "Structural/column ingestion mismatch vs recording - re-record required"

## 4. Make mismatch explicit in Attestation
In Attestation, add: `replay.clean`, `replay.issues[]` (e.g. "output missing column 'x'", "shape mismatch at task t1 case c0")
This makes it visible in export/CI.

## 5. Enforce in CI/CLI
- `hellgate check` should report SCHEMA_MISMATCH clearly as "POS/FAIL - structural changes detected; recording incompatible. Re-record and create new proposal."
- Exit code non-zero, post PR comment with actionable fix.

## 6. Mechanical guard: detect breaking changes early
If proposed build cannot produce outputs matching task schema ? mechanical.status = 'incompatible-schema', detail explains columns/fields missing/added ? VOID or REJECTED with clear message.

## Actionable minimal change
Add explicit check in replay: validate output structure (keys/columns/types) against expected from recording or task schema. If mismatch ? set clean=false, issue="structural_mismatch:<detail>". Verdict treats this as UNREPRODUCIBLE with explicit code. Update reason strings to say "Structural/column ingestion change detected - recording is incompatible with new build. Please re-record and submit a new change."

This makes it show as POS/failure and forces manual PR (new proposal).
