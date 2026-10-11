# Understanding Hellgate and the website

Read this first if the site confuses you. It starts from nothing and ends with every label on screen.

## 1. The problem in one page

An **AI system** is a model plus the code around it: the instructions it is given, what it is shown,
how its answer is read, how it is trained. People improve such systems by *changing* that code, then
run it a few times and say "it feels better".

That is unreliable for three reasons:

1. **Noise.** Run the same AI twice and you get different results, so one good run can be luck.
2. **Trust.** The author measured their own change. Nobody else can check it.
3. **Memory.** Ideas that failed are forgotten, and the next person tries them again.

**Hellgate** is a referee for such changes. Its rule: *a change counts only when other people's keys
re-run it and measure a real gain.* Failed changes are not hidden: they stay on record, with the numbers.

An exam is the closest comparison. The author is the student, a change is a new study method, the
benchmark is the exam, the verifiers are examiners who re-mark the paper, and the result is trusted
only if the examiners agree. The student never marks their own paper.

## 2. What a "change" is

A **change** is an edit to the files being improved, plus a **claim**: a hypothesis, a predicted gain, and
what result would prove it wrong ("falsified if"). A claim with no number in it is refused.

A change gets a **parent**: the version it edits. Each change is measured **against its parent**, on the
same tests and the same random seeds, so the only difference is the change itself.

The first version in a tree is the **baseline** (the "genesis" change). It is deliberately simple, so
there is room to improve. Everything else is measured on top of it.

## 3. The two trees: `ml` and `code`

The site has a tree switcher. Each tree is a separate project that Hellgate is refereeing. They exist to
show that the referee does not care what is being improved.

### `ml`: improving a learning algorithm
- **What is being improved:** a tiny neural network, written from scratch in `learner/`, that learns
  from examples. It has no AI model behind it and makes no API calls.
- **The tasks (12):** small made-up datasets in four groups, three each:
  *nonlinear classification* (moons, circles, spirals), *imbalanced classes* (one class is rare),
  *noisy regression* (predict a number from noisy data), *badly scaled features* (inputs on very different scales).
- **How a task is scored:** the learner trains on a training set and predicts held-out test points whose
  answers it never sees (the "hidden" labels stay in the referee). Classification scores the fraction
  correct; regression scores the fraction of predictions within a tolerance. There are 2,400 test points in all.
- **What a change looks like:** standardise the inputs, use momentum or Adam instead of plain gradient
  descent, change the learning-rate schedule, rebalance classes.
- **Baseline score:** 63.1%.
- **Why it is here:** training is deterministic given a seed and free to run, so anyone can re-run it
  from scratch, and it has real run-to-run noise.

### `code`: improving an AI that writes code
- **What is being improved:** a small agent in `agent/` that asks a language model (Gemini) to write a
  JavaScript function from a written description.
- **The tasks (16):** each is a small function to write, such as `slugify`, `parse-duration`, `lru-cache`,
  `merge-intervals`, `semver-compare`, `deep-equal`. They are grouped into Collections, Formatting,
  Algorithms, Parsing and Strings.
- **How a task is scored:** hidden test cases the agent never sees (182 in all) run against the function the
  model wrote. The score is the share of cases passed. A test decides, never another AI.
- **What a change looks like:** show the model the exact function signatures, send the full task
  description, reword the instructions, add a second model that reviews the draft.
- **Baseline score:** 44.5%. Showing signatures lifts it to 57.3%, the full description to 94.3%.
- **Cost:** the author's run makes real model calls (about 80 per change, and it takes minutes). The
  verifiers do not: they **replay** the recorded answers through the real tests, which is free and exact.

### What the trees are not
They are not leaderboards of AI models. See §5.

## 4. How a change is judged

1. **Guards.** Before anything runs, automatic checks stop changes that are too big, that touch the frozen
   contract, or that import things such as the file system (an attempt to read the hidden answers). A
   stopped change is kept as **void** with the exact reason.
2. **Measure.** The author runs old and new versions on all tasks, **five times**, on the same seeds.
3. **Verify.** Two or more **other keys** (a key is a person's or a machine's signing identity) re-run
   the same comparison from scratch. The author's own numbers never count towards the verdict.
4. **Decide.** A fixed rule turns the evidence into a verdict. Nothing is stored as a verdict: it is
   recalculated from the signed records every time.
5. **Remember.** Nothing is deleted. A summary of what passed and what died (the **digest**) is what the
   next proposal reads first.

### How "better" is decided (the statistics, plainly)
- For each task we average its score over the five runs, for the old and the new version, and subtract.
  That is the task's **difference**.
- The overall **effect** is the average difference across tasks, in **points** (percentage points of score).
- To know whether the effect is real, we repeat the average 2,000 times on re-drawn sets of tasks (a
  *bootstrap*). The middle 95% of those results is the **95% interval**.
- It is a **gain** only if the whole interval is above zero **and** the effect is at least **3 points**.
  A loss is the mirror. Anything else is **noise**: it cannot be told apart from luck.

Example: momentum on the `ml` tree measured +6.7 points but its interval ran from below zero to above it,
because the gain was concentrated in a few tasks. Verdict: no effect. A bigger number is not evidence.

## 5. Benchmarking: against what? (the honest answer)

**Hellgate does not rank AI models or compare us to other products.** It answers a different question:
*"Did this particular change make this particular system better, and can someone else confirm it?"*

- **The benchmark is the suite**: the hidden tasks and tests (`suites/`). Every score on the site is the
  share of that suite passed, so scores are only comparable inside one tree.
