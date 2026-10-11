# Testing Hellgate

Four layers, from fastest to most realistic. Run A and B before every push, C before every rehearsal,
and D once as a team. Every command runs from the repository root.

## A. Automated (about 2 minutes)

```bash
pnpm test           # the engine: 167 tests, 1 optional slow test skipped
pnpm typecheck      # silent when clean
pnpm preflight      # trees load, keys present; add --probe to ask the model providers
pnpm -C web build   # the web app compiles
```

What the tests cover: the sandbox (a test per attack), the statistics (against an independent Python
implementation), every path of the verdict rule, the model gateway (against fake servers), the whole
offline loop through the real CLI in both domains, and the hub including Beat the gate and its job stream.
The tests named `CANARY` are the sandbox gate: if one fails, nothing else matters.

## B. Smoke test of the running system (10 minutes)

Start it: `pnpm demo`, open <http://localhost:3000>.

| # | Do | Expect |
|---|---|---|
| 1 | Open the home page. Switch between the `ml` and `code` trees. | Each shows a tree of changes, gold for accepted and grey for the rest. No console errors. |
| 2 | Open `ml`'s **momentum** change. | Verdict NO_EFFECT; the noise band straddles zero though the number looks positive. |
| 3 | Open `ml`'s **standardise** change. | ACCEPTED; two verifier cards with the same direction; per-use-case bars. |
| 4 | Open the **graveyard** page. | Rejected, void and contested changes each show a cause and their numbers. |
| 5 | Open `code`'s **read-the-tests** change. | Void, reason `bad-import`, no scores. |
| 6 | Open `ml`'s pending **weight-decay**, click **Run verifier bot-2**. | A progress grid fills for about 2 minutes, then the status leaves "waiting". Reload the page mid-run: it re-attaches. |
| 7 | **Verifiers** page. | Keys shortened, with attestation counts. |
| 8 | **How it works** page. | The limits are stated plainly. |

## C. Trust checks from a terminal (the "is it real?" tests)

These show that the evidence is checkable without the web app. `pnpm hellgate` is the CLI.

1. **The verdict is derived, not stored.**
   `pnpm hellgate check 6ca17f9f --root trees/code` prints ACCEPTED with two verifier keys and the same
   results digest (`digest 271a8b42`) for both. The exit code is 0.
2. **Tampering is caught.** Copy `trees/code` somewhere, change `"effectBp":3700` to `9900` inside the
   attestation record that contains it, then run `check` on the copy. The edited attestation no longer
   matches its signature and is dropped, so the change falls back to PENDING with 1 of 2 verifiers.
3. **Anyone can re-verify.** On a laptop with no model key and no network, with a fresh key
   (`pnpm hellgate id create`), run `pnpm hellgate verify <change> --root trees/code` on a copy of the
   tree. It replays the recorded answers through the real tests and signs a new attestation with the
   same digest as the others.
4. **The author cannot approve their own change.** Verifying with the key that authored a change is
   refused with a clear message.
5. **A bad idea is stopped before it runs.** Propose a change that imports `node:fs` or has no number in
   its "falsified if": `submit` stores it as a void change with the exact reason.
6. **The statistics agree with an independent implementation.** The expected values in
   `engine/src/measure/measure.test.ts` were produced by a separate Python implementation of the protocol's
   formulas; `pnpm test` fails if the engine's numbers drift from them.

## D. Live end-to-end (needs a model key with quota; about 8 minutes)

1. `pnpm preflight --probe` says Gemini answers.
2. On **Beat the gate** (code tree), type a real instruction, for example: "Before writing the code, think
   through the edge cases of the task and handle each of them." Expect the stages
   `build → record → verify → sign → verify → sign`, a grid that fills three times, and a verdict with
   numbers. A repeat of the same instruction answers instantly and spends nothing.
3. Open the new change: its origin is "challenge" with the instruction shown, the diff is the one added
   line, and two bot keys have signed.
4. Try the refusal cases: fewer than 8 characters (a clear message), a second challenge while one runs
   ("another job is running"), and no model key (a plain error, never a fake result).

## Who tests what

| Who | What | When |
|---|---|---|
| Kai | A, then C, then D; reads a few `cases.mjs` and `data.mjs` files | before every push |
| Pritam | B on both trees, error and empty states, phone width, `pnpm -C web lint` | continuously |
| A third person | C3 on their own laptop with their own key | once, before the demo |

## Rehearsal

Run [DEMO.md](DEMO.md) top to bottom twice with a timer. The second run must need no manual fixes.
Keep a log of anything that surprised you in [LOG.md](LOG.md).
