# Progress

The current state of the build, at a glance. This file is a **status board**: edit your own
row in place so it always shows what is true now. The running story, with what was found
along the way, is the append-only [docs/LOG.md](docs/LOG.md). The plan is
[docs/STAGES.md](docs/STAGES.md).

**How to update:** change your row, tick items in STAGES.md, and add a LOG.md entry for
anything the other person needs to know. No dates or times.

Status: `todo` · `doing` · `done` · `blocked`

## Workstreams

| Workstream | Owner | Status | Doing now | Next | Blocked on |
|---|---|---|---|---|---|
| Engine core (Stages 1–4, 6, 8, 9) | Kai + Claude | done | Done: core, identity, records, ledger, config, suite format, sandbox, measurement, verdict, CLI | Stage 10: the hub | nothing |
| Sandbox (Stage 4) | Kai + Claude | done | All five canaries pass for both the `code` jails and the `ml` runner | Used by Stage 6 | nothing |
| `ml` domain: learner, suite, sandbox runner (Stages 4, 7M) | Kai + Claude | done | Genesis learner (63%), 12-task suite in 4 use cases, six ready-made changes, all re-measured | Used by the CLI (Stage 9) and the real tree (Stage 11) | Kai's review of the data generators |
| Model gateway: Gemini and Groq (Stage 5) | Kai + Claude | done | Both providers live; record, replay, budgets, limits and retries; tested against fake servers | Used by the `code` domain | nothing |
| `code` domain: agent, suite, tree (Stages 7, 11) | Kai + Claude | done | Genesis agent (44.5%), 16 tasks in 5 use cases; the coding tree (5 changes) is committed, recorded live and verified by replay | Two more changes when Gemini quota returns | Kai's review of the cases |
| Beat the gate (Stage 14) | Kai + Claude | doing | Engine side done: `challenge` jobs on the hub, tested | The web form (Pritam) | the web app |
| Benchmark tasks (Stages 3, 7, 7M) | Kai | doing | 3 coding pilot tasks and all 12 ML tasks written; reference solutions pass | Kai reviews every `cases.mjs` and `data.mjs`; then the task spec for the free-tier agents (13 more coding tasks) | |
| CLI and hub (Stages 9–10) | Kai + Claude | done | CLI, hub, push/pull, live job events; both real trees; `pnpm hub:demo` starts the hub with the demo keys | Stage 13 spot-checks, Stage 15 evolve | |
| Web app (Stage 12) | Frontend teammate | done on mock data | All 6 pages, SVG charts, live progress, tree switcher; production build clean | Switch from mock to the live hub (`pnpm hub:demo`, both trees); wire Beat the gate to `/v1/trees/code/jobs` | |
| Demo, README, video | Both | doing | Runbook ([docs/DEMO.md](docs/DEMO.md)), judge page ([docs/JUDGES.md](docs/JUDGES.md)), `pnpm demo`, `pnpm preflight` | Rehearse twice; screenshots; the video | a Gemini key with quota for the live Beat the gate |

## Checkpoints

A checkpoint is passed when everything listed works, not when it is started.

| # | Engine side | Web side | Passed |
|---|---|---|---|
| C1 | Core, identity, records and store done and tested (done) | App shell, home page and tree on mock data (done) | yes |
| C2 | Sandbox canaries pass (gate, passed); first tasks reviewed (waiting on Kai) | Change page and the noise-band chart (done) | engine side: canaries yes, review pending |
| C3 | Gemini gateway works live; baseline recorded and in the target band (gates) | Graveyard page and the live progress panel on mock events (done) | yes |
| C4 | Verdict and the offline loop work; hub is up (gates) — engine side done | **Switch from mock to the hub** | engine side yes; awaiting the switch |
| C5 | Real tree and demo scenarios recorded and verified (gate); Beat the gate | Beat the gate page; verifiers page; polish (done on mock) | engine side in progress |
| C6 | Freeze. Doc audit. | Rehearsals, README, demo video | no |

## Tiers

What we build, in order. A tier starts only when the one above it works (see STAGES.md).

1. **Must ship:** Stages 1–11, 12, 17
2. **Differentiators:** Beat the gate, then live spot-checks
3. **Only with time left:** Stellar receipts, the proposer model, CI action, MCP tool

## Decisions

| Decision | Outcome |
|---|---|
| Engine work | Kai + Claude own all of `engine/`. The scaffold already on `main` is merged for history, then replaced with the protocol-conformant core. |
| Frontend teammate's job | The whole web app (`web/`), then the README and the demo video. Not the engine. |
| Benchmark tasks | Kai drafts them with free-tier agents from a task spec, reviews them, and Claude writes a validator. |
| Demo machine | Kai's laptop runs the hub and the web app. The teammate's laptop is a real second verifier. |
| Domains | Two: `ml` (learning algorithms) and `code` (an LLM coding agent). The pipeline is domain-independent, so it is built end to end on `ml` first (no API, real run-to-run noise), then `code` plugs in. |
| Models for the `code` domain | `primary` = Gemini, `secondary` = Groq. The agent asks for a slot, and the orchestration is part of the change. |
| Toolchain | pnpm workspace, Node's built-in test runner, Node ≥ 22.18 for the engine. |
| Duplicate root docs (`PIPELINE.md`, `SUMMARY.md`) | Removed in the merge. ARCHITECTURE.md and PROTOCOL.md are the single source. |
| Whether Tier 3 gets any time | Decided at checkpoint C5 |

## Known risks

| Risk | Plan |
|---|---|
| The sandbox takes longer than planned | Its gate must pass before anything depends on it. Fall back to the simplest process isolation that passes the five canaries. |
| The baseline agent scores outside 30–55% | Tune the tasks, not the agent, and record again. |
| Gemini free-tier limits | Record once, replay everywhere. Calls are rate-limited and retried. |
| Live steps fail on stage | Every live step has a finished run to fall back to, and there is a recorded video. |