- **The comparison is a version against its parent**, on the same tests and seeds, and finally against the
  baseline (the "vs base" figure: ▲ +49.8 means 49.8 points above where the tree started).
- **Against other models or tools:** not done. The suite and the protocol are model-independent, so the
  same suite could grade a different model, but that would be a new tree with its own baseline (a
  different `models.primary` in its configuration), not a cell in this one. We have not run that, and
  we do not claim anything about how Gemini compares with other models.
- **Limits of the benchmark:** 12 and 16 tasks are *evidence, not proof*. The tasks are public, so an
  agent could in principle overfit to them; a sealed held-out suite is designed to catch that and is not
  built. The numbers describe these tasks only.

Why this is still a benchmark worth having: the *method* is the contribution. The same engine refereed a
neural network and an LLM agent with no change to the verdict rule.

## 6. The website, page by page

**Home (`/`, "The Gate").** The tree switcher chooses `ml` or `code`. Summary numbers sit at the top.
The big diagram is the **tree of changes**: left to right, each node is a change, and it connects to its
parent. **Gold, filled** = accepted (through the gate). **Grey ring with ✕** = rejected. **Hollow** =
pending (waiting for verifiers). **Half-filled** = contested (the verifiers disagree or one cheated).
**Hatched** = void (stopped before it ran). The straight gold line is the **gate path**: accepted changes
chained from the baseline. Below it, the **score curve** shows the score along that path, and the **score
vs base** chart shows every change as ▲ above or ▼ below where the tree started. **Beat the gate** is the
button to try your own idea.

**A change's page (`/change/<id>`).** The "receipt". Top: the verdict and its code. Then the **verified
score** (what the verifiers measured) next to the **claim** (what the author said); a gap between them is
the lesson. The **noise band** chart shows the effect and its 95% interval against the ±3-point zone: a
bar that touches the shaded zone is not proof. **Per-run dots** show the five runs of parent and
candidate. The **use-case bars** show the score in each task group. The **task table** shows every task.
**Attestation cards** are the verifiers' signed measurements. The **diff** shows exactly what changed.
On a pending change, a button runs a verifier live.

**Graveyard (`/graveyard`).** Every rejected, void and contested change, each with how it died and the
numbers. This is the shared memory: do not repeat these.

**Beat the gate (`/beat-the-gate`).** Type one instruction (8 to 280 characters). It is added to the coding
agent's rules, recorded live against the real model, then replay-verified by two keys. You watch the stages
(build, record, verify, sign). It usually ends in a rejection, and that is the point. It needs a model
key and takes several minutes.

**Verifiers (`/verifiers`).** The keys that have signed measurements, how many, and whether anything
about them is flagged. A key is shown shortened (the first letters of its Stellar-format address).

**How it works (`/how-it-works`).** The steps, a glossary, and the honest limits.

## 7. Every label, defined

| Label | Meaning |
|---|---|
| Score | Share of hidden test cases passed (the average over tasks and runs). |
| vs base, ▲ / ▼ | Points above or below the tree's baseline. |
| Effect | The change's average improvement over its parent, in points. |
| 95% interval | The range the true effect plausibly lies in. If it crosses zero, it is noise. |
| Noise band | The ±3-point zone in which a result is too small to count. |
| Claimed / author | What the author measured. A claim, not evidence. |
| Verified | What at least two other keys measured. This is what counts. |
| Attestation | One verifier's signed measurement. |
| Verifier / key | A signing identity. Distinct keys are not necessarily distinct people. |
| Gate path | The chain of accepted changes from the baseline. |
| Digest | A fingerprint of every per-test result. Honest replays give identical fingerprints. |
| Recording / replay | The saved real model answers, and re-scoring them against the real tests. |
| Use case / group | A set of related tasks (for example Strings). |
| Area / motif | What kind of change it was (optimizer, prompt, context), and a short name for the idea. |
| Origin | `human`, `agent` (a model proposed it) or `challenge` (from Beat the gate). |
| Depth | How many steps from the baseline. |

### Verdicts
| Code | Status | Meaning |
|---|---|---|
| GAIN | accepted | Enough verifiers measured a real gain. |
| NO_EFFECT | rejected | The interval includes zero or the effect is under 3 points. |
| REGRESSION | rejected | A real loss. |
| NEEDS_VERIFIERS | pending | Fewer than two distinct verifier keys so far. |
| VERIFIERS_DISAGREE | pending | Their numbers are too far apart; another verifier is needed. |
| CONFLICT | contested | One verifier says gain, another says loss. |
| RESULTS_MISMATCH | contested | Replays must produce identical fingerprints and these do not: someone did not really run it. |
| UNREPRODUCIBLE | rejected | The verifiers agree with each other but not with the author. |
| SPOT_CHECK_FAILED / OVERFIT | contested / rejected | Designed checks (a live re-ask of the model, a sealed suite) that are not built yet, so they do not appear in the trees. |
| NOT_CLEAN | rejected | A run was tampered with. |
| `bad-import` and other guard names | void | Stopped before it ran. |

## 8. What is real and what is not
Real: the trees' scores (measured by the sandbox on the real tests), the recordings (real Gemini answers),
the signatures, the live verification and Beat the gate. Not built: live spot-checks that re-ask the model,
the sealed held-out suite, public timestamps on Stellar, and an AI that proposes changes on its own.

## 9. Try it yourself
`pnpm demo`, open <http://localhost:3000>, and follow [TESTING.md](TESTING.md). For the demo script see
[DEMO.md](DEMO.md); for the technical overview and limits see [JUDGES.md](JUDGES.md).
