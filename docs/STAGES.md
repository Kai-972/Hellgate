# Build stages

This is the build plan. Each stage is small enough to finish, test and commit on its own.
The design behind each stage is in [ARCHITECTURE.md](ARCHITECTURE.md), and the exact
rules are in [PROTOCOL.md](PROTOCOL.md).

## How we work

For every stage, in this order:

1. **Build** only what the stage lists.
2. **Test.** `pnpm -C engine typecheck` must be silent and `pnpm -C engine test` must pass.
   Stages marked 🔴 have a **gate**: a specific check that must pass before moving on,
   because later stages depend on it.
3. **Update the docs** if anything differs from the design. The docs describe the system
   as it is, never as we wished it was.
4. **Write a [LOG.md](LOG.md) entry:** what was done, what was found, what's next.
5. **Commit** only when steps 2–4 are done. One stage is one or more small commits.
6. **Tick the stage below.**

If a gate fails, stop and write the failure in the log. Don't paper over it.

Status keys: `[ ]` not started · `[~]` in progress · `[x]` done.

Owners: **K** = Kai (engine, with Claude) · **F** = frontend (web app) · **K+F** = both.

---

## Who owns what

Two people work in parallel. Each path has exactly one owner, so edits never collide.

| Path | Owner | Notes |
|---|---|---|
| `engine/`, `agent/`, `suites/` | Kai (with Claude) | Includes the benchmark tasks. A task file is reviewed by Kai before it counts. |
| `web/` | Frontend teammate | Reads data through the hub only. |
| `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/STAGES.md` | Kai | Teammate proposes changes in LOG.md; Kai applies them. |
| `docs/FRONTEND.md` | Frontend teammate | Keep it matching what is built. |
| `docs/LOG.md`, `PROGRESS.md` | Both | Append to the log. In PROGRESS.md edit only your own row. |
| `README.md` | Frontend teammate, near the end | Must describe only what exists. |

**Contracts between the two sides.** These are frozen. Change one only through a LOG.md
entry, then Kai updates PROTOCOL.md and the mock files together.
1. The export document: PROTOCOL §11, with `web/mock/export.sample.json`.
2. The job event stream: PROTOCOL §10.1, with `web/mock/job-events.sample.json`.
3. The hub's environment variables and routes: ARCHITECTURE §6.10 and FRONTEND §3.

Until the hub is up (Stage 10), the web app runs on the mock files. Switching to the hub
changes only `.env.local`.

**Git rules**
- Small commits, on `main`. Run `git pull --rebase` before every push.
- Touch only your own paths. If you need a change elsewhere, write it in LOG.md.
- Build and tests must pass before you push: `pnpm -C engine typecheck && pnpm -C engine test`
  for the engine, `pnpm -C web build` for the web app.
- Never commit keys, `.env` files or anything from a private folder.
- Push only when the team lead says pushing is allowed.

## Priorities and the cut line

Time is limited, so the work is in tiers. A tier is only started when the one above it works.

| Tier | Stages | What the demo has when it is done |
|---|---|---|
| **1: must ship** | 1–11, 12, 17 | A real tree measured with Gemini, the web app on live hub data, live verification in replay, the graveyard, and the cheating-agent block |
| **2: the differentiators** | 14, then 13 | Beat the gate, and live spot-checks. The lazy-verifier scenario is part of Stage 11. |
| **3: only with time left** | 16, 15, CI action, MCP tool, paid verifiers, sealed suite | Stellar receipts, the proposer model, and so on |

Order of work after Stage 11: 14, 13, 16, 15.

In Tier 1, the CLI needs only `init`, `submit`, `bench`, `verify`, `status`, `check`, `export`
and `serve`. The guards need only path, size, frozen-file and import checks. Everything else
in ARCHITECTURE §6.9 and §11 can wait.

Anything in the docs that is not built when we stop is removed or marked "not built" in
Stage 17. The docs describe what exists.

## Target effort per stage

Targets, not promises. If a stage runs over by half again, stop and re-plan in LOG.md.

| Stage | Target | Stage | Target |
|---|---|---|---|
| 1 Core primitives | 0.2 h | 8 Verdict | 0.3 h |
| 2 Records and store | 0.3 h | 9 CLI offline loop | 0.6 h |
| 3 Suite format | 0.3 h | 10 Hub | 0.5 h |
| 4 Sandbox | 0.7 h | 11 Real tree and scenarios | 0.5 h |
| 5 Model gateway | 0.5 h | 12 Web app | 3 h (parallel) |
| 6 Measurement | 0.3 h | 14 Beat the gate | 0.5 h |
| 7 Genesis agent and suite | 0.5 h | 17 Hardening | 0.5 h |

