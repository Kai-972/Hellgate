# Answer to Judge: Handling Structural Changes in Sandbox Testing

## Question
"If there is any structural changes or any column ingestion in sandbox testing, so it also be there and if not matches it shows POS and raise a manual PR that it is not working or it needs to fix"

## Answer
Yes. Hellgate explicitly detects structural/schema mismatches. It will **NOT** silently pass - it will fail verification and require a manual fix (new proposal).

## How it works

### 1) Locked Build
Each change locks the exact agent code as a content-addressed Build (hash of all files). Any structural/column/ingestion change produces a new Build ID.

### 2) Replay must match
Verifiers replay the author's recording against the **same proposed Build**. The recording contains exact model requests+responses from that build context. If the new code changes I/O shape/structure, replay becomes inconsistent and is marked **unclean**.

### 3) Automatic mismatch detection
- **resultsDigest mismatch**: Tests produce different case outcomes due to structural changes ? digest differs. If verifiers disagree ? `CONTESTED` (`RESULTS_MISMATCH`). If digest differs from claimed ? `REJECTED` (`UNREPRODUCIBLE`).
- **Spot-check fails**: If live spot-check scores differ from recorded scores beyond tolerance ? `spotCheck.ok=false`. >=2 failures ? `REJECTED` (`UNREPRODUCIBLE`). Exactly 1 ? `CONTESTED` (`SPOT_CHECK_FAILED`).
- **Mechanical checks**: If structural change breaks typecheck/imports/crashes in sandbox ? `mechanical.status != 'ok'` ? `VOID` (proposal never runs to acceptance). Graveyard stores full tool output.

### 4) CI raises alert (manual PR required)
- Verdict is never auto-overridden. Any of the above gives non-accepted verdict.
- `hellgate check` exits non-zero in CI ? PR fails.
- CI posts a comment with failure reason (BUILD ID, resultsDigest mismatch, spot-check delta, mechanical detail).
- To proceed: fix the issue (e.g. update ingestion to match expected schema, or **re-record** against corrected build and propose new Change). Manual action required.

**In short:** If structure/columns don't match, Hellgate shows a **negative/POS-failing** result (REJECTED/CONTESTED/VOID) and raises a manual PR/failure - it does not pass. The fix is to correct code or re-record with a new proposal.
