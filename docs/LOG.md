# Team log

A shared log so we always know what the other person did and what's next.

**Rules**
- Append only. New entries go at the **bottom**. Never edit or delete an old entry; if
  something was wrong, add a new entry that corrects it.
- No dates or times. Entries are numbered: take the last number and add one.
- Keep each entry short. Link to files and to [STAGES.md](STAGES.md) instead of copying them.
- Write blockers plainly, including what you need and from whom.

**Template**

```
### #NNN · <who> · <area: engine | web | docs | demo>
**Stage:** <number and name>
**Did:** <what changed, with file paths>
**Found:** <anything surprising: bugs, limits, numbers measured>
**Next:** <the very next step>
**Blocked on:** <nothing | what and who>
```

---

### #001 · Kai · docs
**Stage:** 0, Foundation
**Did:** Wrote the design ([ARCHITECTURE.md](ARCHITECTURE.md)), the exact rules
([PROTOCOL.md](PROTOCOL.md)), the build plan ([STAGES.md](STAGES.md)), the web app brief
([FRONTEND.md](FRONTEND.md)) and this log. Set up the monorepo folders `engine/` and `web/`.
**Found:**
- The free Gemini key handles bursts on `gemini-3.1-flash-lite`: 12 parallel calls, 12
  successes, about 1.5 s each.
- `gemini-3.5-flash` returned a 429 on 2 of 12 parallel calls, so it is only used for the
  proposer, at low volume.
- Node 26's permission model denies network access by default, which the sandbox relies on.
**Next:** Stage 1, core primitives.
**Blocked on:** nothing.

### #002 · Kai · web
**Stage:** 12, web app (can start now, in parallel)
**Did:** Added the mock data `web/mock/export.sample.json` so the frontend can be built
before the engine exists.
**Next:** Frontend: follow [FRONTEND.md](FRONTEND.md) and log progress here.
**Blocked on:** nothing.

### #003 · Kai · docs
**Stage:** 0, Foundation (plan for working in parallel)
**Did:**
- Added ownership, contracts, git rules, the tier and cut line, and effort targets to
  [STAGES.md](STAGES.md). Added [../PROGRESS.md](../PROGRESS.md), a status board, so either of
  us can see the current state at a glance.
- Reviewed the engine scaffold that landed on `main`: its tests pass, but its typecheck
  fails, and several parts differ from [PROTOCOL.md](PROTOCOL.md). Details are in the next
  entry once the merge is done.
**Found:**
- The scaffold was written against an earlier version of the docs, so it predates STAGES.md,
  FRONTEND.md and this log.
- The scaffold's audit list is accurate about what is missing; it is a good gap list.
**Next:**
- Merge the scaffold into the current tree, keeping its history, then finish Stage 1.
- Frontend: pull the latest `main`, read FRONTEND.md and STAGES.md, then start the web app
  on the mock data.
**Blocked on:** the docs reaching `main`, so the frontend can read them.

### #004 · Kai · docs
**Stage:** 0, Foundation (final plan)
**Did:** Settled the split of work and recorded it in [../PROGRESS.md](../PROGRESS.md) under
Decisions: engine with Kai and Claude, the whole web app with the frontend teammate, benchmark
tasks drafted by Kai and checked by a validator, and the demo running on Kai's laptop.
**Found:**
- The two root documents on `main` restate the architecture and protocol, so they will be
  removed to keep a single source of truth. One passage in them describes a "majority" gain
  rule; the protocol rule is that **every** counted verifier must report a gain.
- The engine scaffold used a different toolchain from the one the protocol was written for.
**Next:** Merge the scaffold into the current tree, keeping its history, then Stage 1.
**Blocked on:** nothing.