The riskiest stages are 4 (sandbox), 5 (Gemini) and 7 (the baseline must land in the target
score band). Their gates exist so a failure shows up early.

---

## Recommended order of work

The pipeline is domain-independent, so we build it end to end on the **`ml` domain first**:
it needs no model API, runs fast and gives real run-to-run noise. Then the LLM domain plugs in.

1. Stages 1–3 (core, records, suite format for both kinds)
2. Stage 4 (sandbox) for both domains: done
3. Stage 6 (measurement), 8 (verdict), 9 (CLI), 10 (hub). **The pipeline now works end to end**
   on real measurements, and the web app can switch from the mock to the hub.
4. Stage 7M (the `ml` genesis learner and suite), then Stage 11 on the `ml` tree
5. Stage 5 (Gemini and Groq), 7 (the `code` genesis agent), then Stage 11 on the `code` tree
6. Stages 14, 13, 16, 15

---

## Stage 0: Foundation · K · `[x]`
- [x] Repository, `.gitignore` (keys and `.env` can never be committed)
- [x] Design docs: architecture, protocol
- [x] Stage plan, shared log, frontend brief
- [x] Monorepo folders: `engine/`, `web/`

## Stage 1: Core primitives · K · `[x]`
Canonical JSON, ids, errors, identity and signing.
- [x] `engine/src/core/`: canonical JSON, `sha256`, `idOf`, error kinds and exit codes
- [x] `engine/src/identity/`: Stellar-format address and secret encoding, key file
  (create, load, permission check), `HELLGATE_SECRET`, domain-separated signing and checking
- [x] Workspace root: `package.json`, `pnpm-workspace.yaml`, one lockfile

**Tests:**
- frozen hash vectors;
- key order, code-point order, refused values;
- address and secret encoding cross-checked against the official Stellar SDK;
- a signature breaks when the body, the type or the signer changes;
- the key file is 0600, never overwritten, and its mode is checked on load.

**Done when:** the typecheck is silent and all tests pass.

## Stage 2: Records and the ledger store · K · `[x]`
- [x] Zod schemas for `build`, `recording`, `change`, `attestation`, `receipt` (PROTOCOL §5)
- [x] Store: write a record by id, read with full checks (schema → id → signature),
  list, and report bad files without trusting them
- [x] Union-merge of two record directories
- [x] `.hellgate/config.json` load and save, with defaults (ARCHITECTURE §10)

**Tests:**
- round trips;
- a tampered body is caught by its id;
- a forged signature is caught;
- a wrong schema is caught;
- merging is idempotent and order-independent.

## Stage 3: Suite format and pilot tasks · K · `[x]`
- [x] Suite loader for both domains (PROTOCOL §13) and the suite id (PROTOCOL §5.2); a broken task
  folder is an error, never a smaller suite
- [x] Seeds, task order and the seeded random stream (PROTOCOL §6), checked against an independent
  implementation
- [x] `TaskBrief` for coding tasks, built without the hidden cases; the learner's view for ML
  tasks, built without the hidden labels
- [x] **3 pilot coding tasks** in `suites/code/public/` and **3 pilot ML tasks** in
  `suites/ml/public/`, with a reference solution for each coding task in `suites/code/reference/`
- [ ] The rest of the tasks: 13 more coding tasks (Stage 7). The nine remaining ML tasks were written in Stage 7M.

**Tests:**
- the suite id changes when any file changes, including the hidden tests, and ignores line endings;
- the brief contains nothing from the hidden cases;
- every reference solution passes every case, an empty solution passes none, and plausible but
  careless solutions fail some;
- ML data is deterministic per seed, well-formed, and learnable by a standard method.

**Review:** Kai reviews every `cases.mjs` and `data.mjs`.

## Stage 4: Sandbox · K · `[x]` 🔴
- [x] Agent jail: Node permission model, a read grant on the jail only, IPC for the model,
  `send` captured and removed before the agent loads, seeded `random`, frozen `Date`, and a
  scrubbed environment
- [x] Test runner: the cases travel over stdin, per-case results with a nonce on fd 3,
  primitives captured first, per-case timeout, the exit code cross-checked, and a restart
  after a hung case
