# Hellgate - Full Pipeline Design

## Overview
Hellgate is a verification pipeline for AI agent changes. It enforces that improvements are proven via independent re-measurement with deterministic evidence.

## Core Principles
- Author never judges own change (need =2 distinct verifier keys)
- Measurement against noise (paired comparison + bootstrap CI), not single runs
- Deterministic scoring (canonical JSON + content addressing)
- Failure is data (Graveyard stores rejected changes with evidence)
- Status derived from evidence only (pure decide function)
- Self-authenticating evidence (signed + content-addressed)
- Replayable offline (recordings)

## Full Pipeline Flow

### Stage 1: Propose (Author Machine)
Inputs: agent edit, claim (hypothesis, falsifiable, area, predictedEffectBp)

Steps:
1. **Edit agent**: Modify files in `agent/` (prompt/loop/parsing etc.)
2. **Guards**: Validate paths (no reading tests), size limits, frozen files, import safety
3. **Typecheck/Lint**: Run checks on build
4. **Build snapshot**: Hash all agent files ? `buildId` (content of build)
5. **Record live run**: Run agent against public suite with model gateway. Capture request/response pairs. Store in Recording (keyed by request hash per protocol). 
6. **Compute claimed results**: Author measures parent vs candidate on same seeds ? stores `claimed.effectBp`, `claimed.resultsDigest`
7. **Create Change**: Assemble Change record (parent, buildId, suiteId, claim, recordingId, signer). Sign with domain-separated signature ("hellgate/v1/change\n" + canonical).
8. **Create receipt (optional)**: Submit Stellar tx with memo = changeId hash to get timestamp.
9. **Publish**: Push Change + Recording + Build to Ledger/Hub.

### Stage 2: Distribute (Ledger/Hub)
- Content-addressed records stored under `.hellgate/records/<id[0:2]>/<id>.json`
- Hub validates schema, id matches body hash, signatures valid, references exist
- Set-based: union merge (no ordering for verdict). Sync via git or hub push/pull.
- Export document `/v1/export` aggregates all records for web UI.

### Stage 3: Verify (Verifier Machines, =2 independent)
Each verifier does:
1. **Pull**: Fetch records from hub/ledger for changeId
2. **Validate**: Check all signatures, ids, schemas, references
3. **Replay recording**: In sandbox, replay captured requests against candidate build (deterministic). Must match responses or mark unclean.
4. **Live spot-check**: Sample k tasks by hash(signer+changeId+taskId). Run candidate live on run 0 for those tasks. Compare recorded vs live scores within tolerance.
5. **Sealed suite (if present)**: Run live on sealed tasks (not committed) to detect overfitting.
6. **Measure**: For each run/task get per-case scores (bp). Compute runScore, taskMean for parent/candidate. Get d(t)=taskMean_cand(t)-taskMean_parent(t). Compute effect = half-up mean of d(t).
7. **Bootstrap CI**: Task-resample B=2000 times with seeded RNG (seed derived from changeId/signer/suiteId + d list) ? get stat_b = half-up mean of resampled d(t). Sort ? ciLow = 2.5%ile, ciHigh = 97.5%ile.
8. **Classify call**: gain if ciLow>0 and effect>=minEffectBp; loss if ciHigh<0 and effect<= -minEffectBp; else noise.
9. **Compute resultsDigest**: Hash of structured case outcomes (parent/candidate per run per task per case).
10. **Sign Attestation**: Create Attestation with all measurements/mode/spotCheck/sealed/resultsDigest. Sign domain-separated ("hellgate/v1/attestation\n"+canonical).
11. **Push**: Publish attestation (+receipt to Stellar).

### Stage 4: Decide (Pure Function, deterministic)
Takes (change, attestations, policy). Runs in order:
1. **Void**: if change.mechanical.status != 'ok' ? void
2. **Filter**: keep only attestations where signer!=author, ids match (change/build/parentBuild/suite), runs>=3 odd, allowed, sealed matches
3. **Equivocation**: group by signer; if any signer has conflicting attestations for same change ? drop all that signer's attestations for this change (flag equivocation)
4. **Reproducibility**:
- Any counted replay attestation disagrees on resultsDigest ? contested (RESULTS_MISMATCH)
- >=minVerifiers counted share digest different from change.claimed.resultsDigest ? rejected (UNREPRODUCIBLE)
- >=2 have spotCheck.ok false ? rejected (UNREPRODUCIBLE)
- ==1 has spotCheck.ok false ? contested (SPOT_CHECK_FAILED)
5. **Quorum**: if < policy.minVerifiers counted ? pending (NEEDS_VERIFIERS)
6. **Conflict**: some call gain and some loss ? contested (CONFLICT)
7. **Gain path**: >= ceil(n/2)+? require majority of counted to be gain with ciLow>0 and effect>=margin? Per protocol: if all counted are gain (or meet threshold) and minEffectBp cleared ? accepted (GAIN). Exact thresholds per policy.
8. **Loss/Noise** ? rejected (REGRESSION/NO_EFFECT etc.)
Returns verdict with reason/codes, effect/CI, counted/ignored lists.

### Stage 5: Gate / Graveyard / Export
- Write export document (hellgate/export/1) with gatePath, curve, changes with attestations+receipts, verifiers, digest
- Web UI reads export only (no verdict computation)
- CI runs `hellgate check` ? exits non-zero if not accepted; posts verdict comment with receipts
- Accepted ? becomes new baseline (gate). Others ? Graveyard with full evidence.

## Tech Stack & Tools Used
- **Language**: TypeScript (Node 22+), ESM
- **Crypto**: @noble/ed25519 for signatures; Node crypto for SHA-256
- **Canonical JSON**: Custom encoder (single source of truth)
- **Testing**: Vitest
- **Storage**: Filesystem (`.hellgate/records/`) or Hub HTTP
- **Blockchain/Receipts**: Stellar (testnet/public) - memo hash of record id
- **Web**: Next.js (export-only consumer)
- **Sandbox**: Node subprocess with permission model (jail to agent dir, no network/tests access)
- **Model gateway**: Provider client (e.g. Gemini) with record/replay interface, rate limiting, budget

## Implementation Order (How to build it)
1. **Core + Identity** (done): canonical, hash, ids, ed25519, domain separation
2. **Ledger + Types** (done): record schemas
3. **Measure**: half-up mean, per-task scoring, runScore/taskMean, d(t), resultsDigest, deterministic bootstrap
4. **Model**: request key computation, full recording schema, replay logic
5. **Verdict**: full decide() per protocol (sections 8-9)
6. **Suite**: full task loading + cases contract
7. **Sandbox**: jail + test runner + attestation channel
8. **Propose**: guards, typecheck, digest, evolve flow
9. **Hub + CLI**: HTTP API + commands (propose/verify/check/serve/export)
10. **Stellar**: receipts + verification
11. **Web app + CI**: export consumer + action
12. **Integration tests**: end-to-end flow

## Key Data Structures
- Build: { files: Record<path, contents> } ? id
- Recording: { build,suite,model,runs, entries: [{key, response:{text,finish,inputTokens,outputTokens}}] } (sorted)
- Change: signed body with claim, parent/build/suite, recording, claimed, mechanical, signer
- Attestation: signed with parent/candidate runScores/taskMeans, effect/CI/call, spotCheck/sealed, mode
- Verdict result: status, code, reason, effect/CI, counted/ignored
