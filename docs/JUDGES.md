# Hellgate for judges: the technical overview

Hellgate is a referee for changes to AI systems. A change passes **the gate** only when verifiers
holding *other keys* re-run it and measure a real gain. A change that fails is kept in **the graveyard**
with the numbers that killed it. This page says what is built, how it works, and where it stops.

## What is real in this repository

| Part | State |
|---|---|
| Two domains on one pipeline: a **learning algorithm** (`ml`, 12 tasks, 2,400 hidden test points) and an **LLM coding agent** (`code`, 16 tasks, 182 hidden test cases) | built, two committed trees |
| Signed, content-addressed records; ed25519 keys that are also Stellar addresses | built |
| Sandbox that keeps the hidden tests and labels away from the code under test | built, with an attack test for each wall |
| Gateway for Gemini and Groq with record, replay, budgets and rate limits | built, used live |
| Statistics: paired comparison, bootstrap interval, minimum effect | built, cross-checked against an independent Python implementation |
| A pure verdict rule over the evidence | built, 25 tests covering every verdict path |
| CLI, hub with live job streaming, web app | built |
| **Beat the gate**: a visitor's one instruction, measured live and verified by two keys | built (needs a model key and minutes) |
| Live spot-checks, a held-out sealed suite, Stellar receipts, an AI proposer | designed in the protocol; not part of this demo |

The engine has 168 tests (one slow test is optional). Run them with `pnpm test`.

## How a change is judged

1. **Change and claim.** A change is a new version of the files under test plus a claim: the hypothesis,
   the expected gain, and what result would prove it wrong. A claim with no number is refused.
2. **Guards.** Before anything runs: at most 2 files and 120 changed lines, the frozen contract and the
   entry signature untouched, relative imports only, and no `eval`, `process`, `fetch` or `import()`.
   A change that fails is stored as `void` with the exact reason.
3. **Measure.** The author runs old and new versions on the whole suite five times, on the same seeds.
   For the coding agent every model answer is recorded.
4. **Verify.** Two or more *other* keys re-run both versions. For code they **replay the recorded
   answers** through the real tests (no key, no network); for ML they train again from scratch.
5. **Decide.** A fixed rule turns attestations into a verdict. The author's own numbers never count.

### The statistics, plainly
Scores are test cases passed, counted as whole numbers of basis points (100 = 1 point), so every
machine computes the same bytes. For each task we take the mean over runs, subtract the parent's mean
on the same seeds (a **paired** difference), and then bootstrap over *tasks* (2,000 resamples, a fixed
seed) to get a 95% interval. A change is a **gain** only if the whole interval is above zero **and** the
effect is at least 3 points. Otherwise it is noise: a few lucky tasks do not pass.

### Catching dishonesty
- **Lazy verifier.** Replay is deterministic, so honest verifiers produce an identical *results digest*
  (a hash of every per-case result). One that signs copied numbers without running anything has a
  different digest and the change becomes `contested (RESULTS_MISMATCH)`. Both trees contain a real one.
- **Cheating agent.** A change that imports the file system to read the answers is stopped by the guard;
  and even without the guard the hidden tests live in a separate process fed over a pipe, with a
  one-time nonce on every result line, so the code under test cannot forge a pass.
- **Self-approval.** An attestation from the change's own key is ignored; two attestations from one key
  count once.
- **Infrastructure failures are never scores.** A rate limit or a network error is an error, not a zero.

## What the committed trees show (all measured, nothing edited)

**ML tree**: baseline 63.1% → standardise inputs 84.3% (+21.1, accepted) → Adam 91.9% (+28.7 over the
base, accepted). Momentum looked +6.7 better and was **rejected**: its interval crosses zero. Rebalancing,
cosine decay and a learning-rate nudge were no effect; dropping standardisation was a regression; a
cheating change was void; a faked verification was contested.

**Coding tree**: the baseline agent scores 44.5%. Showing the model its function signatures: +12.8
(accepted). Sending the full task brief: +37.0, to 94.3% (accepted). Rewording the prompt to sound more
expert: +0.5, no effect, then contested by a lazy verifier. Reading the tests: void.

## Honest limits
- **Distinct keys are not distinct people.** One person can hold two keys. The verdict says "keys".
- **Sixteen tasks are evidence, not proof**, and a gate that passes means "re-measured by distinct keys
  on this suite", not "good in the real world". A sealed held-out suite is designed to catch overfitting.
- **A replay is not a fresh model call.** It re-scores recorded answers against the real tests. The
  protocol adds live spot-checks to catch a made-up recording; they are not built yet.
- **Free-tier models.** Live recording is limited by the provider's daily quota; verification costs none.
- **Scoring is deterministic tests, never a model judging a model.**

## Where to look
[ARCHITECTURE](ARCHITECTURE.md) (what and why) · [PROTOCOL](PROTOCOL.md) (records, hashing, the verdict
rule) · [PIPELINE](PIPELINE.md) (a change from idea to verdict) · [DEMO](DEMO.md) (the runbook) ·
[STAGES](STAGES.md) (what is built) · `engine/src/verdict/decide.ts` (the whole verdict rule, in one file).