### #005 · Kai · docs
**Stage:** 0, Foundation (pipeline doc)
**Did:** Wrote [PIPELINE.md](PIPELINE.md): the whole journey of a change in eight steps (P0
setup to P7 learn), the records and how they link, the sandbox, the measurement, a failure
table, who can do what, timing, a worked example and a map from each step to its module and
command. Linked it from the README and ARCHITECTURE.md.
**Found:** The teammate's two root documents restated the same pipeline against the earlier
version of the docs. Their list of what was still missing was accurate and matches STAGES.md.
They are replaced by PIPELINE.md and removed from the root so there is one source of truth.
**Next:**
- Teammate: pull `main`, read PIPELINE.md, then FRONTEND.md, and start the web app on the mock data.
- Kai: Stage 1.
**Blocked on:** nothing.

### #006 · Kai · docs, web contract
**Stage:** 0, Foundation (design change, additive)
**Did:**
- **Two domains.** The pipeline now supports a second kind of thing to improve besides the LLM
  agent: **learning algorithms** (optimizer, model, preprocessing, schedule), called the `ml`
  domain. Tasks are grouped by **use case**, and scores are reported per use case. See
  ARCHITECTURE §5.3, PROTOCOL §12–13 and STAGES ("Recommended order of work", Stage 7M).
- **Two models for the agent.** The agent asks for a model *slot* (`primary` = Gemini,
  `secondary` = Groq). The orchestration (for example "the secondary model reviews the draft")
  is part of the change and is measured like any other. ARCHITECTURE §6.6.
- **Score against the base.** Every change carries `scoreBp` and `vsBaseBp`, so the web app can
  show the agent's score going up or down from where it started. `hellgate bench` prints the
  same locally. PROTOCOL §11.1.
- **Several trees.** One hub can serve several trees. New routes `/v1/trees…`
  (PROTOCOL §10.0).
**Web contract changes (all additive; nothing was removed or renamed):**
- New top-level export fields: `domain`, `base`, `suite.groups`, `models` (can be `null`).
- New per-change fields: `scoreBp`, `vsBaseBp`, `slots`, `perGroup`; `perTask[].group`.
- `curve` points gain `vsBaseBp`.
- Mock data regenerated: `export.sample.json` (coding agent), a new `export.ml.sample.json`
  (optimizer) and `trees.sample.json`. The old mock numbers changed, the shapes did not.
- FRONTEND.md has the tree switcher, the score-vs-base chart and the use-case breakdown.
**Found:** Building the pipeline end to end on the `ml` domain first is cheaper and safer: it
needs no model API and has real run-to-run noise from seeds. The LLM domain then plugs in.
**Next:** Stage 1 (core primitives).
**Blocked on:** a Groq API key, needed only when Stage 5 starts.

### #007 · Kai · engine
**Stage:** 1, Core primitives (done)
**Did:**
- Replaced the earlier engine scaffold with the protocol-conformant core, in
  `engine/src/core/` and `engine/src/identity/`:
  - canonical JSON: code-point key order, safe integers only, and an error for `-0`, dates,
    maps, holes, cycles and anything else with no stable encoding;
  - `sha256` and `idOf`;
  - one error type with exit codes;
  - keys in Stellar format (`G…` address, `S…` secret), a key file outside the repo with mode
    0600 that is never overwritten, `HELLGATE_SECRET` for CI, and domain-separated signatures.
- One pnpm workspace at the repository root (`engine`, `web`) and one lockfile. Tests use
  Node's own runner; the engine runs TypeScript directly on Node 22.18 or newer.
- Removed the earlier placeholder `agent/` and `suites/public/` folders. The real layout is
  `agent/`, `learner/` and `suites/<domain>/public/` (ARCHITECTURE §5.1). The earlier scaffold
  and its authors stay in the git history.
**Found:**
- Stellar address and secret encoding was cross-checked against the official Stellar SDK on 25
  random keys, and the SDK verifies a signature made by Hellgate. One key can sign both.
- Three problems in the earlier scaffold are now covered by tests here: integer-like keys
  sorted wrongly, dates silently encoded as `{}`, and a signature that was not bound to the
  record type.
