# Hellgate engine

The CLI, the hub server and every rule: canonical hashing, signing, the sandbox, the model
gateway, measurement and the verdict.

The design is in [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) §6. The exact rules
are in [../docs/PROTOCOL.md](../docs/PROTOCOL.md). Build progress is in
[../docs/STAGES.md](../docs/STAGES.md).

```bash
pnpm install               # once, from the repository root
pnpm -C engine typecheck   # must print nothing
pnpm -C engine test
```

Node 22.18 or newer is required: the engine runs TypeScript directly, with no build step.
