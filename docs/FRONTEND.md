# Frontend brief

Everything the web app needs, in one place. The web app lives in `web/`. Its data comes
from the Hellgate hub (the engine's HTTP server). Until the hub exists, it uses the mock
files in `web/mock/`, which follow the same contract.

---

## 1. What Hellgate is, for the person building the UI

Hellgate is a referee for changes to an AI agent. Someone changes the agent (its
instructions, how it reads the model's reply, its retry logic) and claims it got better.
Hellgate makes the claim prove itself:

- The change is tested on 16 coding tasks, 5 runs each.
- At least two **verifiers** with other keys re-measure the old and the new version side
  by side.
- A fixed rule decides. Real gains pass **through the gate**. Everything else goes to the
  **graveyard**, with the numbers that killed it.

The UI has three jobs:
1. **Show the tree** of changes: what passed, what died and why.
2. **Show the evidence** behind each verdict, especially the **noise band**: why a change
   that "felt better" was just noise.
3. **Run things live** on stage: verify a change, and let a visitor **Beat the gate** by
   typing an instruction that gets measured for real.

**The one hard rule:** the UI never decides a verdict. Status, code, reason and numbers
all come from the data. If something looks wrong, it is an engine bug; report it in
[LOG.md](LOG.md).

## 2. Stack
- **Next.js (App Router) + TypeScript + Tailwind CSS.** Inside `web/`, as its own package
  in the pnpm workspace.
- **Charts and the tree:** hand-written SVG. `d3-hierarchy` is fine for the tree layout.
  No heavy chart library is needed.
- **Fonts:** a characterful serif for headings and a monospace for numbers and ids. For
  example, Fraunces and JetBrains Mono from Google Fonts.
- It must work on a laptop screen (1366 wide and up) and be readable on a phone (from 375
  wide).

**Setting up the app.** `web/` already holds `README.md` and `mock/`. Do not delete them.
1. From the repository root, create the Next.js app. If the generator refuses because `web/`
   is not empty, generate it in a temporary folder and copy the files into `web/`, keeping
   `mock/` and `README.md`:
   `pnpm dlx create-next-app@latest <temp> --ts --tailwind --app --eslint --use-pnpm`.
2. Set `"name": "@hellgate/web"` in `web/package.json`. The workspace file at the repository
   root already lists `web`.
3. Run `pnpm install` from the repository root (not inside `web/`), so there is one lockfile.
4. Add `web/.env.example` with `HELLGATE_HUB=` and `HELLGATE_HUB_TOKEN=` (empty means mock
   mode), and keep `web/.env.local` out of git (the repository `.gitignore` already does).
5. Your Node needs to be a current LTS or newer. The web app does not need Node 22.18; only
   the engine does.

## 3. Data access

All hub access goes through Next.js server routes, because jobs need a secret token that
must never reach the browser.

| Web route (server) | Proxies to | Mock mode (no `HELLGATE_HUB` set) |
|---|---|---|
| `GET /api/trees` | hub `GET /v1/trees` | returns `web/mock/trees.sample.json` |
| `GET /api/export?tree=<name>` | hub `GET /v1/trees/<name>/export` | `export.sample.json` (tree `coding-agent`) or `export.ml.sample.json` (tree `optimizer`) |
| `GET /api/version?tree=<name>` | hub `GET /v1/trees/<name>/version` | returns a constant |
| `POST /api/jobs` | hub `POST /v1/jobs` with `Authorization: Bearer $HELLGATE_HUB_TOKEN` | returns a fake job id |
| `GET /api/jobs/[id]/events` | hub `GET /v1/jobs/:id/events` (stream passthrough) | replays `web/mock/job-events.sample.json`, waiting `delayMs` between events |
| `GET /api/jobs/current` | hub `GET /v1/jobs/current` | `204` |

**For the look, the screens and a paste-ready prompt, read [UI-PROMPT.md](UI-PROMPT.md) first.**

**The real hub exists now.** From the repository root: `pnpm hub` serves `trees/ml` on
`http://127.0.0.1:8787`. To follow jobs the hub needs `HELLGATE_HUB_TOKEN` (and the two demo verifier
secrets) in its environment; ask Kai for a ready `.env`. Then in `web/.env.local` set
`HELLGATE_HUB=http://127.0.0.1:8787` and `HELLGATE_HUB_TOKEN=…`, and your routes proxy instead of
reading `web/mock/`. What to expect from the real data, which the mock already shows: `models` is
`null` for the `ml` tree; `base`, `scoreBp`, `vsBaseBp`, `effectBp` and the interval can be `null` (see
PROTOCOL §11.1); a verifier's `label` is a shortened address; a `verify` job emits `log, stage,
progress…, stage, attestation, change, done`, and a client that connects late is replayed from the
start. The read routes allow any origin, so you can also fetch them straight from the browser.

Environment variables for `web/.env.local`, which is never committed:
`HELLGATE_HUB=http://localhost:7777` and `HELLGATE_HUB_TOKEN=...`.

**Live refresh:** poll `/api/version` every 3 seconds. When it changes, refetch
`/api/export`. A verification run from a terminal or another laptop then appears on screen
by itself.

### 3.1 The export document (what every page renders)
The full shape is in [PROTOCOL.md §11](PROTOCOL.md#11-export-document-hellgateexport1).
A real example is `web/mock/export.sample.json`. The fields that matter most:

| Field | Meaning |
|---|---|
| `changes[]` | Every change, including failures. Never filter out rejected or void ones, except on purpose (for example, a "gate path only" toggle). |
| `changes[].status` | `accepted` · `rejected` · `pending` · `contested` · `void` |
| `changes[].code` | Why. `GAIN`, `NO_EFFECT`, `REGRESSION`, `NOT_CLEAN`, `UNREPRODUCIBLE`, `RESULTS_MISMATCH`, `SPOT_CHECK_FAILED`, `CONFLICT`, `NEEDS_VERIFIERS`, `VERIFIERS_DISAGREE`, or a guard name such as `bad-import` for `void`. |
| `changes[].reason` | One plain-English sentence. Show it as-is. |
| `changes[].effectBp`, `ciLowBp`, `ciHighBp` | The verdict's effect and its 95% interval, in basis points. `null` while pending or void. |
| `changes[].claim` | The hypothesis, what would falsify it, the area and the motif |
| `changes[].claimed.effectBp` | What the **author** measured on their own. Show it as "claimed", next to the verified number. The gap between the two is the story. |
| `domain`, `suite.groups`, `changes[].perGroup` | `code` or `ml`, and the score per **use case**. Show a use-case breakdown on the change page: a small bar pair per group, parent against candidate. |
| `changes[].scoreBp`, `changes[].vsBaseBp` | The change's verified score and its difference from the base (PROTOCOL §11.1). Positive is up, negative is down; `null` when there is no counted evidence. |
| `changes[].slots` | Which models the change used: `["primary"]` or `["primary","secondary"]`. |
| `models`, `base` | The configured model for each slot, and the base change every `vsBaseBp` is measured from |
| `changes[].attestations[]` | Each verifier's measurement: `effectBp`, interval, `call`, per-run scores for both sides, spot-check, and `counted` / `why` |
| `changes[].origin.by` | `human` · `agent` (made by the proposer model) · `challenge` (Beat the gate, with `instruction`) |
| `changes[].mechanical` | For `void` changes, `detail` holds the exact reason it never ran |
| `changes[].perTask[]` | Per-task score, parent against candidate |
| `gatePath`, `curve` | The accepted chain and its score per generation |
| `verifiers[]` | Each key: address, label, counts, flags, Stellar account link |
| `digest` | Plain text: what the next proposal reads. Render it in a monospace block. |

**Units:** 100 bp = 1 point. Always display points with one decimal and a sign, for example
`+25.4 pts` or `−1.1 pts`. Scores are percentages: `4900` bp = `49.0%`.

### 3.2 Job events (live progress)
`text/event-stream`. The types are listed in [PROTOCOL.md §10.1](PROTOCOL.md#101-jobs).
- `stage` moves a step indicator: guards → typecheck → record → verify (bot-1) → spot-check
  → sign → push → verify (bot-2) → …
- `progress` gives `done`/`of` for a progress bar, plus per-task `passedCases`/`cases` for a
  live grid of task cells.
- `attestation` arrives when a verifier signs. Show it as a card.
- `change` carries a status update.
- `done` is the final verdict. `error` is a plain message to show.

## 4. Visual direction
- **The theme is Hellgate.** A dark, warm, near-black background, with **ember gold** for
  the gate path and accepted changes. The graveyard is cold **stone grey**. Contested is
  **amber**. Pending is an outline. Void is **dashed grey**.
- It should feel like a serious instrument with some drama, not a meme. Use restraint:
  one accent colour, generous spacing, and numbers in monospace.
- **Status visuals:**

  | Status | Node | Badge |
  |---|---|---|
  | accepted | solid ember circle with a soft glow | "Through the gate" |
  | rejected | small grey tombstone | "Graveyard: no effect" or "Graveyard: regression" |
  | void | dashed grey outline | "Never ran: <guard>" |
  | pending | hollow ember ring | "At the gate: 1 of 2 keys" |
  | contested | amber diamond | "Disputed: results mismatch" |

- **Motion:** the progress grid fills in task by task. A verdict arriving gets one short,
  satisfying reveal. Respect `prefers-reduced-motion`.

## 5. Pages

### 5.1 `/`: The Gate (home)
- **Tree switcher** at the top, from `/api/trees`. Each tree is one domain (a coding agent, a
  learning algorithm). Everything below shows the selected tree. Remember the choice in the URL
  (`?tree=`) so links work.
- **Hero:** the one-line pitch, plus three numbers: changes tried, through the gate, in the
  graveyard.
- **The tree:**
  - horizontal, root on the left;
  - the gate path drawn in ember, with dead branches hanging off it in grey;
  - each node shows a short hypothesis on hover;
  - each edge is labelled with the verified effect, for example `+25.4`;
  - click a node to open its change page;
  - a toggle switches between "gate path only" and "everything".
- **Score curve:** the score at each generation along the gate path (`curve`).
- **Score vs base** (the chart judges will remember): every verified change as a dot against
  the base line. Above the line is up (ember, ▲), below is down (grey, ▼). Hovering shows the
  change, its `vsBaseBp` and its models. A small toggle shows only the gate path.
- **"At the gate right now":** pending and contested changes, each with a button to run a
  verifier.
- **CTA:** "Beat the gate →".
- **A small honest note:** "Verifiers are distinct keys, not proven distinct people."

### 5.2 `/change/[id]`: one change, the receipt page
- **Header:** the status badge, code and reason sentence. Short id with a copy button.
  Author address (shortened). Origin: human, agent or challenge, with the instruction shown
  for a challenge.
- **The claim:** the hypothesis, "False if: …", the area and motif, and the predicted effect.
- **Score vs base:** the change's score, and ▲ or ▼ with the difference from the base, shown
  large. A badge row shows the models it used, for example "primary: Gemini · secondary: Groq".
- **Claimed vs verified:** the author's own number against the verified effect, side by side.
- **Noise band chart** (the key visual):
  - a horizontal axis in points, with zero marked;
  - a shaded band from −3 to +3 points (`policy.minEffectBp`), labelled "too small to count";
  - one row per verifier, showing their effect as a dot and their 95% interval as a bar,
    coloured by their `call`;
  - one sentence underneath that explains the verdict.
- **Per-run dots:** for each verifier, the 5 parent run scores and the 5 candidate run
  scores as dots on a 0–100% axis, with the middle value marked.
- **Per-task table:** task, parent %, candidate %, difference, sortable by difference.
- **Attestations:** one card per verifier.
  - Address and label, mode, call, effect and interval.
  - Spot-check result.
  - `counted`, or the `why` if it was ignored.
  - The Stellar receipt link, once Stellar is added.
- **The diff:** a unified diff with highlighting.
- **Void changes:** instead of charts, show the guard and `mechanical.detail` in a monospace
  box. This is a lesson, not an error page.
- **Actions** (only on pending and contested changes): "Run verifier bot-1" and "Run
  verifier bot-2". Each starts a job and shows the live progress panel (§6).

### 5.3 `/graveyard`
- Every `rejected` and `void` change as an **epitaph card**:
  - the motif as the title;
  - the hypothesis in quotes;
  - how it died (code plus reason);
  - the verified effect and interval;
  - "claimed X, measured Y".
- Filter by area and by cause of death.
- The intro line: "Every idea here was tried and measured. Don't try it again unless you
  can say why this time is different."

### 5.4 `/beat-the-gate`
- A short explanation: "Type one instruction for the agent. We'll measure it for real
  against the current best version. Two verifiers re-check it. Most ideas die here."
- A textarea of up to 280 characters with a counter, plus three example chips that fill it.
- A submit button that disables while a job runs. If another job is already running,
  attach to it and show "someone else's run is in progress".
- The live progress panel (§6), then the verdict card linking to the new change page.

### 5.5 `/verifiers`
A table of keys: label, shortened address, attestations, counted, and flags (for example
"results mismatch"), with a link to the Stellar account.

### 5.6 `/how-it-works`
- Four illustrated steps:
  1. Change and claim.
  2. Measure 5 times on 16 tasks.
  3. Two other keys re-check.
  4. The gate decides, and the graveyard remembers.
- **Limits, in plain words:**
  - distinct keys are not distinct people;
  - 16 tasks are evidence, not proof;
  - recorded answers are replayed through the real tests, with live spot-checks.
- The digest in a monospace block: "This is what the next proposal reads."

## 6. The live progress panel (used by verify and Beat the gate)
- **A stepper** of stage chips that light up in order.
- **A progress bar** from `done`/`of`.
- **A task grid:** one cell per task and run. A cell fills in as its `progress` event
  arrives, shaded by `passedCases/cases`. Show parent and candidate side by side when
  verifying.
- **A log tail:** the last 5 `log` lines, in monospace and muted.
- **Attestation cards** appear as each verifier signs.
- **A verdict card** on `done`, with a link to the change. An error message on `error`.
- Closing the page must not cancel the job. Reopening the page re-attaches through
  `/api/jobs/current`.

## 7. User flows

**A. A judge opens the site.**
1. They land on `/` and see the tree with gold accepted nodes and grey graves.
2. They hover a grave and see "Rewording to sound more careful: no effect".
3. They click it and the change page explains the noise band.
4. They come back and click "Beat the gate".

**B. Beat the gate.**
1. Type an instruction, or click a chip, then submit.
2. Watch the stepper: guards, record, verify bot-1, verify bot-2.
3. The grid fills, then the verdict arrives.
4. Click through to the new change. It now also appears in the tree.

**C. A live verification on stage.**
1. Open a pending change and click "Run verifier bot-2".
2. Watch both sides replay.
3. The attestation card appears and the status flips to "Through the gate".
4. The tree on `/` updates by itself through live refresh.

**D. A remote verifier.** A teammate runs `hellgate verify` on their laptop and pushes. The
change page updates within a few seconds through live refresh, with no click needed.

## 8. Wording rules
- Say **"distinct keys"** or **"verifiers"**. Never say "independent people".
- Say **"recorded real answers, replayed through the real tests"** when showing a replay.
  Never imply a replay is a fresh model call.
- Numbers always carry a sign and a unit. Never round away a minus sign.
- No placeholder or invented data in the final build. Only the mock file during
  development.

## 9. Done checklist
- [ ] Every page renders from `web/mock/export.sample.json` with no console errors
- [ ] The score-vs-base chart shows ▲/▼ correctly, including a change that is down from the base
- [ ] The tree switcher works with both mock trees, and the use-case breakdown renders for each
- [ ] The job panel works with `web/mock/job-events.sample.json`
- [ ] Switching to the hub needs only `.env.local`; nothing else changes
- [ ] Live refresh picks up a new attestation within 5 seconds
- [ ] Phone layout is readable, and keyboard focus is visible
- [ ] `pnpm -C web build` passes, and lint is clean
- [ ] A [LOG.md](LOG.md) entry for each working session

## 10. How we work together
- Only change files in `web/` (and this file, to keep it accurate). If the data shape needs
  to change, write it in [LOG.md](LOG.md) and Kai changes the engine, PROTOCOL.md and the mocks.
- Commit small, on `main`. Run `git pull --rebase` before every push, and make sure
  `pnpm -C web build` passes first. The full rules are in [STAGES.md](STAGES.md).
- Log each session in LOG.md using the template there, and keep your row in
  [PROGRESS.md](../PROGRESS.md) current.

---

## 11. Prompt for your AI coding assistant

Paste this into your coding assistant, run from the root of the repository:

```text
You are building the web app for Hellgate, in the `web/` folder of this repository.

Read these files first, fully, before writing any code:
- docs/FRONTEND.md   (the brief: data access, pages, components, flows, visual direction, done
                      checklist, and how to set the app up)
- docs/PIPELINE.md   (what Hellgate does, so the wording on screen is correct)
- docs/PROTOCOL.md   §10.0 (several trees), §10.1 (job events), §11 and §11.1 (the export document
                      and the score against the base)
- web/mock/trees.sample.json, web/mock/export.sample.json (tree "coding-agent"),
  web/mock/export.ml.sample.json (tree "optimizer") and web/mock/job-events.sample.json
- docs/STAGES.md     ("Who owns what" and the git rules) and docs/LOG.md (append an entry at the
                      end of each session, using its template)

Build a Next.js (App Router) + TypeScript + Tailwind app in `web/`, as its own package in the
pnpm workspace (FRONTEND.md section 2 says how). Do not touch anything outside `web/` except to
append to docs/LOG.md and edit your own row in PROGRESS.md.

Requirements:
1. Server routes under /api proxy to the hub given by HELLGATE_HUB and attach the
   HELLGATE_HUB_TOKEN header for jobs (the table in FRONTEND.md section 3 lists every route). With
   HELLGATE_HUB unset they serve the mock files: /api/trees from trees.sample.json,
   /api/export?tree=coding-agent from export.sample.json, ?tree=optimizer from
   export.ml.sample.json, and /api/jobs/[id]/events replays job-events.sample.json using each
   item's delayMs.
2. Pages: /, /change/[id], /graveyard, /beat-the-gate, /verifiers, /how-it-works, exactly as
   docs/FRONTEND.md section 5 describes. Every page works for both mock trees.
3. A tree switcher at the top, driven by /api/trees, with the chosen tree kept in the URL
   (?tree=).
4. Hand-written SVG for the tree (d3-hierarchy for layout is fine), the score curve, the
   "score vs base" chart (up and down from the base, using vsBaseBp), the noise band chart, the
   per-run dots and the use-case breakdown (perGroup). No heavy chart libraries.
5. The live progress panel from docs/FRONTEND.md section 6, driven by EventSource.
6. Live refresh: poll /api/version?tree=<name> every 3 s and refetch /api/export?tree=<name>
   when it changes.
7. Never compute a verdict in the UI. Render status, code, reason and numbers exactly as given.
   Format basis points as signed points with one decimal (2544 -> "+25.4 pts").
8. Follow the visual direction in docs/FRONTEND.md section 4 and the wording rules in section 8.
   In particular: say "distinct keys", never "independent people", and call a replay "recorded
   real answers replayed through the real tests". The "optimizer" tree has no recordings, so say
   its verifiers "re-ran the training".
9. Keep components small and typed. Put data types in web/lib/types.ts, matching PROTOCOL
   section 11. Fields can be null: handle that everywhere (a void change has no score, a tree
   with no model API has models: null).

Work in small steps. After each page, run the dev server and fix every console error before
moving on. Finish with `pnpm -C web build` passing, then go through the done checklist in
docs/FRONTEND.md section 9, then log the session.
```