- [x] The `ml` runner: one jailed process; the parent scores against labels it holds
- [x] Lanes (`HELLGATE_LANES`, default 2)

**Gate:** all five canaries pass. They are the tests whose names start with `CANARY` in
`engine/src/sandbox/sandbox.test.ts`.
1. An empty agent scores 0.
2. An agent that reads a file outside the jail is denied.
3. A solution that opens a test file gets `ENOENT`.
4. Agent and solution network access are both denied.
5. A solution that forges a result is marked `tampered`.

Each defence was also switched off in turn to confirm that the matching tests fail (the permission
flag, the environment scrub, the `assert` copy, the exit-code check, the nonce check).

## Stage 5: Model gateway · K · `[x]` 🔴
- [x] Provider interface with two clients: **Gemini** and **Groq** (ARCHITECTURE §6.6 mapping)
- [x] Slots (`primary`, `secondary`, `proposer`) resolved through `config.models`
- [x] Budget (calls, tokens and time, with a per-slot token count), one rate limiter per
  provider, retries with backoff, and infrastructure failures that are never scored
- [x] Request key (PROTOCOL §5.3), `record` and `replay` modes; a replay miss is an error

**Tests:**
- the request key is stable, ignores `tag` and `slot`, and changes with provider and model;
- both clients map requests and replies correctly, checked against a fake HTTP server;
- replay serves exactly what was recorded, and a miss fails loudly;
- the budget refuses the seventh call, and token use is counted per slot.

**Gate:** a live smoke test, one real task, **on each provider**, records and then replays to
an identical result.

## Stage 6: Measurement · K · `[x]`
- [x] Runner: R runs, seeded order (PROTOCOL §6), per-case scoring (PROTOCOL §7)
- [x] Paired effect, bootstrap interval, call (PROTOCOL §8)
- [x] Results digest
- [x] Score against the base: a build's score, and its difference from the base build (PROTOCOL §11.1)

**Tests:**
- frozen vectors for seeds, order and the bootstrap on synthetic data;
- the same recording replayed twice gives an identical digest;
- `vsBaseBp` is positive for a better build and negative for a worse one.

## Stage 7: Genesis agent and the full suite · K · `[~]` 🔴 (agent and suite done; the live baseline is being recorded)
- [x] `agent/contract.ts` (frozen), `agent/index.ts`, `agent/instructions.ts` (`RULES`),
  and the loop: a deliberately simple baseline with one `primary` call per task
- [x] A ready-made two-model change (the secondary model reviews the draft), in `scripts/build-code-tree.ts`
- [x] The full public suite: 16 tasks in five use cases. Kai reviews every case file.
- [ ] Record the baseline live

**Gate:** the genesis build scores **30–55%** on the suite. If it doesn't, tune the tasks,
not the agent, and record it again.

**Measured** (live, real model, 2 runs): 43%. The first version sent the model the whole brief and
scored 91%, so there was nothing left to improve; the genesis agent now sends only the title, the
introducing sentence and the output line. With nothing but the title it scored 0%, because the model
wrote the function without `export`. Both extremes were useful: they show where headroom comes from.

## Stage 7M: The `ml` domain · K · `[x]` 🔴
- [x] `learner/contract.ts` (frozen), `learner/index.ts`, `model.ts`, `optim.ts`, `prep.ts`,
  `schedule.ts`: a small neural network with plain SGD, as the baseline
- [x] The `ml` suite: 12 tasks in four use cases of three (nonlinear classification, badly
  scaled features, noisy regression, imbalanced classes), each with a deterministic `data.mjs`
- [x] Ready-made changes in `scenarios/ml/`: standardised features, momentum, Adam, learning-rate
  decay, a learning-rate nudge that should come out as noise, and class rebalancing

**Gate:** the baseline scores **40–70%**, a full verification takes **under a minute** on the
2-core laptop, and Adam beats plain SGD on the badly-scaled use case. If the baseline is outside
the band, tune the tasks, not the learner.

**Measured** (5 runs, shared seeds): the genesis learner scores 63%, a batch takes 16 s, so
verifying a change takes about 30 s. Standardising gives +21 points, Adam +13, momentum +16,
rebalancing +5 (all of it in one use case), the learning-rate nudge about +1 (below the minimum
effect) and the cosine decay −5. Adam beats plain SGD on the badly-scaled use case (54% against
50%), though the large cure for that use case is standardising. Kai reviews every `data.mjs`.

