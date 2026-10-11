# Hellgate - Full Summary

## What is Hellgate?
Hellgate is a "proof system" for AI agent changes. Instead of saying "this prompt feels better", authors must prove it with measurable evidence from independent verifiers. Failed changes go to a Graveyard with full evidence so they aren't repeated.

Core idea: **Trust comes from independent re-measurement, not from the author.**

## The Pipeline (How it works)
1. **Propose** (Author): Edit agent code/prompt ? guards/checks ? record live model runs on benchmark tasks ? sign a Change record with claim + recording.
2. **Publish**: Push signed records to Ledger/Hub (content-addressed set; syncing is union).
3. **Verify** (=2 independent verifiers): Pull evidence ? replay recording in sandbox + optionally live spot-check + sealed suite ? compute paired deltas per task ? bootstrap CI over tasks ? classify as gain/loss/noise ? sign Attestation.
4. **Decide** (Pure function): `decide()` filters/validates attestations, detects equivocation, checks reproducibility/spot-checks, enforces quorum/conflicts ? returns verdict (pending/accepted/rejected/contested/void).
5. **Gate/Graveyard**: Accepted changes become new baseline (through gate). Rejected/contested/void go to Graveyard with full evidence. Results exported to web/CI.

## What We've Built So Far
**Core primitives (deterministic identity/evidence):**
- Canonical JSON: sorted keys, integers only (bp), no floats/undefined ? stable hashing/signing.
- Content addressing: SHA-256 of canonical body; IDs for records/builds/suites.
- Ed25519 signing: generate keys, sign, verify (same key format concept as Stellar).
- Ledger types: Change/Attestation/Recording/Claim/Signature (schemas defined).

**Verification scaffolding:**
- Verdict: checks distinct verifiers; returns pending if < 2. (Full protocol rules pending.)
- Suite: load public tasks from disk; compute suite ID from all task files.
- Measure: mean, pairedDelta, bootstrapCI (simplified quantile). (Needs full task-bootstrap + half-up mean.)
- Model: types + Recorder to capture request/response pairs for replay.

**Scaffolding:**
- Genesis agent stub + example public task + repo layout + 11 passing tests.

## What Still Needs to Be Built (to match full protocol)
- **Measure/Stats**: half-up mean, per-task scoring, runScore/taskMean, d(t), resultsDigest from case outcomes.
- **Model/Recording**: request key = hash of canonical request (with model/system/messages/maxTokens/temperature100/stop/seed), full recording schema with keyed entries, replay.
- **Identity**: domain separation `hellgate/v1/<type>\n` + canonical body.
- **Verdict**: full logic (void, filtering, equivocation, resultsDigest match, spot-check, quorum, conflict, call classification gain/loss/noise with minEffectBp).
- **Bootstrap**: deterministic task-resampling (B=2000) seeded from change/signer/suite per protocol.
- **Sandbox**: agent jail, test runner, attestation channel (isolate agent from tests).
- **Propose/CLI**: propose/verify/check/serve/export commands + guards/typecheck/digest.
- **Hub**: HTTP API to push/pull/validate records, export, version.
- **Stellar**: receipts + Horizon verification (link evidence to tx).
- **Web app + CI action**: display Gate/Graveyard/Receipts; PR verification.

## Key Properties (Design Goals)
- **Author never judges self**: author attestations ignored; need =2 distinct verifier keys.
- **Independent re-measurement**: verifiers replay on same seeds; paired comparison with CI.
- **Deterministic evidence**: canonical JSON + content IDs + signed records.
- **Set-based ledger**: union merge, no single chain required for consensus on verdict.
- **Failure is data**: rejected ideas kept in Graveyard with numbers.
- **No API key needed to replay**: recordings enable offline verification.
