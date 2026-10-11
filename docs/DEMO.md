# Demo runbook

Everything runs on one laptop. There is nothing to deploy: the engine's hub and the web app both start
from this repository, and every record the demo shows is a file in `trees/`.

## 1. Once, before the day

```bash
pnpm install                  # root, installs the engine and the web app
cp .env.example .env          # then fill in the keys (see below). .env is never committed.
pnpm -C web build             # the web app, built once so the demo starts fast
pnpm preflight --probe        # checks the trees, the keys, and that the model keys still have quota
```

`.env` holds `GEMINI_API_KEY` and `GROQ_API_KEY`. Only **Beat the gate** needs them: viewing the trees,
reading evidence and running a verifier all work offline. `HELLGATE_HUB_TOKEN` is optional on a laptop
(the hub uses `dev-token`).

**Free-tier warning.** The free Gemini key allows 500 requests a day per model, and one Beat the gate
challenge records about 80. Check `pnpm preflight --probe` on the morning of the demo, and keep a second
key from another Google project in reserve (swap it into `.env` and restart).

## 2. Start

```bash
pnpm demo                     # hub on :8787 and the web app on :3000. Ctrl-C stops both.
```

Open <http://localhost:3000>. Two trees sit behind the tree switcher: **ml** (a learning algorithm,
12 tasks, 2,400 hidden test points) and **code** (an LLM coding agent, 16 tasks, 182 hidden test cases).

A second person with their own key is a real second verifier: they `git pull`, run
`pnpm hellgate verify <change>` against their own folder, and `push` to the hub URL. Their attestation
shows up on the change page within seconds.

## 3. The script (about 4 minutes)

All numbers are from the committed trees. Say the sentences, not the numbers, if you are short of time.

| # | Open | Show | Say |
|---|---|---|---|
| 1 | `ml` tree on the home page | The gold line from baseline to standardise to Adam; grey nodes off to the side. Score goes 63.1% to 91.9%. | "Every node is a change somebody believed in. Gold got through the gate. Grey didn't, and stays here, with its numbers, so nobody repeats it." |
| 2 | The **momentum** grave (`optimizer/momentum`) | The author's number is up about 7 points; the noise band straddles zero; verdict NO_EFFECT. | "It looks better, and it isn't proven. The gain is in a few tasks and the interval includes zero. A bigger number is not evidence." |
| 3 | The **standardise** change (accepted) | +21.1 points; both verifiers' bars clear zero; per-use-case bars. | "This one is real. Two keys re-ran it and agree." |
| 4 | The pending change **gradient-clipping**, then **Run verifier bot-2** | The live grid fills (about 2 minutes). Status flips from waiting to a verdict. | "This is happening now, on this machine: the old and new learner both trained from scratch, on the same seeds." |
| 5 | `read-the-generator` (ml) or `read-the-tests` (code) | Status void, reason `bad-import`. | "An agent that tries to read the answers is stopped before it runs, and the sandbox can't see them anyway. It is recorded as a failure." |
| 6 | `longer-training` (ml) or `reword-rules` (code) | Status contested, `RESULTS_MISMATCH`. | "A verifier signed numbers without running anything. A replay is deterministic, so its fingerprint didn't match the honest ones." |
| 7 | `code` tree, then **Beat the gate** | Type one instruction; watch build, record, verify, sign. About 5 minutes. | "Your idea, measured live. At 94% there is little headroom, so most die here. That is the point." |

**Scene 7 needs the model key, and takes minutes.** Start it early, say what it is doing, and carry on
with other scenes (closing the page does not cancel the job; reopening re-attaches). If the key has no
quota, show the finished `full-brief` change instead: it was recorded live against Gemini, and any laptop
can re-verify it with no key and no network.

## 4. If something fails

| Symptom | Do |
|---|---|
| Blank page or no trees | Is the hub up? `curl localhost:8787/v1/trees`. Restart `pnpm demo`. |
| Beat the gate says "quota" or "unavailable" | The model key is out of quota. Show a finished change; say so plainly. |
| Beat the gate says "a job is already running" | Someone started one. The page shows it; wait or watch it. |
| A verify job fails | Show the same change's existing attestations, which are the same evidence. |
| Everything is down | The tree files are the evidence. `pnpm hellgate tree --root trees/code` prints the same story in a terminal. |

## 5. Wording to keep

- "Distinct keys", never "independent people".
- "Recorded real answers, replayed through the real tests." Never imply a replay is a fresh model call.
- Say the limits before you are asked: 16 tasks are evidence, not proof; one person can hold two keys;
  the sealed held-out suite and live spot-checks are designed (see the protocol) and not part of this demo.
