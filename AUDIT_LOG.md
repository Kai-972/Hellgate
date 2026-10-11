# Hellgate Implementation Audit Log

Progress against the task list and structural model.

## Completed (Phase 1 so far)
- [x] Repo scaffold (engine/src/*, agent, suites/public, suites/sealed, app, action, test)
- [x] Core: canonical JSON (sorted keys, integers only, no floats/undefined), sha256, hashCanonical, makeRecordId/makeBuildId/makeSuiteId
- [x] Identity: Ed25519 keygen/sign/verify
- [x] Ledger types: Change, Attestation, Recording, Claim, Signature
- [x] Verdict: decide() with distinct verifier count (pending if < 2)
- [x] Suite: loadTasks, makeSuiteIdFromTasks
- [x] Measure: mean, pairedDelta, bootstrapCI (simple quantile approx)
- [x] Model: types, Recorder
- [x] Genesis agent stub
- [x] Example public task
- [x] Tests: 11 passing

## Partially Implemented
- [~] Verdict: needs full rules (equivocation, resultsDigest, spot-check, call classification gain/loss/noise with minEffectBp, quorum, conflicts, void/rejected/accepted/contested)
- [~] Bootstrap CI: needs full task-resampled bootstrap with deterministic seeding (B=2000, seeded by s0)
- [~] Measure: needs half-up mean, per-test scoring, runScore/taskMean, d(t), resultsDigest
- [~] Model: needs request key computation (hellgate/request/1 per spec), full recording schema with entries keyed by hash, replay
- [~] Identity: needs domain separation "hellgate/v1/<type>\n" + canonical body

## Not Implemented
- [ ] Sandbox (agent jail, test runner, attestation channel)
- [ ] Propose (guards, typecheck, digest, evolve)
- [ ] Stellar (funding/receipts/Horizon verification)
- [ ] Hub (HTTP API: records, export, version, validation)
- [ ] CLI (propose/verify/check/serve/export)
- [ ] Full suite runner contract (TaskBrief, cases.mjs execution)
- [ ] Web app (Next.js, export-only)
- [ ] CI action
- [ ] Integration tests

## Structural Model - Implemented
- Canonicalization + content addressing + Ed25519 signing
- Set-based ledger types (immutable, content-addressed)
- Multi-party requirement (distinct verifiers)

## Structural Model - Missing
- Paired comparison per task + effect via half-up mean of d(t)
- Non-parametric bootstrap over tasks (deterministic seed from change/signer/suite)
- call = gain/loss/noise based on CI low/high and minEffectBp
- resultsDigest from case outcomes; reproducibility checks
- Spot-check sampling by hash(signer+changeId+taskId), tolerance
- Equivocation detection + handling
- Signed envelope with domain separation
- Recording request keys per protocol