**Next:** Stage 2: record schemas and the ledger store.
**Blocked on:** nothing.
**Note for the web side:** pull `main`, then run `pnpm install` from the repository root. The
workspace now includes `web/`, so your `web/package.json` will be picked up.

### #008 · Kai · engine
**Stage:** 2, Records and the ledger store (done)
**Did:** In `engine/src/ledger/`:
- `records.ts`: strict schemas for `build`, `recording`, `change`, `attestation` and `receipt`
  (PROTOCOL §5), with the invariants the protocol states: a genesis change starts from the empty
  build, a change that never ran carries no recording and no claimed result, a challenge change
  carries exactly its instruction, an attestation's run arrays and task sets are consistent.
  `parseRecord` checks shape, then schema, then signature, and never throws.
- `store.ts`: the ledger as a set of files. Atomic, canonical writes; reads check schema, then
  that the file name is the body's hash, then the signature; bad files are reported by stage and
  ignored; `merge` is a union (idempotent, order-independent); `referenceProblems` checks that a
  record's references are held and agree with it.
- `config.ts`: `.hellgate/config.json` with defaults, both domains, odd run counts only.
- `testkit.ts`: builders for valid records of every type, used by tests.
- PROTOCOL §4–5 and ARCHITECTURE §6.3 were tightened to match what the code enforces.
**Found:**
- A value that canonical JSON cannot encode (a float, for example) cannot even be signed, so such a
  record is refused before the schema runs.
- The empty build is treated as present in every ledger without being stored, so the hub never
  needs to sync it.
**Tests:** 44 pass (core 7, identity 9, records 11, store 8, config 5, plus shared checks).
Typecheck is silent.
**Next:** Stage 3: the suite format for both domains, with a first few tasks.
**Blocked on:** nothing.

### #009 · Kai · docs, handoff to the web side
**Stage:** 12, web app (ready to start)
**Did:** Finished the frontend brief and the prompt in [FRONTEND.md](FRONTEND.md) section 11. It now
covers setting the app up in a non-empty `web/`, the tree switcher and `/api/trees`, both mock
trees, the score-vs-base chart, the use-case breakdown, null handling, and the wording rules.
**Where to start, in order:**
1. `git pull`, then run `pnpm install` from the repository root.
2. Read [PIPELINE.md](PIPELINE.md) for what Hellgate does, then [FRONTEND.md](FRONTEND.md), then
   "Who owns what" in [STAGES.md](STAGES.md).
3. Paste the prompt from FRONTEND.md section 11 into your coding assistant.
4. Build against `web/mock/` only. The real hub arrives at checkpoint C4 ([../PROGRESS.md](../PROGRESS.md));
   switching to it changes only `web/.env.local`.
**Rules that matter most:** only edit `web/`; never compute a verdict in the UI; say "distinct
keys", never "independent people"; log each session here and keep your row in PROGRESS.md current.
**If the data is missing something you need:** write it here. Do not invent fields. Kai changes
the engine, PROTOCOL.md and the mock files together.
**Next:** Frontend: app shell, tree switcher and the home page on mock data (checkpoint C1).
**Blocked on:** nothing.

### #010 · Kai · engine, benchmark
**Stage:** 3, Suite format and pilot tasks (done; Kai still has to review the task files)
**Did:**
- `engine/src/core/rng.ts` and `engine/src/suite/`: the seeded random stream, seeds and task order
  (checked against a second, independent implementation), task schemas, the suite loader and suite
  id, the brief builder, the ML data wrapper with strict output checks, and an in-process task checker.
- Pilot tasks: coding `slugify` (strings), `parse-duration` (parsing), `token-bucket` (algorithms)
  in `suites/code/public/`, each with a reference solution in `suites/code/reference/`; ML `moons`,
  `scaled-blobs` and `noisy-sine` in `suites/ml/public/`.
- PROTOCOL §5.2, §13.1 and §13.2 updated: line-ending normalisation, dotfiles, the `group` field,
  the exact random streams, and the rules for writing cases.
