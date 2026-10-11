# From non-production to production

The question: how does a change move from "somebody's idea" to "what runs in production", with proof, and
without a person ticking a box? Hellgate's answer is that **the gate is the only door**, and the verifying is
done by bots.

## The stages

| Stage | Where | What happens | Who does it |
|---|---|---|---|
| 1. Propose | non-production | `hellgate propose`, edit, `hellgate submit`. Guards run first (size, frozen contract, forbidden imports). The author measures against the live models (code) or trains (ml). | the author, or a script |
| 2. Verify | non-production, in the sandbox | Verifier keys re-measure the change from scratch. For code they replay the recorded answers: no key, no network. | **bots, automatically** |
| 3. Decide | derived | A fixed rule turns the attestations into a verdict. The author's own number never counts. | the verdict rule |
| 4. Promote | the way out | `hellgate promote` writes the build and a manifest. It **refuses** anything that is not accepted. | a script or a CI job |
| 5. Production | released files | The release is the build of the tip of the gate path, with `RELEASE.json` naming the change, the score and the verifier keys. | whoever deploys the files |

"Production" here is the **tip of the gate path**: the latest accepted change, on an unbroken chain of
accepted changes from the baseline. It is shown on the home page, served at `GET /v1/trees/<name>/production`,
and is what `promote` releases.

## In the web app (no terminal needed)

- **Production** (nav): the current release, the tip of the gate path, with its score, the verifier keys that
  vouch for it, its files (expandable) and a download of the release as JSON.
- **Release this change to production** (every change page): asks the gate. An accepted change on the gate path
  comes back with its release. A rejected, contested, pending or void change comes back **refused, with the reason**.
  Clicking it on a rejected change is the clearest way to show that nobody can push a bad change out.
- **Beat the gate** is the whole non-production path from the browser: type an instruction, watch it recorded and
  verified by the two bots, and see the verdict. If it passes, its change page offers the release.

## The bots

Start the hub with `HELLGATE_AUTO_VERIFY=1` (`pnpm demo:auto` does it). Every few seconds the hub looks for
a pending change that has too few verifications. Any bot key that did not author it, and has not measured it,
verifies it with the same code a person runs, and signs the result. Nobody clicks anything. Two bot keys
make the quorum; a human verifier who joins counts as well.

A bot's attestation is as good as anybody's and no better: a bot that did not really run the work would
produce a different results fingerprint and the change would be contested, like any lazy verifier.

## Automation in CI

All of it is commands with exit codes, so any CI system can drive it:

```bash
hellgate submit --from ./candidate --root trees/code ...      # non-production: record the change
hellgate check <change> --root trees/code                      # exit 0 accepted, 1 rejected or void, 2 pending
hellgate promote <change> --root trees/code --out ./release    # exit 0 released, 1 refused
```

A pipeline step that runs `check` blocks a merge until verification finishes; a deploy step runs `promote`
and deploys `./release`. We have not built a packaged GitHub Action around these commands. The commands are
the integration.

## What this is not

- It is a **pre-release gate in non-production**. It does not read live traffic, run canaries, or monitor
  production after release. It decides what is allowed to go, with proof attached.
- Bots in the demo are keys held by the hub. In a real deployment the bots are other machines with their own
  keys, which is exactly what `hellgate verify` and `push` already support.
