# Points to Address Judge Concerns

## Concern: Structural changes / column ingestion in sandbox testing
"if there is any structral chnages or any column ingestion in sanbox testing so it also be there and if not matches it shows pos and raise a maunal pr that it is not working or hitl need to fix"

## How Hellgate Handles This

### 1. Build is a Content-Addressed Snapshot
- Every Change locks the full agent code as a Build (hash of all files in `agent/`)
- If structure/columns/schema ingestion code changes, Build ID changes
- Evidence is tied to that exact Build - old recordings/attestations don't auto-match

### 2. Sandbox Isolation
- Agent runs in isolated jail (separate process)
- Limited filesystem access (only agent jail dir)
- Cannot read test cases
- Prevents agent from seeing evaluation details (prevents gaming)
- Test runner runs separately from agent

### 3. Reproducibility via Recordings
- Recording captures exact model requests + responses for that Build + Suite
- Verifiers replay against the SAME Build (the proposed one)
- **Structural mismatch detection**: If replay produces different behavior/output structure vs recorded, the resultsDigest won't match OR replay is marked unclean ? leads to UNREPRODUCIBLE

### 4. Deterministic Verification (Catches Mismatches)
Per protocol (Reproducibility checks):
- If verifiers disagree on resultsDigest ? CONTESTED (RESULTS_MISMATCH)
- If counted attestations share digest different from claimed.resultsDigest ? REJECTED (UNREPRODUCIBLE)
- Spot-check: live run vs recorded scores must match within tolerance. If structure changes break replay, scores differ ? spotCheck.ok false ? REJECTED/CONTESTED (UNREPRODUCIBLE/SPOT_CHECK_FAILED)

### 5. Mechanical Validation (Catches Broken Builds Early)
Change has `mechanical.status`:
- bad-path/too-large/frozen-file/bad-import/typecheck/crash ? status != 'ok' ? VERDICT = VOID
- So if structural changes break compilation/typecheck or cause crashes in sandbox, proposal becomes VOID (never reaches acceptance). Graveyard records why.

### 6. Raising Manual PR / Alerting
When verification fails due to mismatch (UNREPRODUCIBLE/RESULTS_MISMATCH/SPOT_CHECK_FAILED/VOID):
- Verdict is NOT accepted
- Goes to Graveyard with full evidence (which Build, what failed, digest mismatches, tool output)
- Export/documentation shows exact failure reason
- CI (`hellgate check`) exits non-zero ? fails PR, can post comment with failure details. Requires manual fix/repropose (new Change). No auto-accept.

### 7. Column/Ingestion Schema Changes Specifically
- If ingestion/column handling changes structure of outputs consumed by tests, case outcomes change ? resultsDigest differs
- Replay of old recording against new code may be inconsistent ? marked unclean
- Verifiers detect mismatch ? verdict rejects/contests
- This is correct: change is not reproducibly equivalent; needs re-recording/proper validation

**Bottom line:** Mismatches are detected automatically (resultsDigest + spot-check + mechanical checks). They do NOT silently pass - they produce UNREPRODUCIBLE/CONTESTED/VOID and force a manual fix (new proposal). The system "raises a flag" via verdict + CI failure.