**Found:**
- **A test-quality trap.** A case such as `assert.throws(() => f(42), TypeError)` passes for an empty
  solution, because calling a missing function also throws a `TypeError`. Every error case now first
  checks that the function exists. This is now a written rule for task authors.
- Every reference solution passes all its cases; careless versions (no accent handling, `ms` read as
  minutes, a clock that runs backwards) fail some, so the tasks discriminate.
- ML data is learnable (nearest neighbours scores over 85% on both classification tasks and over
  75% on the regression task) while constant predictors score about 50% and about 0%.
**Tests:** 69 pass. Typecheck is silent.
**Next:** Stage 4, the sandbox. The `ml` runner first (one jailed process, the parent scores).
**Blocked on:** Kai's review of the pilot task files.

### #011 · Kai · engine, sandbox
**Stage:** 4, Sandbox (done; all five canaries pass)
**Did:**
- `engine/src/sandbox/`: the jail runner (Node permission model, a read grant on one directory, a
  scrubbed environment, the program sent over stdin, a report channel on file descriptor 3, IPC for
  the agent), the code test runner, the agent jail, the `ml` learner runner, and lanes.
- `engine/src/model/types.ts`: the request and reply of PROTOCOL §12.1 with the schema that checks an
  untrusted request, and the error a model service throws to refuse one call.
- Both child programs capture the platform primitives before untrusted code loads, replace
  `Math.random` with the seeded stream, and freeze `Date`.
**Found:**
- **The parent's environment leaks into a child by default.** `process.env` inside a jail would have
  held the API keys. The jail now starts with four harmless variables, and a canary checks it.
- A solution could overwrite `assert.equal` on the shared module and turn failing cases into passing
  ones. The cases now get a frozen copy of `assert`, and the error constructors cannot be reassigned.
- A task that tampers while loading still has to report how many cases it failed. The first version
  returned an empty list; the forged-result canary caught it.
- A case that hangs in a loop used to be able to cost the whole task. It now fails alone: the cases
  after it run again in a fresh process (up to three restarts).
- Every defence was switched off in turn (the permission flag, the environment scrub, the `assert`
  copy, the exit-code cross-check, the nonce check). The matching tests went red each time.
**Decisions:**
- `ml` budgets are measured from the start of the learner program and a late finish scores 0; the
  process is killed 1.5 s after the budget.
- An infrastructure failure (a model service that fails with anything other than a refusal) throws and
  is never scored. An agent that crashes, runs too long or answers badly scores 0 through the real tests.
- ARCHITECTURE §6.5 now says plainly what the walls do and do not do.
**Tests:** 100 pass, 31 of them in the sandbox. Typecheck is silent.
**Next:** Stage 6, measurement: the runner over R runs with seeded order, per-case scoring, the paired
effect, the bootstrap interval, the results digest and the score against the base build.
**Blocked on:** Kai's review of the pilot task files (not blocking the engine).

### #012 · Kai · engine, measurement and verdict
**Stage:** 6, Measurement, and 8, The verdict (both done)
**Did:**
- `engine/src/measure/`: exact integer arithmetic (floor division, half-up mean), the task-resampling
  bootstrap and the call, the batch runner (seeded order, lanes, infrastructure retries, events for
  the live progress panel), the comparison with the results digest, and the score against the base.
- `engine/src/verdict/decide.ts`: the pure verdict, one code path for the CLI, the hub, the export
  and CI.
- PROTOCOL §9 now says which digests are compared: replay attestations, and every attestation in
  an `ml` tree (an ml verifier really re-runs the training, so its digest must match).
**Found:**
- **Independent check.** Scores, task means, differences, effect, interval (at 2,000 and at 200
  resamples) and the results digest were computed by a second implementation written in Python from
  the spec alone, in both directions (so negative differences and half-up rounding on negatives are
  covered). The TypeScript matches on every number.
