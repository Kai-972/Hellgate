# The Hellgate web app: design and build prompt

For Pritam. This is a self-contained brief you can paste into your coding assistant (or work from
yourself). It says **what the product is, what the screens are, how they should look, and what data
feeds them**. For setup steps, the data-access table and the done checklist, keep
[FRONTEND.md](FRONTEND.md) open next to it. Rules of ownership are in [STAGES.md](STAGES.md): you
edit `web/` only.

The real engine is running. `git pull`, run `pnpm install` at the repository root, then `pnpm hub`:
it serves two real trees (`ml` and `code`) on `http://127.0.0.1:8787`. Reads need no token; to start jobs
run `pnpm hub:demo` (see [FRONTEND.md](FRONTEND.md) §3). Jobs are started per tree, at
`/v1/trees/<name>/jobs`. **Build against
the real hub, not only the mock.** The mock files in `web/mock/` have the same shape; the numbers
differ.

---

## 1. What Hellgate is, in one breath

AI systems get "improved" by changes (a new prompt, a new optimizer) that nobody can check. Hellgate
is a **gate**: a change gets through only when **other keys re-run it and measure a real gain**. A
change that fails is not hidden. It goes to the **graveyard**, with its numbers, so the next person
does not repeat it. The web app is the **public face of that evidence**: a tree of every change ever
tried, and for each one, who re-measured it, what they found, and why it was accepted or not.

Three ideas the UI must make obvious without a paragraph of text:

1. **Every score is re-checked.** A score from the author is a *claim*. Only scores re-measured by
   other keys count.
2. **Failures are kept.** The graveyard is a feature, not an error state.
3. **Always say up or down from where we started.** Every change shows its score against the base
   build with ▲ / ▼.

## 2. The real data (what you will actually see)

The committed demo tree is real, measured on this laptop. Use it as the truth for layout and copy:

| Change | Verdict | Score | Against base |
|---|---|---|---|
| baseline (plain SGD network) | accepted · GAIN | 63.1% | start |
| standardise features | accepted · GAIN | 84.3% | ▲ +21.1 |
| momentum | rejected · NO_EFFECT (+6.7 measured, but the interval includes zero) | 91.0% | ▲ +27.8 |
| Adam | accepted · GAIN | 91.9% | ▲ +28.7 |
| balance rare classes | rejected · NO_EFFECT | 92.8% | ▲ +29.6 |
| learning-rate nudge | rejected · NO_EFFECT | 91.7% | ▲ +28.6 |
| cosine decay | rejected · NO_EFFECT | 91.3% | ▲ +28.2 |
| drop standardisation | rejected · REGRESSION | 75.9% | ▲ +12.8 (it fell 16 points from its parent) |
| read the data generator | void · bad-import (stopped by a guard before it ran) | – | – |
| longer training | contested · RESULTS_MISMATCH (a lazy verifier signed copied numbers) | 91.4% | ▲ +28.3 |

Notice what the table teaches, because your screens must teach it too: a rejected change can still sit
above the base (**vs base** and **vs parent** are different questions: show both, label them clearly); a
`void` change has no score; a `contested` change is not a verdict yet.

All data comes from one document, `GET /api/export?tree=<name>` (proxy of the hub's
`/v1/trees/<name>/export`, shape in [PROTOCOL.md](PROTOCOL.md) §11). **Never compute a verdict, an
interval or a score in the UI.** Format what the export gives you.

## 3. Look and feel

A calm, editorial, evidence-first feel: it should read like a well-made lab notebook, not a crypto
dashboard and not a SaaS template. Think paper, ink, thin lines, one accent colour, and a lot of
whitespace. Dense information is fine; clutter is not.

**Layout vocabulary** (these are the proven patterns for this kind of product, use them):

- **A quiet top bar:** logo mark, `Trees`, `How it works`, `Graveyard`, `Verifiers`, and a repo link.
- **A hero with one sentence of promise**, and under it the **tree cards**.
- **Tree cards:** name, domain chip, a **tiny thumbnail of the tree** (nodes and curved edges, accepted
  nodes filled, rejected nodes with a ✕), the model or learner it measures, and four numbers under it:
  *Changes · Accepted · Kept failures · Best score*, with the best score's ▲ vs base.
