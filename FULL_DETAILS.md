# Hellgate - Full Detailed Documentation

## 1. Problem Statement
People change LLM agent prompts/control loops, run a few examples, declare "feels better", and ship. This has no baseline, no noise measurement, no trust (reader must take author's word), and failed ideas are lost/retried.

Hellgate requires proof: a change only passes if independent machines re-run it and measure real gain. Failures are recorded in Graveyard with numbers.

## 2. Core Principles
- P1: Author never judges own change (author attestations ignored; need >= 2 distinct verifier keys)
- P2: Measure against noise (paired comparison + bootstrap CI)
- P3: Deterministic scoring (unit tests/cases decide, no LLM judges LLM)
- P4: Failure is data (rejected/broken/never-ran kept; nothing deleted)
- P5: Status is derived, never stored (verdict recomputed from evidence)
- P6: Evidence is self-authenticating (content-addressed + signed)
- P7: Honest wording (distinct keys, not people; known limits stated)
- P8: Replayable offline (recording enables verification without API key for replay)

## 3. Key Concepts & Terminology
| Term | Definition |
|---|---|
| Agent | Code around model (prompt/loop/reply parsing) in `agent/` |
| Build | Immutable snapshot of agent files; id = hash of canonical(files) |
| Suite | Benchmark tasks; id = hash of all task files including cases.mjs |
| Public suite | Visible tasks for development |
| Sealed suite | Held-out tasks (verifiers only); commitment pinned |
| Change | Signed proposal: parent, new build, claim, optional recording |
| Claim | Hypothesis, falsifiable condition, area, predicted effect (bp) |
| Recording | Captured model responses keyed by request hash (replayable) |
| Attestation | Verifier's signed paired measurement with CI |
| Verdict | Derived status: pending/accepted/rejected/contested/void |
| Receipt | Stellar tx (memo = record id) proving existence/timestamp |
| Ledger | Set of all records (union-mergeable) |
| Hub | HTTP server to store/serve records + export |
| Digest | Compact summary of gate path + graveyard |
| bp | Basis points (100 bp = 1%) |

## 4. Architecture Overview
Components: Engine+CLI (rules), Web app (display only, reads export), Hub (serve/store), CI action (verify PR).

Flow: Author proposes (edit+record+sign) ? publish to ledger ? >=2 verifiers verify (replay+measure+sign) ? decide() computes verdict ? export shows Gate/Graveyard/Receipts.

## 5. Canonical JSON (Single Source of Truth)
Rules:
- UTF-8
- Object keys sorted by Unicode code point
- No whitespace in encoded form conceptually (canonical byte representation)
- Numbers: safe integers only (no floats, NaN, Infinity, -0)
- true/false/null allowed; undefined throws
- Arrays preserve order

Implementation: `engine/src/core/json.ts` - `canonicalize()` validates and normalizes; `toCanonicalString()` produces canonical JSON string.

## 6. Hashing & IDs
- sha256(data): hex of SHA-256 over bytes (string UTF-8 or Uint8Array)
- hashCanonical(v): sha256(canonical JSON of v)
- makeRecordId(type, payload): hashCanonical({type,payload})
- makeBuildId(files): hashCanonical({type:'build', files})
- makeSuiteId(tasks): hashCanonical({type:'suite', tasks})

All IDs = 64 lowercase hex.

## 7. Signing (Ed25519 + Domain Separation)
Keys: Ed25519 keypair (Stellar keypairs use ed25519; same identity concept).
Current impl: sign over sha256(message) with ed25519 (simple). Protocol requires domain separation:
- message = "hellgate/v1/" + body.type + "\n" + canonical(body)

So signature binds to record type. A change sig cannot be reused as attestation.

Functions: generateKeyPair(), signMessage(secret, message), verifySignature(pubkey, message, sigHex)

## 8. Record Schemas (Ledger Types)
All records content-addressed by body hash. Signed records carry signature; unsigned (build/recording/receipt per some forms) stored as body.

### Change (signed by author)
Fields: id, type:'change', payload includes parentChangeId|null, buildId, suiteId, claim, recordingId|null, authorPublicKeyHex, timestamp; signature {publicKeyHex, signatureHex}

Claim: {text, falsifiable, area, predictedEffectBp}

### Attestation (signed by verifier)
payload: changeId, buildId, suiteId, verifierPublicKeyHex, parentDeltaBp/CI, changeDeltaBp/CI (scaffold), nSeeds, paired, sealedUsed, timestamp (+ full protocol adds runScores/taskMeans/effect/ci/call/mode/spotCheck/sealed/resultsDigest/env)

### Recording
type 'recording', payload with build,suite,model,runs,entries. Per protocol: entries sorted by key; key = hash of canonical request.

### Build (unsigned body conceptually)
{type:'build', files: {path: contents}} where paths under agent/

## 9. Scoring & Statistics

### Per-case/per-run scoring
- score(t,i) = floor(passed(t,i) * 10000 / n_t) (bp)
- runScore(i) = half_up_mean over tasks t of score(t,i)
- taskMean(t) = half_up_mean over runs i of score(t,i)
- d(t) = taskMean_cand(t) - taskMean_parent(t)
- effect = half_up_mean over tasks of d(t)

### half_up_mean
half_up_mean(xs) = floor((2*sum(xs) + |xs|)/(2*|xs|)) (arithmetic mean rounded half up)

### Bootstrap CI (task-resampled)
- T sorted task ids, m=|T|
- s0 = sha256(canonical({changeId, signer, suiteId, d: [d(t)..]}))
- For b in 0..B-1: resample m tasks with RNG seeded from s0,b,j ? stat_b = half_up_mean of d of resampled
- Sort stat_b ascending
- ciLow = stat[floor(0.025*B)], ciHigh = stat[ceil(0.975*B)-1] (B=2000)
- call: gain if ciLow>0 and effect>=minEffectBp; loss if ciHigh<0 and effect<= -minEffectBp; else noise

### resultsDigest
Hash of structured case outcomes: parent/candidate [ [ [case0/1..] per task ] per run ] in sorted order.

### Spot-check
- Sample k = policy.spotCheckTasks tasks: first k by sha256(signer + '|' + changeId + '|' + taskId)
- Run candidate live on run 0 for those k
- recordedBp vs liveBp (half-up means); ok = (recordedBp - liveBp) <= policy.spotCheckToleranceBp

## 10. Sandbox
Two-process model: Runner (parent) controls; Agent jail (child) runs agent code in restricted env; Test process (child) runs cases.mjs. 
Constraints: agent cannot read tests; filesystem read limited to jail; no network by default; no child processes from agent; primitives captured before solution loads. Prevents gaming.

## 11. Verdict (decide)
Pure function. Order:
1. Void if mechanical.status != 'ok'
2. Filter: signer!=author, match change/build/parentBuild/suite, runs>=3 odd, allowlist ok, sealed matches
3. Equivocation: if same signer gives conflicting attestations for change ? drop all their attestations for this change
4. Reproducibility checks (as specified)
5. Quorum: < minVerifiers ? pending
6. Conflict: gain + loss among counted ? contested
7. Apply gain/loss/noise rules per thresholds ? accepted/rejected/contested

Result includes status, code, reason, effect/CI, counted[], ignored[].

## 12. Current Implementation State
- Core: canonical/json/hash/ids/errors ?
- Identity: keygen/sign/verify (no domain sep yet) ? scaffold
- Ledger: types ?
- Verdict: basic (distinct count) ? scaffold
- Suite: loader + suite id ?
- Measure: mean/pairedDelta/bootstrapCI (simple) ? scaffold
- Model: types + Recorder ? scaffold
- Agent + example task ?
- Tests: 11 passing ?

Gaps: domain sep, request key, half-up mean + full bootstrap + scoring + resultsDigest, sandbox, propose/CLI/hub, Stellar, web/CI, full verdict.

## 13. Tech Stack
TypeScript ESM, Node 22+, @noble/ed25519, crypto, Vitest, Next.js (web), Stellar SDK concepts for receipts.

## 14. Files Created So Far
AUDIT_LOG.md, SUMMARY.md, PIPELINE.md, FULL_DETAILS.md. Engine modules: core/*, identity/*, ledger/*, suite/*, measure/*, model/*, verdict/* (dirs created; others pending). Tests in engine/test/.