- The spec said replay digests are compared, but an `ml` tree has no replays, so as written no `ml`
  digest would ever have been checked. The verdict now takes the tree's domain.
- A gain needs every counted verifier to report a gain. A test with a third verifier at +0.5 points
  showed the spread rule fires first (as designed), so the "not a majority" test uses a close one.
**Tests:** 141 pass at the time. Typecheck is silent.
**Next:** Stage 7M: the genesis learner (a small neural network with plain SGD), the full ml suite, and
the first real baseline score. Then the CLI.
**Blocked on:** nothing.

### #013 · Kai · ml domain
**Stage:** 7M, The `ml` domain (done; Kai still has to review the nine new `data.mjs` files)
**Did:**
- `learner/`: the genesis learner. A one-hidden-layer network trained by plain SGD with no
  preprocessing and a constant step size, split into `model`, `optim`, `prep` and `schedule` so that
  one idea is one small diff. The frozen contract is `learner/contract.ts`.
- `suites/ml/public/`: 12 tasks in four use cases of three: nonlinear classification, badly scaled
  features, noisy regression and imbalanced classes (imbalanced in training, balanced in testing).
- `scenarios/ml/`: six ready-made changes: standardise, momentum, Adam, lr-decay, lr-nudge, balance.
- The learner budget is now **CPU time**, not wall-clock time (PROTOCOL §13.2, ARCHITECTURE §6.5).
**Found:**
- Measured on 5 runs: genesis 63%; standardise +21 points; momentum +16; Adam +13; balance +5 (all of
  it in the imbalanced use case, and nothing anywhere else); lr-nudge about +1, below the minimum
  effect; lr-decay −5, a real regression.
- **My own design note was wrong.** I had written that Adam helps most on badly scaled features. The
  measurement says it helps most where plain SGD underfits (noisy regression, rare classes) and only a
  little on badly scaled features, which standardising fixes. The docs now say what was measured.
- **Wall-clock budgets break under load.** A test that ran six batches at once pushed learners over a
  4 s wall-clock budget and scored them 0. A score must not depend on how busy the machine is, so the
  budget is CPU time; the wall clock only stops a runaway. A learner that merely waits is not penalised.
- The baseline started at 65% with one task near 98%. Per the gate rule, the tasks were tuned
  (noisier moons and circles, a tighter tolerance on the wave and the sine), not the learner.
**Tests:** 148 pass (one slow test is skipped by default), and `HELLGATE_SLOW=1` re-measures all six scenarios against the table (82 s).
**Next:** Stage 9, the CLI: `init`, `keygen`, `bench`, `propose`, `record`, `verify`, `check`, `status`.
**Blocked on:** nothing.

### #014 · Kai · CLI and the offline loop
**Stage:** 9, CLI and the offline loop (done for the `ml` domain; the `code` domain waits for Stage 5)
**Did:**
- `engine/src/propose/guards.ts`: build guards (paths, at most 2 files and 120 changed lines, frozen
  contract and exact entry signature, relative sibling imports only), the falsifiability and graveyard
  rules, and a TypeScript check on a scratch copy.
- `engine/src/app/`: the tree (verdicts and the gate path derived from the ledger), `init`, `propose`,
  `submit`, `verify`, a cached author-side measurement, and the text reports.
- `engine/src/export/`: the `hellgate/export/1` document and a unified diff.
- `engine/src/cli/main.ts`: `init id propose submit bench verify status check tree graveyard show digest export`.
**Found:**
- **The gate passes through the real CLI.** Three keys: init, verify twice, genesis accepted; a
  standardise change submitted, verified twice, accepted; a reworded no-op rejected as NO_EFFECT; a
  lazy verifier with a different digest contests a change (RESULTS_MISMATCH); `check` exits 0, 1, 2.
- **The export has exactly the fields of the mock** the web app is built against; a test compares
  the key sets of every level, so the two cannot drift apart unnoticed.
