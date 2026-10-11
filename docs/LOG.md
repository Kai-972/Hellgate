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
