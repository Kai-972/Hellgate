# Hellgate Pipeline - Simple Step-by-Step Explanation

## The Big Idea
Right now, when someone changes an AI agent (prompt, logic), they just say "it feels better". Hellgate forces them to **prove** it with math and independent verification.

## Step 1: Propose (Author)
**Goal:** The person who made the change creates a proposal with evidence.

What happens:
1. **Edit** - Change the agent code/prompt in `agent/`
2. **Record live run** - Run this new agent on benchmark tasks. Record every model request+response (so others can replay exactly)
3. **Claim** - Write: "I claim this improves by X%. If false, say why"
4. **Build snapshot** - Save hash of all agent files (so version is locked)
5. **Sign** - Digitally sign the proposal (proves who proposed)

Result: A "Change" record + "Recording" of live runs.

## Step 2: Publish to Ledger
**Goal:** Make evidence public & tamper-proof.

- Records are hashed (content-addressed). Changing anything breaks the hash.
- Signed with Ed25519 keys.
- Stored in a set (not a chain) - anyone can sync by union.
- Others can pull and verify independently.

## Step 3: Verify (Independent Verifiers)
**Goal:** At least 2 other people/machines must independently check.

Each verifier does:
1. **Pull** - Get the proposal + recording
2. **Replay** - Run the NEW agent using the exact same recorded requests (no API needed). Must match.
3. **Compare** - Run BOTH old and new on same benchmark tasks, same seeds.
4. **Measure difference** - For each task: (new score - old score). Average across all tasks.
5. **Check noise** - Use bootstrap (resample tasks many times) to get confidence interval. Is gain real or luck?
6. **Spot-check** - Randomly pick a few tasks and run live (catch fakes)
7. **Sign Attestation** - If convinced, sign report with numbers (effect + confidence range)

**Key:** Verifiers do NOT trust author. They recompute everything.

## Step 4: Decide (Automatic, Pure Math)
**Goal:** Computer decides based only on evidence.

System checks:
- >= 2 distinct verifiers signed (not the author)
- No one is signing conflicting reports (equivocation)
- Replays match (reproducible)
- Spot-checks pass
- Gain is statistically meaningful (confidence interval doesn't cross zero) AND above minimum threshold
- No major conflict (some say gain, others say loss)

Outcomes:
- **ACCEPTED** - Real, reproducible gain ? passes "Gate", becomes new baseline
- **REJECTED** - No real gain / regression / not reproducible
- **CONTESTED** - Verifiers disagree strongly
- **PENDING** - Need more verifiers
- **VOID** - Proposal broken/invalid

## Step 5: Gate or Graveyard
- **Gate** = Winners go here. New version becomes the baseline future changes compare against.
- **Graveyard** = Losers stay here FOREVER with full evidence (claim, measured effect, CIs, who verified, why rejected). Prevents retrying same bad idea.

## Why This is Trustworthy
- **No self-approval**: Author can't count their own vote
- **Reproducible**: Others can replay and get same result
- **Noise-aware**: Bootstrap CI catches "lucky run" gains
- **Tamper-proof**: Hashes + signatures
- **Transparent**: All numbers published
- **Offline-verifiable**: Just need records, can replay without calling model

## Simple Analogy
Like a drug trial: drug must be tested by independent labs on same protocol. If multiple independent labs confirm benefit statistically, approve. If not, publish negative results so others don't repeat.