- A bug the first run hid: the CLI read the repository location from the real environment instead of
  its injected one, so the "small repository" tests silently used the full 12-task suite and took 150 s.
  They now take 25 s.
- Guards store a bad proposal as a `void` change with the verbatim reason: forbidden import,
  type error with the compiler's own line, a changed contract, too many files, an unfalsifiable claim.
**Tests:** 152 pass. Typecheck is silent.
**Next:** Stage 10, the hub: `serve`, `push`/`pull`, jobs with live events. That is the real data for the web app.
**Blocked on:** nothing.

### #015 · Kai · hub
**Stage:** 10, Hub (done; `verify` jobs work, `challenge` jobs wait for the `code` domain)
**Did:**
- `engine/src/hub/`: the HTTP server (records, version, export cached until the ledger changes, several
  trees), intake that checks every posted record, `push`/`pull`, and the job runner with a replayable
  event stream. CLI: `hellgate serve`, `push`, `pull`.
**Found:**
- **The Stage 10 gate passes:** two separate homes exchange records over HTTP; a `verify` job as a demo
  bot streams `log, stage, progress×12, stage, attestation, change, done` and, with a second key, the
  change becomes `accepted`. Events were read while the job was still running (not buffered to the end),
  a second job gets `409`, a late client is replayed the same stream.
- A tampered record, one with a missing reference, one for another tree, and invalid JSON are refused
  with the reasons; jobs are refused without the token, and a hub with no token configured has jobs off.
**Tests:** 154 pass.
**For Pritam:** the real data contract is live. Run `pnpm hub` (see FRONTEND.md section 2) and point
`web/.env.local` at it; the first populated tree arrives with Stage 11.
**Next:** Stage 11: build the real `ml` tree with the six scenario changes, verified by distinct keys.
**Blocked on:** nothing.

### #016 · Kai · the real ml tree, and the UI prompt
**Stage:** 11 for the `ml` domain (done); the `code` tree waits for Stages 5 and 7
**Did:**
- `scripts/build-ml-tree.ts` builds the demo tree through the real CLI with distinct demo keys, and
  `trees/ml/` holds the result: 10 changes, 3 accepted, 5 rejected, 1 contested, 1 void.
- [UI-PROMPT.md](UI-PROMPT.md): a paste-ready design and build brief for the web app (screens, the tree
  diagram, our own visual identity, the real data, wording rules). FRONTEND.md points to it.
**Found:** every verdict is a real measurement, and some were not what I had expected:
- Score: baseline 63.1%, standardise 84.3% (+21.1), Adam 91.9% (+28.7 against base).
- **Momentum measured +6.7 points but was rejected as NO_EFFECT**: its interval crosses zero, because
  the gain is concentrated in a few tasks. That is the machinery doing its job, and the best single
  thing to show a judge about why a bigger number is not enough.
- Rebalancing rare classes (+5 on the bare baseline) added only +0.9 on top of Adam: the optimizer had
  already fixed most of it. Cosine decay and the learning-rate nudge were NO_EFFECT. Dropping
  standardisation was a REGRESSION (−16 points from its parent). The cheat was stopped by the import
  guard before it ran. A lazy verifier's copied numbers contested a change (RESULTS_MISMATCH).
**Next:** Stage 5, the Gemini and Groq gateway, then the `code` domain.
**Blocked on:** nothing.

