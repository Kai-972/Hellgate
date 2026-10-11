If structural changes (like column/schema/ingestion changes) occur:

- **Locked build**: Each change snapshots agent code by content hash (Build ID). Any structural change creates a new Build.
- **Replay must match**: Verifiers replay the recorded model calls against that exact Build. If the new code changes I/O shape, replay is inconsistent.
- **Automatic detection**: Mismatches show up as `resultsDigest` differences or spot-check score deltas ? verdict becomes `UNREPRODUCIBLE`/`RESULTS_MISMATCH`/`SPOT_CHECK_FAILED` (or `VOID` if it crashes/typechecks fail).
- **No silent pass**: These are non-accepted verdicts. CI runs `hellgate check` which exits non-zero ? PR fails and posts the failure details.
- **Manual fix required**: It raises a failure/flag, not auto-accept. You must fix the code to match, or re-record with the corrected build and create a new proposal.
