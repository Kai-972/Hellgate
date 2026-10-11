<p align="center"><img src="docs/brand/logo.png" alt="Hellgate: proof for AI changes" width="420"></p>

# Hellgate

**Proof for AI agent changes.**

Everyone changes an AI agent and says it *feels* better. Hellgate makes them prove it.

A change only gets **through the gate** when verifiers with other keys re-run it and
measure a real gain. Everything else goes to **the graveyard**, with the numbers that
killed it, so nobody tries it again.

## Run it

```bash
pnpm install
pnpm preflight        # checks the trees and the keys
pnpm demo             # hub on :8787, web app on :3000 (see docs/DEMO.md)
pnpm test             # the engine's tests
```

What is built is tracked in [docs/STAGES.md](docs/STAGES.md).

## Repository

| Path | What |
|---|---|
| `engine/` | The engine: CLI, hub server, sandbox, model gateway, statistics and the verdict rule (TypeScript, Node ≥ 22.18) |
| `web/` | The web app: the gate, the graveyard, change pages and Beat the gate (Next.js) |
| `agent/`, `learner/` | The two things under test: an LLM coding agent and a small neural-network learner |
| `suites/` | The benchmark tasks (hidden test cases and data generators) |
| `trees/` | The committed ledgers: every change, claim, recording and attestation, as files |
| `scenarios/`, `scripts/` | The ready-made changes, and the scripts that built the trees and run the demo |
| `docs/` | Design, protocol, build stages, frontend brief and team log |

## Docs

- [Pipeline](docs/PIPELINE.md): a change from idea to verdict, step by step
- [Architecture](docs/ARCHITECTURE.md): what it is, how it works and why
- [Protocol](docs/PROTOCOL.md): records, hashing, signing, scoring and the verdict rule
- [Guide](docs/GUIDE.md): start here. What it is, what the two trees mean, how "better" is decided, and every label on the site
- [For judges](docs/JUDGES.md): what is built, how a change is judged, and the honest limits
- [Demo runbook](docs/DEMO.md): setup, the script, and what to do when something fails
- [Pitch and video script](docs/PITCH.md): the positioning, the lines against competitors, and the 3-minute script
- [Release pipeline](docs/RELEASE.md): from non-production to production, with bots verifying automatically
- [Testing](docs/TESTING.md): the automated tests, a smoke test, trust checks you can run yourself, and a live end-to-end run
- [Stages](docs/STAGES.md): the build plan and its status
- [Progress](PROGRESS.md): the current state at a glance
- [Frontend](docs/FRONTEND.md): the web app brief
- [UI prompt](docs/UI-PROMPT.md): the design and build prompt for the web app
- [Log](docs/LOG.md): the shared team log