- **Explainer rows made of small line illustrations**: a row of three cards ("the problem"), a row of three
  ("the mechanism"), and a six-step "how a change gets in" strip. Each card is a thin-bordered square
  containing a simple monoline SVG diagram, a small uppercase monospace label above, a bold one-line
  title, and one sentence below. You draw these yourself (SVG, 1.5px strokes, the palette below). Do not
  use stock illustrations.
- **The tree page is built around one big diagram** (section 5), a legend in its corner, a one-line
  **selected-change bar** under it, and a **detail panel with tabs** below that.
- **Numbers carry units and arrows**: `+21.1 ▲`, `−16.0 ▼`, `84.3%`, `0 of 2 keys`.
- Small monospace uppercase captions for labels (`PENDING · 7019f134`), serif for headings, a clean sans
  for body text.

**Our own identity** (do not copy anyone else's palette, type or illustrations):

```
:root {
  --paper:   #F6F3EE;   /* page background, warm off-white */
  --card:    #FBFAF7;   /* cards */
  --ink:     #1D1B18;   /* text */
  --muted:   #6F6A62;   /* secondary text, lines */
  --line:    #DDD7CD;   /* hairlines */
  --ember:   #D9480F;   /* brand accent: the gate, links, the selected node, primary buttons */
  --accept:  #1F6F5C;   /* accepted */
  --reject:  #B3261E;   /* rejected */
  --contest: #B7791F;   /* contested */
  --pending: #8A857C;   /* pending (hollow ring) */
  --void:    #4A5568;   /* void (hatched) */
}
```

Dark theme: invert to near-black paper (`#14130F`), keep the same semantic colours slightly lighter, and
make sure colour is **never the only signal** (every status also has a shape or a word: filled dot,
✕, hollow ring, half-filled, hatched).

Type: headings in a serif with character (try *Newsreader* or *Fraunces*), labels in *JetBrains Mono*,
body in *Inter*. Radii small (6 to 8px), borders 1px `--line`, shadows almost none. Motion: short and
purposeful (a node pulses while a job runs; a number counts into place once). Respect
`prefers-reduced-motion`. Phone width must work: the tree diagram becomes horizontally scrollable with
the selected-change panel below it.

## 4. Screens

### 4.1 Home (`/`)
Hero headline (our own words, e.g. *"Proof for changes to AI systems. Every score is re-checked by other
keys."*) with one supporting sentence. Tree cards (one per tree from `GET /api/trees`, thumbnail drawn
from that tree's export). Then the explainer rows: **The problem** (nobody measures, failures stay
private, nobody can check you), **The mechanism** (variation → inheritance → selection), **How a change
gets in** (six steps: read the tree · change one thing · run the test · send it in, you cannot check
your own · two other keys re-run it · the gate decides). Footer: honest one-liner on what Hellgate does
not prove (section 7).

### 4.2 Tree page (`/tree/[name]`)
1. **Header:** tree name, domain chip, "12 tasks · 2,400 cases · 4 use cases · 5 runs per side", and
   policy chips (`2 keys needed`, `+3.0 points minimum`, `95% interval`).
2. **The tree diagram** (section 5).
3. **Score vs base chart:** a stepped line along the **gate path** (`export.curve`), the base as a dashed
   baseline at 0, each accepted change a labelled point (`standardise +21.1 ▲`), and a big pill at the
   right end: `91.9% · ▲ 28.7 vs base`. Rejected changes appear as faint ✕ markers at their score so
   you can see what *would* have looked like progress.
4. **Use-case breakdown:** a small table or heat strip of the four use cases (rows) against the accepted
   changes (columns), cell = score change in points, coloured and signed. This is the "where did it
   help" view: standardise lights up *badly scaled features*, Adam lights up *imbalanced classes*.
5. **Selected-change bar + detail panel** (section 4.3 content in tabs).

### 4.3 Change page / detail panel (`/tree/[name]/change/[id]`)
Tabs: **Claim · Evidence · Diff · Verifiers · How to check it**.

- **Verdict banner:** status word, code, the engine's `reason` verbatim, `keys counted: 2 of 2 needed`.
  Statuses: `accepted`, `rejected`, `pending`, `contested`, `void`.
- **Claim:** hypothesis, falsified-if, area, motif, predicted effect; author address (shortened with a
  copy button); a clear line **"The author measured +X. This is a claim, not evidence."**
- **Evidence (the heart of the product):**
  - for each counted verifier a **noise-band gauge**: a horizontal axis in points, a zero line, a
    dashed `+3.0` minimum line, a thick bar for the 95% interval and a dot for the effect. A gain is
    when the **whole bar is right of zero** and the dot is past the dashed line. Momentum above shows
    why `+6.7` was still `NO_EFFECT`: the bar crosses zero. Make that visible.
  - **parent → candidate** bars per use case, then per task (collapsible), with ▲ ▼ per row;
  - run-by-run scores of both builds (5 small dots each, so run-to-run noise is visible);
  - **"Do their numbers match?"** an indicator showing each verifier's results digest; identical
    digests get a ✓, a mismatch gets the amber `RESULTS_MISMATCH` treatment.
- **Diff:** the unified diff from `diff`, monospace, additions green-tinted, removals red-tinted, file
  headings, line numbers, collapsible hunks. It is the change, so give it room.
- **Verifiers:** each attestation: shortened address, `counted` or the reason it was ignored (`self`,
  `equivocation`, `duplicate`, `mismatch`, `runs`, `not-allowed`), call, effect, interval, mode.
- **How to check it:** copy-able commands (`hellgate verify <id>`, `hellgate check <id>`) and the
  attestation's results digest. The product's promise is that anyone can re-run this.

### 4.4 Graveyard (`/graveyard`, with a tree switcher)
Every `rejected` and `void` change as a list or card grid: motif, area, code, effect with ▲/▼ and its
interval, the one-line reason, who proposed it. Filters by area, code and tree. A `void` card shows the
guard that stopped it and the verbatim tool output (for example the forbidden import), in monospace.
Header line: *"N ideas tried and kept so nobody repeats them."* An empty graveyard is an empty state with
a friendly sentence.

### 4.5 Verifiers (`/verifiers`)
A table from `export.verifiers`: shortened address (copy), attestations, counted, flags
(`equivocation`, `self`), an account link. Above it, one honest sentence: *"Distinct keys, not proof
of distinct people."*

### 4.6 Live panel (on any pending or contested change)
A button **"Re-measure as a verifier"** that `POST /api/jobs` (`{kind:"verify", change, as:"bot-1"}`) and
follows `GET /api/jobs/<id>/events` (server-sent events). Show: a stage stepper
(`verify → sign`), a progress bar from `progress.done / progress.of`, a live grid with one cell per
task run coloured by `passedCases / cases`, then the new attestation arriving and the node in the tree
**changing state in place** when the `change` event arrives. On `409` show "another job is running";
on `401` the button is hidden. A late visitor is replayed the whole stream, so render from event zero.

### 4.7 Beat the gate (`/beat-the-gate`)
"Type one instruction and watch it measured live." It runs on the `code` tree (`pnpm hub` serves it as
the second tree). The form posts `{ "kind": "challenge", "instruction": "...", "parent": null }` to
`/v1/trees/code/jobs` through your server (the hub token never reaches the browser), then reads the same event
stream as 4.6. Facts to design for:
- the instruction is 8 to 280 characters; show the counter and the hub's `400` message if it refuses;
- the stages are `build → record → verify → sign → verify → sign`; the grid fills three times (the
  author's recording, then each of two verifiers), and the live recording takes minutes, so keep the
  user company: show the grid and the log tail, and let them close the page and come back
  (`/v1/jobs/current`);
- `501` means the hub has no keys for it: hide the form and say "not available on this server";
  `409` means someone else's job is running: show it and offer to watch it;
- the result is usually a **rejection**, and that is the point: show the numbers and the graveyard link.
  A repeated instruction ends at once with `result.repeated = true`: say "already measured";
- offer 3 or 4 example chips, and let the visitor choose the parent from the tree (default: the tip).

### 4.8 How it works / Limits (`/how-it-works`)
The six steps with diagrams, a glossary (key, change, build, suite, task, case, verdict, interval,
digest), and the **honest limits** from [ARCHITECTURE.md](ARCHITECTURE.md) §15: keys are not people;
the author's own score is a claim; what a pass means is "re-measured by distinct keys on this suite",
not "good in the real world".

## 5. The tree diagram (build this carefully)

An SVG, rendered from `changes[]` (`id`, `parent`, `depth`, `status`, `code`, `effectBp`, `scoreBp`,
`vsBaseBp`, `claim.area`, `claim.motif`).

- **Layout:** left to right. `x = depth`. `y` = leaf order from a depth-first walk, with children of a
  node grouped together and the **gate path on a single straight row** so the winning line reads at a
  glance. Curved cubic edges. Give it enough horizontal room and make it scroll and zoom.
- **Nodes:** accepted = filled `--accept`; rejected = ring with a `--reject` ✕; pending = hollow
  `--pending` ring; contested = half-filled `--contest`; void = hatched `--void`. The **gate path** nodes
  are larger. The selected node gets an `--ember` ring.
- **Node labels:** `area/motif` (monospace caption), the first words of the hypothesis, and
  `84.3% · ▲ 21.1`. **Edge labels:** the effect against the parent (`+21.1`), small pill on the curve.
  Rejected edges are dashed.
- **Interaction:** hover shows a tooltip card (code, reason, keys counted, effect with interval);
  click selects and fills the bar and panel below; arrow keys move between parent, child and siblings;
  the URL carries the selected id (`?c=<id>`) so a link opens that change.
- **Legend** in the top-right corner: the five statuses and a line for "gate path".
- **Live:** while a job runs for a change, its node pulses; when the verdict arrives it changes state
  with a short transition.
- **Thumbnail:** the same layout drawn tiny (no labels) for the home cards.

## 6. Technical shape

Follow FRONTEND.md section 2 for setup (Next.js App Router, TypeScript, Tailwind, one pnpm workspace,
no second lockfile). Data access goes **only** through your server routes (`/api/trees`, `/api/export`,
`/api/version`, `/api/jobs…`); the hub token never reaches the browser. Poll `/api/version?tree=` every
few seconds and refetch the export only when it changes. Handle `null` fields everywhere (PROTOCOL §11.1).
Suggested structure: `web/lib/hub.ts` (typed client), `web/lib/format.ts` (`points`, `pct`, `arrow`,
`shortAddr`), `web/components/TreeGraph.tsx`, `ScoreCurve.tsx`, `NoiseBand.tsx`, `UseCaseGrid.tsx`,
`DiffView.tsx`, `LiveJob.tsx`, `StatusBadge.tsx`. Write types once from the export shape.

## 7. Wording rules (these protect the project)

- Say **"distinct keys"** or **"verifier keys"**, never "independent people" or "N people verified".
- Say **"re-measured"**, not "proved". A pass means evidence under stated conditions.
- The author's number is **"claimed"**; a verifier's is **"measured"**.
- Always show **vs base** with ▲ / ▼, and label **vs parent** separately when both appear.
- Never invent data. If a field is `null`, show a dash and, where useful, why (`no counted attestation yet`).
- No mention of any other product, repo or project anywhere in the UI, the code, the comments or the
  commits.

## 8. Order of work

1. App shell, tokens, top bar, data client against the real hub (an afternoon).
2. Tree page with the diagram and the selected-change panel, the part judges will stare at.
3. Change page: verdict banner, noise-band gauge, use-case bars, diff view.
4. Home with tree cards and thumbnails; Graveyard; Verifiers.
5. Live panel with the event stream.
6. Explainer illustrations, How it works, dark theme, mobile pass, polish.
7. `pnpm -C web build` passes and lint is clean before every push. Log each session in
   [LOG.md](LOG.md) and keep your row in [../PROGRESS.md](../PROGRESS.md) current.

**Definition of done for the demo:** a stranger can open the tree page, understand in ten seconds which
changes were kept and which were thrown away, click the Adam change and see why it was accepted
(two distinct keys, interval clear of zero), click momentum and see why a bigger number was still
rejected, click the blocked cheat and read the guard's message, and press "Re-measure as a verifier" on
a pending change and watch the tree change in front of them.