### #010w · Frontend teammate · complete web app implementation & verification
**Stage:** 12, web app (complete)
**Did:**
- Built full Next.js (App Router) + TypeScript + Tailwind CSS application in `web/` conforming to `docs/FRONTEND.md`.
- Implemented all server API routes: `/api/trees`, `/api/export`, `/api/version`, `/api/jobs`, `/api/jobs/current`, and `/api/jobs/[id]/events` (SSE streaming with mock delay replay).
- Created all 6 pages:
  - `/` (The Gate): Tree switcher with `?tree=` param sync, hero statistics, interactive SVG change tree, score curve chart across generations, score vs base scatter plot with ▲/▼ coloring and gate-path filter, pending changes list, and Beat the Gate CTA.
  - `/change/[id]`: Receipt view with status badge, verified score, large score vs base delta, model slot badges, claimed vs verified side-by-side gap, Noise Band chart with ±3.0 pt shaded noise zone and 95% CI bars, per-run dots (5 parent vs 5 candidate with median line), use-case breakdown bars, sortable per-task table, attestation cards, unified diff block, and live verifier trigger.
  - `/graveyard`: Epitaph cards for all rejected and void changes, filterable by area and cause of death with claimed vs measured comparisons.
  - `/beat-the-gate`: 280-character instruction input with character counter, example prompt chips, SSE-driven live progress stepper, task grid, log tail, and verdict receipt link.
  - `/verifiers`: Signing keys table with addresses, attestation counts, counted runs, flags, and Stellar account links.
  - `/how-it-works`: 4 illustrated steps, honest limits, and proposal digest monospace block.
- Implemented all SVG charts by hand without heavy dependencies (`ChangeTree`, `ScoreCurve`, `ScoreVsBase`, `NoiseBand`, `PerRunDots`, `UseCaseBreakdown`).
- Tested with both `coding-agent` and `optimizer` (ML) mock datasets, handling null models and distinct wording ("recorded real answers replayed through the real tests" vs "re-ran the training").
- Verified production build (`npm run build`) passing with 0 errors and tested end-to-end via headless browser.
**Found:**
- Next.js Turbopack strict type checking required explicit index signature on `Models` interface.
- Route handlers with `204 No Content` require standard web `Response` with `force-dynamic` export.
**Tests:** Production build succeeds (`next build`), all pages and charts render cleanly with 0 console errors.
**Next:** Checkpoint C4: integration with live hub when engine arrives.
**Blocked on:** nothing.


### #017 · Kai · the model gateway, the coding domain and Beat the gate
**Stage:** 5 (done), 7 (agent and suite done), 14 (engine side done)
**Did:**
- `engine/src/model/`: the Gemini and Groq clients, slots resolved through the tree config, budgets per
  task, retries with backoff, `record` / `replay` / `live`, a requests-per-minute limiter and (new) a
  tokens-per-minute limiter, because Groq's free tier allows only a few thousand tokens a minute and a
  burst of review calls was refused with 429 until the limiter paced them.
- `agent/` (the genesis coding agent) and 16 coding tasks in five use cases. The baseline was tuned by
  measurement: sending the whole brief scored 91% (nothing left to improve), sending only the title
  scored 0% (the model forgot `export`), and the final design scores about 43%.
- The real coding tree (`trees/code/`), built through the real CLI with distinct demo keys. The author
  records each candidate against the live models; verifiers replay the recording with no key and no network.
- `hub/challenge.ts`: Beat the gate. A typed instruction (8 to 280 characters) is appended to the agent's
  rules as one quoted string, goes through the usual guards, is recorded live by a house author key and
  replay-verified by two bot keys. A repeated instruction is answered from the ledger.
- `pnpm hub` now serves both trees; `pnpm hub:demo` starts the hub with the demo keys (see FRONTEND.md).
- The export now counts the hidden cases of a coding suite.
**Found:**
- **The coding gate works with real models:** the genesis change was accepted (+44.5 points over the empty
  build), then `show-signatures` (+12.8) and `full-brief` (+37.0, score 94.3%), each accepted by two
  distinct replaying verifiers whose results digests are identical.
- A coding tree with a 94% tip leaves little headroom, so most Beat the gate challenges will be rejected as
  NO_EFFECT. That is the honest outcome and the point of the page.