## Stage 8: The verdict · K · `[x]`
- [x] `decide()`, exactly as PROTOCOL §9, as a pure function

**Tests:**
- one test per verdict row;
- equivocation;
- self-attestation ignored;
- mismatched attestations ignored;
- the reported numbers follow the rule.

## Stage 9: CLI and the offline loop · K · `[x]` 🔴
- [x] `init`, `id`, `propose`, `submit` (with guards and typecheck), `bench`, `verify`, `status`,
  `check`, `tree`, `graveyard`, `show`, `digest`, `export` (for the `ml` domain; `code` waits for Stage 5)
- [x] Guards (ARCHITECTURE §6.9) and the scratch typecheck; failures become `void` changes

**Gate:** on a temporary tree, three keys run `submit → verify → verify → check` offline,
using a recording, and reach the expected verdict. `export` matches PROTOCOL §11.

## Stage 10: Hub · K · `[x]` 🔴
- [x] `serve`: records, export (cached until the ledger changes), version, several trees
- [x] `push` and `pull`
- [x] Jobs API with server-sent events (PROTOCOL §10.1), the token, one job at a time (`verify` jobs; `challenge` jobs are Stage 14)

**Gate:** two `HELLGATE_HOME`s exchange records over HTTP, and a `verify` job streams its
events to `curl`.

**Unblocks F:** the real data contract is live, and the web app can switch from mock to hub.

## Stage 11: The real tree and the demo scenarios · K · `[~]` 🔴 (the `ml` tree is done; the `code` tree waits for Stages 5 and 7)
- [ ] Record and submit the scenario changes (ARCHITECTURE §8): real fix, the "feels
  better" trap, regression, cheating agent
- [ ] Verify each with two keys
- [ ] A `scripts/lazy-verifier` tool that signs copied numbers, for the lazy-verifier scenario

**Gate:** every scenario gets its expected verdict for real, and `export` holds a tree
worth showing.

## Stage 12: Web app · F (K supports) · `[ ]`
- [ ] Build against `web/mock/export.sample.json` first, as specified in [FRONTEND.md](FRONTEND.md)
- [ ] Switch to the hub after Stage 10

**Done when:** every page in FRONTEND.md works on live hub data, and a running job streams
on screen.

## Stage 13: Live spot-check · K · `[ ]`
- [ ] The task sample derived from the verifier and the change (PROTOCOL §8); a live run of
  those tasks; tolerance; the `SPOT_CHECK_FAILED` and `UNREPRODUCIBLE` paths

**Tests:**
- the sample is deterministic per verifier;
- a doctored recording is caught.

## Stage 14: Beat the gate · K+F · `[~]` 🔴 (the engine side is done; the web form is Pritam's)
- [x] `challenge` jobs: validate, append the instruction as one quoted string, the usual guards, a
  live record by the house author key, two bot verifications by replay (`hub/challenge.ts`)
- [x] A repeated instruction is answered from the ledger and spends no model call
- [ ] Web form and live progress (`web/`)

**Tests** (`hub/challenge.test.ts`, with a fake provider): the cleaning and quoting of the
instruction (quotes, backslashes, backticks and `${` survive as exactly one string); refused requests
spend nothing; the stream has the stages `build, record, verify, sign, verify, sign`; only the
candidate is recorded live; the verdict and the stored change agree; a second job gets `409`.

**Gate:** a typed instruction becomes a measured, verified change on screen, end to end.

## Stage 15: Evolve · K · `[ ]`
- [ ] The digest as text, the proposer prompt, a JSON reply with one repair turn, then the
  shared submit path
- [ ] `--dry-run` prints exactly what the model would receive

## Stage 16: Stellar receipts · K+F · `[ ]`
- [ ] `id fund` (Friendbot), receipts (PROTOCOL §5.6), `anchor` to backfill, receipt
  checks, links in the web app

**Gate:** a receipt opens on a block explorer and checks out against its record.

## Stage 17: Demo hardening · K+F · `[ ]` 🔴
- [ ] A fallback for every live step: a pre-run job, the replay path, and a recorded video
- [ ] Rehearse the demo script three times end to end
- [ ] Final README
- [ ] **Doc audit:** every claim in the docs is true of the build. Remove or mark anything
  that is not.

**Gate:** two full rehearsals in a row with no manual fixes.

## Later, if time allows
- Paying verifiers on a final verdict (a Stellar multi-signature escrow)
- A held-out sealed suite and the `OVERFIT` verdict
- A GitHub Action and an MCP tool
