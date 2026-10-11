# Suggested Fix: Controlled Replication from Prod to Non-Prod + Structural Change Handling

## The Judge's Concern (expanded)
"When there is structural change or column ingestion change in sandbox testing, it must be detected. If it doesn't match, show POS/failure and raise a manual PR saying 'not working / needs fix'. Also need controlled replication from prod to non-prod."

## What needs to be added

### A) Controlled Replication (Prod -> Non-Prod)
We need a controlled way to sync baseline artifacts from prod to non-prod safely.

Suggested approach:
1. **Replication manifest** - signed file listing allowed records (change/build/recording ids) to replicate
2. **Allowlist by env** - `HELLGATE_ENV=prod|nonprod`. Non-prod can only pull from allowed sources
3. **Seal/commit hash** - compare suite/sealed commitments; don't replicate sealed suite to non-prod unless explicitly allowed
4. **Dry-run + checksum** - `hellgate replicate --from prod --to nonprod --dry-run` shows diff
5. **Signed replication** - require prod signer approval (signed manifest) to prevent leaking sealed data

Files to add:
- `engine/src/replicate/manifest.ts` - manifest schema + signing/verification
- `cli/replicate` command
- config: `replication.allowlist`, `env` flag

### B) Structural/Column Ingestion Change Detection (enforce POS/failure)
Make it explicit and automatic.

Key changes:

1. **Schema contract per task** - Add `schema.json` (optional but recommended) in each task: expected output keys/columns/types
   - e.g. `{ "columns": ["id","name","amount"], "required": true }`

2. **Enforce in replay** - When replaying recorded responses against new build, validate actual agent output shape matches expected schema for that task
   - If missing/extra columns or type change ? treat as structural mismatch

3. **Record schema snapshot** - Store `outputSchema` hash in Recording per task (or overall). Compare on replay.

4. **New verdict codes** - Add `SCHEMA_MISMATCH`, `RECORDING_INCOMPATIBLE`, `REPLICATION_BLOCKED`

5. **Mechanical validation on propose** - Run agent in "schema check" mode against starter/tasks? If structure incompatible ? `mechanical.status='schema-mismatch'`, detail says which columns missing/added ? VOID with clear reason

6. **Attestation must report** - Add `replay.issues` array; if any structural issue ? `clean=false`, counted? likely excluded or causes UNREPRODUCIBLE

7. **CI behavior** - When structural mismatch detected: 
   - Verdict non-accepted (REJECTED/VOID)
   - CI comment: "POS: STRUCTURAL/INGESTION MISMATCH detected. Recording incompatible with new build. Action required: fix code OR re-record and open new proposal."
   - Exit 1 (fail)

### C) Concrete minimal code change
In `model/replay.ts` (new):
```ts
validateOutput(actual, expectedSchema) {
  // compare keys, required columns
  if mismatch -> throw StructuralMismatch(detail)
}
```

In verdict: if any attestation has structural issues ? treat as `UNREPRODUCIBLE` with explicit reason.

In CLI `check`: format reason clearly for PR comment.

### D) Controlled Replication Implementation Details
- Only allow replicating from prod ? non-prod (one direction) 
- Never replicate `sealed/` unless `ALLOW_SEALED_REPL=1` and signed
- Compare build hashes before applying
- Write audit log for replication actions (who, when, what ids)
- Hub API: add `POST /v1/replicate` gated by auth + env

## Quick answer to judge
"Yes. We enforce controlled prod?non-prod replication via signed manifest + env allowlist. For structural/column changes: build is content-locked; replay validates output schema against recorded/expected shape. Any mismatch marks replay unclean and results in UNREPRODUCIBLE/SCHEMA_MISMATCH ? verdict not accepted, CI fails with 'POS: Structural/ingestion mismatch – re-record required' and forces a manual PR/fix (no silent pass)."