**Tests:** gateway (fake HTTP servers), code-domain loop through the CLI (record once, verify with no key),
challenge flow through the hub (stream, `409`, repeats), token limiter.
**For Pritam:** I changed a few files in `web/` so it talks to the real hub: `web/lib/hub.ts` maps the
mock tree names to the hub's (`coding-agent` is `code`, `optimizer` is `ml`), the job proxy translates the
page's request into the hub's, and the stepper uses the hub's stage names (`build, record, verify, sign`).
Please pull before you push, and run with `HELLGATE_HUB=http://127.0.0.1:8787`.
**Next:** commit the finished coding tree, a live spot-check (Stage 13), the evolve loop (Stage 15).
**Blocked on:** nothing.

### #018 · Kai · merged the web app; demo runbook and judge page
**Stage:** 11 (both trees committed), 12 (merged, wired to the hub), 17 (runbook started)
**Did:**
- Merged the web branch and made it talk to the real hub (see #017). `next build` passes and the API
  proxies were checked against `pnpm hub:demo` for both trees.
- `trees/code` is committed with 5 changes. `summary-only` and a second-model `review` are in
  `scripts/build-code-tree.ts` but were not recorded: the free Gemini quota for the day ran out
  (500 requests per model per day). The script resumes where the tree stops.
- `trees/ml` has a pending change (`optimizer/weight-decay`, one verifier so far) for the live-verify scene.
- [DEMO.md](DEMO.md) (setup, a timed script, fallbacks), [JUDGES.md](JUDGES.md) (the technical overview and
  the limits), `pnpm demo`, `pnpm preflight [--probe]`, `.env.example`.
**Found:** Beat the gate records about 80 live calls, so a free Gemini key supports about six challenges a day.
**Tests:** 167 pass, 1 optional slow test skipped. Typecheck is silent.
**For Pritam, what is left:**
1. Run `pnpm demo` and click every page on **both** trees against real data (mock data hid some cases:
   `null` models for `ml`, `vsBaseBp: null`, a void change with no scores, a contested change).
2. Beat the gate end to end once the model key has quota; check the three failure states (`400` text,
   `409` busy, `501`/error) read well.
3. Empty and error states, phone layout, keyboard focus, `pnpm -C web lint`.
4. Remove or fold the root-level `JUDGE_*.md`, `FULL_DETAILS.md`, `RECOMMENDED_CHANGES.md` and
   `REPLICATION_SUGGESTION.md` files into `docs/` if they are still wanted (they duplicate the docs and may
   drift from what is built), then the README screenshots and the demo video.
**Next:** a pass on whatever the browser run turns up; live spot-checks only if time is left.
**Blocked on:** a Gemini key with quota, for the live Beat the gate demo.

### #019 · Kai · the plain-language guide
**Did:** [GUIDE.md](GUIDE.md): the problem, what `ml` and `code` are, how a change is judged, what "benchmark"
means here (no model leaderboard; each score is the share of one tree's hidden tests, compared with the parent
and the baseline), the site page by page, and every label and verdict code.
**For Pritam:** the home page assumes the reader already knows all of this. Add a short plain explanation near
the top of `/` (what Hellgate is, in two sentences), a legend for the node shapes, and a one-line description
under each tree name in the switcher ("ml: improving a learning algorithm", "code: improving an AI that writes
code"), taken from GUIDE §3 and §6.

### #020 · Kai · Pritam's verification run, merged
**Did:** Pritam acted as a real second verifier on his own machine and pushed three attestations: two on the
coding tree's `reword-rules` (replay, both agree it is noise) and one on the `ml` tree's `weight-decay`, which
was therefore decided: rejected, NO_EFFECT. The records are merged. The ledger is a set, so the merge was a union and
every verdict was recomputed from the signed files. `weight-decay` was the pending change for the live-verify scene, so
I added a new one, `optimizer/gradient-clipping`, with one verification.
**Not merged:** the `evalgate/` folder from his branch. It is a separate tool run against a mock provider, with a Windows
path and generated files, its gate results are all zeros ("undersized denominator"), and it does not use the Hellgate engine.
It stays in his branch history. If he wants it in the repo, it needs a README that says what it is and a real suite behind it.
