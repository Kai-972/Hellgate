# Hellgate

**Proof for AI agent changes.**

Everyone changes an AI agent and says it *feels* better. Hellgate makes them prove it.

A change only gets **through the gate** when verifiers with other keys re-run it and
measure a real gain. Everything else goes to **the graveyard**, with the numbers that
killed it, so nobody tries it again.

> Work in progress. What is built so far is tracked in [docs/STAGES.md](docs/STAGES.md).

## Repository

| Path | What |
|---|---|
| `engine/` | The engine: CLI, hub server, sandbox, model gateway, statistics and the verdict rule (TypeScript, Node ≥ 22.18) |
| `web/` | The web app: the gate, the graveyard, change pages and Beat the gate (Next.js) |
| `agent/` | The agent under test (added in Stage 7) |
| `suites/` | The benchmark tasks (added in Stage 3) |
| `docs/` | Design, protocol, build stages, frontend brief and team log |

## Docs

- [Pipeline](docs/PIPELINE.md): a change from idea to verdict, step by step
- [Architecture](docs/ARCHITECTURE.md): what it is, how it works and why
- [Protocol](docs/PROTOCOL.md): records, hashing, signing, scoring and the verdict rule
- [Stages](docs/STAGES.md): the build plan and its status
- [Progress](PROGRESS.md): the current state at a glance
- [Frontend](docs/FRONTEND.md): the web app brief
- [UI prompt](docs/UI-PROMPT.md): the design and build prompt for the web app
- [Log](docs/LOG.md): the shared team log
