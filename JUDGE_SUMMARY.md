# Hellgate - Judge Summary (Presentation)

## Problem
People tweak AI agent prompts/logic, test a few cases, say "feels better", and ship. No baseline, no noise check, no independent verification, and failed ideas are forgotten/repeated.

## Solution
Hellgate: **Prove AI changes with independent, measurable evidence.** A change only passes if >= 2 independent verifiers re-run it and show a real gain. Failures go to the "Graveyard" with full evidence.

## Core Idea
"Trust comes from independent re-measurement, not from the author."

## How It Works (Pipeline)
1. Propose - Author edits agent, records live runs on benchmark, signs a Change with claim.
2. Distribute - Signed, content-addressed records go to Ledger/Hub (set-based).
3. Verify - >= 2 verifiers replay recording in sandbox, do paired measurement + bootstrap confidence interval, check sealed suite, sign Attestation.
4. Decide - Pure function checks distinct verifiers, equivocation, reproducibility, spot-checks, quorum, conflicts.
5. Gate/Graveyard - Accepted passes Gate (becomes baseline). Rejected/contested/void go to Graveyard with evidence.

## Key Principles
- Author never judges own change (needs >= 2 other verifier keys)
- Paired comparison with bootstrap CI (measures against noise)
- Deterministic: canonical JSON + content hashes + signed records
- Self-authenticating & replayable offline
- Failure is data - nothing deleted
- Verdict derived purely from evidence

## What We Built
- Canonical JSON (sorted keys, integers in bp), SHA-256, content IDs
- Ed25519 signing + ledger types (Change/Attestation/Recording)
- Suite loader + basic stats + recorder
- Verdict with distinct-verifier check
- Genesis agent + example task
- 11 passing tests

## Result
Hellgate turns "I think it's better" into "Here is proof independent verifiers reproduced it."
