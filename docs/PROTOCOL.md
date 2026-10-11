# Hellgate protocol

This is the contract every implementation follows: what is hashed, what is signed, how a
score is computed and how a verdict is decided. If the code and this document disagree,
the code has a bug. For the reasoning behind each rule, see [ARCHITECTURE.md](ARCHITECTURE.md).

Notation:
- `Hex64` is 64 lowercase hexadecimal characters.
- `Addr` is a Stellar public key in StrKey form (`G…`, 56 characters).
- All numbers are integers.
- `bp` = basis points, where 10000 bp = 100%.

---

## 1. Canonical JSON

`canonical(v)` encodes a value to UTF-8 bytes:

1. Objects: keys sorted by Unicode code point, then encoded as `{"k":v,...}` with no
   whitespace.
2. Arrays: `[v,...]` in their given order.
3. Strings: JSON string escaping as produced by `JSON.stringify`.
4. Numbers: **safe integers only**. A float, `NaN`, `Infinity` or `-0` throws.
5. `true`, `false` and `null` are allowed. `undefined` throws, and so does an object key
   whose value is `undefined`.

There is exactly one implementation (`engine/src/core/canonical.ts`).

## 2. Ids

```
id(body) = lowercase hex( sha256( canonical(body) ) )
```

Every record is identified by the id of its `body`. The signature is not part of the
body, so it never affects the id.

## 3. Signatures

```
message   = utf8("hellgate/v1/" + body.type + "\n") || canonical(body)
signature = ed25519_sign(secret, message)          // 64 bytes, lowercase hex
```

The signer is `body.signer` (`Addr`). A verifier decodes the StrKey to the raw 32-byte
ed25519 public key and checks the signature. Because the record type is part of the
signed message, a signature cannot cross record types.

## 4. Record envelope and storage

Signed records:

```json
{ "body": { "type": "change", "...": "..." }, "sig": "<128 hex>" }
```

Unsigned objects (`build`, `recording`, `receipt`): `{ "body": { ... } }`.

Storage: `.hellgate/records/<id[0:2]>/<id[2:]>.json`, written as the canonical JSON of the envelope
plus a newline, so two machines write identical bytes for the same record. Files are written to a
temporary name and renamed, and an id that already exists is never overwritten.

The **empty build** is part of every ledger without being stored: asking for it always succeeds.

A reader accepts a file only when all of the following hold:
1. The body matches its schema.
2. `id(body)` equals the file name.
3. For signed types, `sig` verifies against `body.signer`.

Rejected files are reported and ignored. A report names the file and the stage that failed:
`json`, `shape`, `schema`, `id` or `signature`.

**Reference checks.** Before a record is trusted, the records it points at must be held and must agree
with it:
- a `change`: its build, its parent build and its recording exist; the recording is for the same
  build and suite; a non-genesis parent is a change whose build is this change's `parentBuild`, on
  the same suite and tree;
- an `attestation`: its change exists, and the build, parent build, suite and tree all match it;
- a `recording`: its build exists;
- a `receipt`: its record is a change or an attestation that exists.

## 5. Record types

### 5.1 `build`

```json
{ "type": "build", "v": 1, "files": { "agent/index.ts": "<contents>", "...": "..." } }
```

- Every path is `agent/<name>.ts` or `learner/<name>.ts`: flat, lowercase letters, digits, `_` and
  `-`, with a `.ts` extension. A build uses exactly one of the two directories, at most 24 files
  and 40,000 characters per file. Contents are UTF-8 with `\n` line endings, non-empty, and end
  with a newline.
- The **empty build** (`files: {}`) is the parent of the genesis change. It must score 0
  on every case; this is the sandbox canary.

### 5.2 `suite`: computed, not stored

```
suite id = id({ "type": "suite", "v": 1,
                "tasks": [ { "id": <task id>, "files": { <relative path>: <contents> } } ] })
```

Tasks are sorted by `id`, and `files` covers every file in the task directory, including
`cases.mjs` or `data.mjs`. Dotfiles are skipped and symbolic links are refused. Contents are hashed
with line endings normalised to `\n`, so a checkout with `\r\n` has the same suite id. A task
folder that is incomplete or invalid is an error, never a smaller suite. The sealed suite's commitment uses the same formula.

### 5.3 `recording`

```json
{ "type": "recording", "v": 1,
  "build": "Hex64", "suite": "Hex64", "runs": 5,
  "models": { "primary": "gemini:gemini-3.1-flash-lite", "secondary": "groq:<model>" },
  "entries": [ { "key": "Hex64", "slot": "primary|secondary",
                 "response": { "text": "...", "finish": "stop|length|other",
                               "inputTokens": 0, "outputTokens": 0 } } ] }
```

- `entries` is sorted by `key`, and each key appears once.
- `slot` is informational (for display). It is not part of the key.
- `key = id({ "type": "request", "provider", "model", "system", "messages",
  "maxOutputTokens", "temperature100", "stop", "seed" })`, where `provider` and `model` are
  the slot resolved through `models` (`"gemini:gemini-3.1-flash-lite"` gives provider
  `gemini` and model `gemini-3.1-flash-lite`), and:
  - `temperature100` is the temperature × 100, rounded to an integer;
  - absent fields are encoded as `null`;
  - `messages` is `[{ "role": "user"|"assistant", "text": "..." }]`.

### 5.4 `change` (signed by the author)

```json
{ "type": "change", "v": 1,
  "tree": "string", "parent": "Hex64 | \"genesis\"",
  "build": "Hex64", "parentBuild": "Hex64", "suite": "Hex64",
  "claim": { "hypothesis": "30..600 chars", "falsifiedIf": "15..400 chars",
             "area": "a string from the domain's list (§13.3)",
             "motif": "kebab-case, ≤ 40 chars", "predictedEffectBp": "non-zero int",
             "contradicts": [ { "change": "Hex64", "why": "≤ 300 chars" } ],
             "whyThisTime": "string | null" },
  "origin": { "by": "human|agent|challenge", "model": "string | null", "promptHash": "Hex64 | null",
              "instruction": "string | null" },
  "mechanical": { "status": "ok|bad-path|too-large|frozen-file|bad-signature|bad-import|graveyard-rule|unfalsifiable|typecheck|crash",
                  "detail": "≤ 4000 chars, verbatim tool output" },
  "recording": "Hex64 | null",
  "claimed": { "runs": 5, "effectBp": 0, "resultsDigest": "Hex64" },
  "signer": "Addr", "createdAt": "ISO-8601 UTC" }
```

- `mechanical.status != "ok"` ⇒ `recording` and `claimed` are `null`, and the verdict is
  `void`.
- `origin.by = "challenge"` marks a change made with Beat the gate. `instruction` holds the
  visitor's text, at most 280 characters. For every other origin it is `null`.
- `claimed` is the author's own measurement. It is displayed and compared (§9 step 5),
  but **never counted** as evidence for acceptance.

### 5.5 `attestation` (signed by a verifier)

```json
{ "type": "attestation", "v": 1,
  "tree": "string", "change": "Hex64",
  "parentBuild": "Hex64", "build": "Hex64", "suite": "Hex64",
  "mode": "replay|live", "runs": 5,
  "parent":    { "runScoresBp": [0, 0, 0, 0, 0], "taskMeansBp": { "<task id>": 0 } },
  "candidate": { "runScoresBp": [0, 0, 0, 0, 0], "taskMeansBp": { "<task id>": 0 } },
  "effectBp": 0, "ciLowBp": 0, "ciHighBp": 0, "call": "gain|loss|noise",
  "resultsDigest": "Hex64", "clean": true, "notes": [ "string" ],
  "spotCheck": { "tasks": [ "<task id>" ], "recordedBp": 0, "liveBp": 0, "ok": true },
  "sealed": { "suite": "Hex64", "runs": 3, "effectBp": 0, "ciLowBp": 0, "ciHighBp": 0,
              "call": "gain|loss|noise" },
  "env": { "model": "string", "engine": "string", "node": "string", "platform": "string" },
  "signer": "Addr", "createdAt": "ISO-8601 UTC" }
```

- `spotCheck` is `null` in `live` mode, where everything was already live.
- `sealed` is `null` when the tree has no sealed suite. The sealed suite is a later stage;
  until then it is always `null`.
- `clean` is `false` if any run in the batch was tampered with or discarded, or if a
  replay request was missing from the recording.

### 5.6 `receipt` (unsigned. The Stellar transaction carries the signature.)

```json
{ "type": "receipt", "v": 1, "record": "Hex64", "network": "testnet|public",
  "tx": "Hex64", "ledger": 0, "closedAt": "ISO-8601 UTC", "account": "Addr" }
```

A receipt is valid when Horizon returns transaction `tx` with:
- `successful = true`;
- `memo_type = hash`;
- `memo` decoding to the bytes of `record`;
- `source_account` equal to the record's `signer`.

## 6. Seeds and order

```
seed_hex(i)   = hex(sha256(utf8("hellgate/seed/1|" + suiteId + "|" + i)))
seed(i)       = int(seed_hex(i)[0:8], 16) mod 2^31        // sent to the model as `seed`
order(i)      = Fisher–Yates over the sorted task ids; the swap index at step k is
                int(hex(sha256("hellgate/order/1|" + seed_hex(i) + "|" + k))[0:12], 16) mod (k+1)
```

Both sides of an attestation use runs `0 … R−1`.

## 7. Scoring

A **case** is the smallest scored unit: one test case of a task in the `code` domain, or one
held-out test point in the `ml` domain (§13.2). For a task `t` with `n_t` cases, in run `i`:

```
score(t, i)  = floor( passed(t, i) × 10000 / n_t )                 // bp
runScore(i)  = half_up_mean over t of score(t, i)
taskMean(t)  = half_up_mean over i of score(t, i)
d(t)         = taskMean_candidate(t) − taskMean_parent(t)
effect       = half_up_mean over t of d(t)

half_up_mean(xs) = floor( (2 × Σxs + |xs|) / (2 × |xs|) )
```

`floor` rounds toward −∞.

A task the agent fails to produce (crash, empty file, wrong file name or budget
exceeded) scores 0 for that run. An infrastructure failure (HTTP 429 or 5xx after
retries, or a spawn failure) is **not** a score: the run is discarded and repeated, and
the batch is unclean only if it cannot complete.

## 8. Confidence interval and call

```
B      = policy.bootstrap                     // 2000
T      = sorted task ids, |T| = m
s0     = hex(sha256(canonical({ "change": changeId, "signer": signer,
                                 "suite": suiteId, "d": [d(t) for t in T] })))
for b in 0..B−1:
  pick_j = int(hex(sha256("hellgate/boot/1|" + s0 + "|" + b + "|" + j))[0:8], 16) mod m,  j = 0..m−1
  stat_b = half_up_mean over j of d(T[pick_j])
sort stat ascending
ciLow  = stat[ floor(0.025 × B) ]             // stat[50]   when B = 2000
ciHigh = stat[ ceil(0.975 × B) − 1 ]          // stat[1949] when B = 2000

call = "gain"  if ciLow  > 0 and effect ≥  policy.minEffectBp
       "loss"  if ciHigh < 0 and effect ≤ −policy.minEffectBp
       "noise" otherwise
```

The sealed block applies the same procedure to the sealed suite's `d(t)`.

**Results digest:**

```
resultsDigest = id({ "type": "results",
                     "parent":    [ [ [ case outcomes as 0/1 in case order ] per task in sorted order ] per run ],
                     "candidate": [ ...same shape... ] })
```

**Spot-check:**
1. The verifier takes `k = policy.spotCheckTasks` tasks. The sample is the first `k`
   task ids sorted by `sha256(signer + "|" + changeId + "|" + taskId)`.
2. It runs the candidate build live on run 0 for those tasks.
3. `recordedBp` and `liveBp` are the half-up means of the per-task scores from the
   recording and from the live run.
4. `ok = recordedBp − liveBp ≤ policy.spotCheckToleranceBp`.

## 9. The verdict: `decide(change, attestations, policy, context)`

This is a pure function. `context` carries the tree's `domain` and, if it has one, its sealed
commitment. Steps run in order, and the first one that returns wins.

1. **Void.** `change.mechanical.status != "ok"` → `void`, with the mechanical status as
   the code.
2. **Filter.** Keep an attestation only if:
   - `signer ≠ change.signer` (otherwise: ignored as `self`);
   - `change`, `parentBuild`, `build` and `suite` match the change (otherwise: `mismatch`);
   - `runs ≥ 3` and `runs` is odd (otherwise: `runs`);
   - the allow-list is empty or contains the signer (otherwise: `not-allowed`);
   - `sealed` is null or its suite equals the tree's sealed commitment (otherwise:
     `sealed-mismatch`).
3. **Equivocation.** Group the kept attestations by signer.
   - If a signer has several attestations with the **same** `call`, keep the one with
     the lowest `effectBp` (ties go to the lower id); the rest are ignored as `duplicate`.
   - If their calls **differ**, drop all of that signer's attestations as
     `equivocation`.

   The survivors are the **counted** set, with one per key.
4. **Unclean.** If any counted attestation has `clean = false` → `rejected`
   `NOT_CLEAN`.
5. **Reproducibility.** A counted attestation is *comparable* when its mode is `replay`, or when
   the tree's domain is `ml`. (An `ml` verifier re-runs the training for real and training is
   deterministic, so its digest must match. A `live` run against a model is not reproducible digest
   for digest.)
   - If comparable attestations disagree on `resultsDigest` → `contested`
     `RESULTS_MISMATCH`.
   - If at least `minVerifiers` comparable attestations share a digest that differs
     from `change.claimed.resultsDigest` → `rejected` `UNREPRODUCIBLE`.
   - If at least 2 counted attestations have `spotCheck.ok = false` → `rejected`
     `UNREPRODUCIBLE`.
   - If exactly 1 has `spotCheck.ok = false` → `contested` `SPOT_CHECK_FAILED`.
6. **Quorum.** If fewer than `policy.minVerifiers` are counted → `pending`
   `NEEDS_VERIFIERS`.
7. **Conflict.** If some call is `gain` and some is `loss` → `contested` `CONFLICT`.
8. **Spread.** If `max(effectBp) − min(effectBp) > policy.maxVerifierSpanBp` → `pending`
   `VERIFIERS_DISAGREE` (another verifier is needed).
9. **Gain.** If every call is `gain`:
   - if any counted `sealed.call` is `loss` → `rejected` `OVERFIT`;
   - otherwise → `accepted` `GAIN`.
10. **Loss.** If every call is `loss` → `rejected` `REGRESSION`.
11. **Otherwise** → `rejected` `NO_EFFECT`.

Reported numbers:
- For `GAIN`: the minimum `effectBp`, the minimum `ciLowBp` and the minimum `ciHighBp`.
- For `REGRESSION`: the maximum of each.
- For everything else: the median of the counted `effectBp` values (the lower middle
  value when the count is even).

The verdict returns:

```
{ status, code, reason (plain English), effectBp, ciLowBp, ciHighBp,
  counted: [Addr], ignored: [{ signer, attestation, why }] }
```

## 10. Hub API

| Method and path | Request | Response |
|---|---|---|
| `GET /v1/records?after=<Hex64>&limit=<≤1000>` | | `{ "ids": [Hex64], "next": Hex64 \| null }` sorted ascending |
| `GET /v1/records/<id>` | | The record file |
| `POST /v1/records` | The record file | `201` stored, `200` already present, `400` with a reason when invalid |
| `GET /v1/export` | | `hellgate/export/1` |
| `GET /v1/version` | | `{ "version": Hex64 }` (a hash of the sorted id list) |

The hub validates every posted record as in §4. Change and attestation records must also
reference records the hub already holds (builds, recordings and changes). The size limit
is 8 MB per record.

### 10.0 Several trees

A hub can serve several trees at once (`hellgate serve --root trees/code --root trees/ml`).
Every route above also exists under a tree prefix, and the plain routes serve the first tree.

| Method and path | Response |
|---|---|
| `GET /v1/trees` | `[ { "name": "coding-agent", "domain": "code", "totals": { ... } }, ... ]` |
| `GET /v1/trees/<name>/export` | `hellgate/export/1` for that tree |
| `GET /v1/trees/<name>/version` | `{ "version": Hex64 }` |
| `GET/POST /v1/trees/<name>/records…` | as above |
| `POST /v1/trees/<name>/jobs`, `GET /v1/trees/<name>/jobs/<id>/events` | as in §10.1 |

A job runs against one tree. Only one job runs at a time across all trees.

A record posted to a tree's hub must belong to it: a `change` or `attestation` for another tree name or
another suite is refused with `403`, and one that does not check out (bad signature, hash, or a
reference the hub does not hold) with `400` and the reason. Reads send `Access-Control-Allow-Origin: *`;
the job routes need the token. A job event stream is replayed from its first event to a client that
connects late.

### 10.1 Jobs

Jobs spend model calls, so they need the header `Authorization: Bearer <HELLGATE_HUB_TOKEN>`.
Only the web app's server holds the token. Jobs run one at a time; a second request while
one is running gets `409` with the running job's id.

| Method and path | Request | Response |
|---|---|---|
| `POST /v1/jobs` | `{ "kind": "verify", "change": Hex64, "as": "bot-1" \| "bot-2" }` | `202 { "job": "<id>" }` |
| `POST /v1/jobs` | `{ "kind": "challenge", "instruction": "≤ 280 chars", "parent": Hex64 \| null }` | `202 { "job": "<id>" }` |
| `GET /v1/jobs/<id>` | | `{ "job", "kind", "state": "queued\|running\|done\|failed", "result": {...} \| null, "error": string \| null }` |
| `GET /v1/jobs/<id>/events` | | `text/event-stream` (below) |
| `GET /v1/jobs/current` | | the running job, or `204` |
| `GET /v1/trees/<name>/pipeline` | | both environments: production, non-production, the gap, the flags, the gate path with scores, the production history |
| `POST /v1/jobs` | `{ "kind": "promote", "change"?: Hex64, "approval"?: { "by": "name", "note"?: string } }` (on `/v1/trees/<name>/jobs`) | `202 { "job": "<id>" }`; stages `bots, gate, consistency, human, promote, benchmark`; a flagged change ends `needs-human` until it is posted again with an `approval` |
| `POST /v1/trees/<name>/production` | `{ "action": "reset" }` (hub token) | production back to the baseline (a demo helper) |
| `GET /v1/trees/<name>/production` | | the release: the tip of the gate path with its build files, score and verifier keys (`404` while nothing has passed) |

- `as` names one of the hub's demo verifier keys, configured with
  `HELLGATE_BOT_1_SECRET` and `HELLGATE_BOT_2_SECRET`. A bot never verifies a change it
  authored. `HELLGATE_CHALLENGER_SECRET` is a third, separate key that authors Beat the gate changes.
- A `challenge` job (code trees only; an `ml` tree answers `501`):
  1. checks `instruction`: 8 to 280 characters after whitespace is collapsed, no control characters
     (`400` otherwise);
  2. builds the change on `parent` (default: the tip of the gate path) by appending `instruction` to the
     agent's `RULES` list as one JSON-quoted string, and nothing else;
  3. signs it with the hub's author key (`HELLGATE_CHALLENGER_SECRET`), with `origin.by = "challenge"`,
     runs the usual guards, and records a live run (the parent is replayed from its own recording);
  4. then runs `verify` as `bot-1` and as `bot-2`, by replay.
  The hub answers `501` if the author key or the two verifier keys are not configured. An instruction
  that was already measured on the same parent is answered from the ledger: the job ends at once with
  `"repeated": true` in its result and spends no model call.
  The stages of a challenge are `build`, `record` (`as: "author"`), `verify` and `sign` (once per bot).
  `progress` events run three times over (the author's two sides, then each bot's), and `done` carries the
  verdict of the new change; a change a guard stopped ends with status `void` and the reason.

**Event stream.** Each event is `event: <type>` followed by `data: <JSON>`:

| Event type | Data |
|---|---|
| `stage` | `{ "stage": "build\|record\|verify\|sign", "as": string \| null }` |
| `progress` | `{ "side": "parent\|candidate", "run": 0, "runs": 5, "task": "id", "done": 12, "of": 80, "passedCases": 7, "cases": 10 }` |
| `attestation` | `{ "id": Hex64, "signer": Addr, "call": "gain\|loss\|noise", "effectBp": 0, "ciLowBp": 0, "ciHighBp": 0 }` |
| `change` | `{ "id": Hex64, "status": "...", "code": "..." }` (also sent at the end of a challenge) |
| `log` | `{ "line": "plain text" }` |
| `done` | `{ "result": { "change": Hex64, "status": "...", "code": "...", "reason": "..." } }` |
| `error` | `{ "message": "plain text" }` |

## 11. Export document `hellgate/export/1`

This is the only input of the web app. It is display output, so it is never hashed.

```json
{
  "protocol": "hellgate/export/1",
  "tree": "string",
  "domain": "code|ml",
  "suite": { "id": "Hex64", "tasks": 16, "cases": 160,
             "groups": [ { "id": "nonlinear-classification", "name": "Nonlinear classification", "tasks": ["moons", "spirals"] } ] },
  "sealed": null,
  "models": { "primary": "provider:model", "secondary": "provider:model", "proposer": "provider:model" },
  "base": { "change": "Hex64", "scoreBp": 0 },
  "policy": { "...": "..." },
  "totals": { "changes": 0, "accepted": 0, "rejected": 0, "pending": 0,
              "contested": 0, "void": 0 },
  "gatePath": [ "Hex64" ],
  "curve": [ { "change": "Hex64", "depth": 1, "scoreBp": 0, "vsBaseBp": 0 } ],
  "changes": [ {
    "id": "Hex64", "parent": "Hex64|genesis", "depth": 0,
    "status": "accepted|rejected|pending|contested|void", "code": "GAIN|...",
    "reason": "string", "effectBp": 0, "ciLowBp": 0, "ciHighBp": 0,
    "scoreBp": 0, "vsBaseBp": 0, "slots": ["primary", "secondary"],
    "claim": { "...": "as in §5.4" }, "origin": { "...": "..." },
    "mechanical": { "...": "..." }, "claimed": { "...": "..." },
    "author": "Addr", "createdAt": "ISO-8601",
    "diff": "unified diff against the parent build",
    "perTask": [ { "task": "id", "group": "string", "parentBp": 0, "candidateBp": 0 } ],
    "perGroup": [ { "group": "id", "parentBp": 0, "candidateBp": 0 } ],
    "attestations": [ {
      "id": "Hex64", "signer": "Addr", "counted": true, "why": "string|null",
      "mode": "replay|live", "call": "gain|loss|noise",
      "effectBp": 0, "ciLowBp": 0, "ciHighBp": 0,
      "parentRunsBp": [0], "candidateRunsBp": [0],
      "spotCheck": { "...": "..." }, "sealed": { "...": "..." },
      "receipt": { "tx": "Hex64", "url": "https://stellar.expert/explorer/testnet/tx/<tx>" }
    } ],
    "receipt": { "tx": "Hex64", "url": "..." },
    "tokens": { "candidateMedian": 0, "parentMedian": 0 }
  } ],
  "verifiers": [ { "address": "Addr", "attestations": 0, "counted": 0,
                   "flags": [ "equivocation" ],
                   "account": "https://stellar.expert/explorer/testnet/account/<Addr>" } ],
  "digest": "string"
}
```

### 11.1 Score against the base

- Fields that depend on evidence can be `null`: `base` is `null` for a tree with no genesis change;
  `base.scoreBp` is `null` until the genesis change has a counted attestation; a change's `effectBp`,
  `ciLowBp`, `ciHighBp` are `null` when nothing is counted, and its `scoreBp` and `vsBaseBp` are `null`
  for a `void` change or one with no counted attestation. `perTask` and `perGroup` are `[]` then.
- A verifier's `label` is its address shortened (`GAWQ…TKTC`); the engine knows no names.

- `base` is the change that every `vsBaseBp` is measured from. It is the genesis change unless
  the tree's config names another.
- `scoreBp` of a change is the mean of its task means, averaged over the **counted**
  attestations. It is `null` for `void` changes and for changes with no counted attestation.
- `vsBaseBp = scoreBp − base.scoreBp`. Positive means up from the base, negative means down.
  It is `null` whenever `scoreBp` is `null`.
- `models` is `null` for a domain with no model API (`ml`), and `slots` is then `[]`.
- `slots` lists the model slots the change's recording used. It is derived from the
  recording's entries, so a two-model orchestration shows both.
- `curve` is the score along the gate path, one point per accepted change, with the same two
  numbers.

## 12. Build contracts (frozen)

A build's contract file is part of every build, byte for byte. A change that touches it is
stopped by the guards. Which contract applies depends on the tree's `domain`.

### 12.1 `code`: `agent/contract.ts`

```ts
export interface TaskBrief {
  readonly id: string;
  readonly title: string;
  readonly brief: string;                                   // brief.md, verbatim
  readonly entry: string;                                   // the file the tests import, e.g. "solution.mjs"
  readonly api: readonly { name: string; signature: string }[];
  readonly constraints: readonly string[];
  readonly starter: readonly { path: string; contents: string }[];
}

export interface ModelRequest {
  readonly tag: string;                                     // a distinct label per call site: "draft", "repair#1"
  readonly slot?: 'primary' | 'secondary';                 // which model answers. Default "primary".
  readonly system?: string;
  readonly messages: readonly { role: 'user' | 'assistant'; text: string }[];
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  readonly stop?: readonly string[];
}

export interface ModelReply {
  readonly text: string;
  readonly finish: 'stop' | 'length' | 'other';
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface Kit {
  readonly model: { generate(req: ModelRequest): Promise<ModelReply> };
  readonly budget: { remaining(): { calls: number; tokens: number; ms: number } };
  readonly trace: (event: string, data?: Record<string, unknown>) => void;
  readonly random: () => number;                            // seeded per run
}

export interface Answer {
  readonly files: readonly { path: string; contents: string }[];
}

// agent/index.ts must export exactly this signature:
// export async function solve(task: TaskBrief, kit: Kit): Promise<Answer>
```

- The agent keeps the instructions it sends to the model in `agent/instructions.ts`, as
  `export const RULES: string[] = [ ... ]`. Beat the gate appends one JSON-quoted string to
  that array and changes nothing else, so a visitor's text can never become code.
- The `seed` is added by the parent; the agent cannot set it.
- `tag` is not part of the request key, so renaming a call site does not invalidate a
  recording.
- Agent files use erasable TypeScript only (no enums or namespaces), so they run under
  Node's built-in type stripping with no build step.

### 12.2 `ml`: `learner/contract.ts`

```ts
export interface MlTask {
  readonly id: string;
  readonly title: string;
  readonly kind: 'classification' | 'regression';
  readonly features: number;
  readonly classes?: number;                       // classification: labels are integers 0 … classes−1
  readonly tolerance?: number;                     // regression: how close a prediction must be
  readonly train: { readonly x: number[][]; readonly y: number[] };
  readonly testX: number[][];                      // test INPUTS only. The labels never leave the parent.
  readonly budgetMs: number;                       // CPU-time budget for this task, in milliseconds
}

export interface MlKit {
  readonly random: () => number;                   // seeded per run. Math.random is replaced by it.
  readonly trace: (event: string, data?: Record<string, unknown>) => void;
  readonly elapsedMs: () => number;
}

export interface Predictions { readonly y: readonly number[]; }   // exactly one per test row, all finite

// learner/index.ts must export exactly this signature:
// export async function fit(task: MlTask, kit: MlKit): Promise<Predictions>
```

- The learner uses only erasable TypeScript and relative sibling imports. It reads only its own
  folder, has no network and starts no processes.
- The genesis learner is a small neural network trained with plain SGD. Optimizer, model,
  preprocessing and schedule live in separate files (`optim.ts`, `model.ts`, `prep.ts`,
  `schedule.ts`) so that one idea is one small diff.

## 13. Task format

### 13.1 `code` tasks

`suites/code/public/<task-id>/` (a later stage adds a sealed suite, which is never committed):

`task.json`:

```json
{ "id": "chunk-array", "title": "Split an array into fixed-size groups", "group": "collections",
  "entry": "solution.mjs",
  "api": [ { "name": "chunk", "signature": "export function chunk(items: unknown[], size: number): unknown[][]" } ],
  "constraints": [ "Throw RangeError when size is not a positive integer" ],
  "timeoutMs": 4000, "tags": [ "arrays", "validation" ] }
```

`brief.md` is the statement, shown verbatim. It must state **every** behaviour the cases check, so a low
score means the agent read carelessly and not that the task was unfair. `starter/` holds optional
context files. `group` names the use case the task belongs to.

`cases.mjs` is never shown to the agent:

```js
export default [
  { name: 'splits evenly', run: (m, assert) => assert.deepEqual(m.chunk([1, 2, 3, 4], 2), [[1, 2], [3, 4]]) },
  { name: 'rejects size 0', run: (m, assert) => assert.throws(() => m.chunk([1], 0), RangeError) },
];
```

`m` is the imported solution module and `assert` is `node:assert/strict`, captured
before the solution loads. A case passes when `run` returns, or its returned promise
resolves, within the task timeout.

**Rules for writing cases**
- Every case name is unique within its task.
- A case that expects an error must first check that the function exists
  (`a.equal(typeof m.f, 'function')`). Calling a missing function also throws a `TypeError`, so
  without that check an empty solution would pass the case.
- A reference solution (kept outside the task folder, in `suites/code/reference/`) must pass every
  case, and a plausible but careless solution must fail at least one.

### 13.2 `ml` tasks

`suites/ml/public/<task-id>/`:

`task.json`:

```json
{ "id": "moons", "title": "Two interleaving half-circles", "kind": "classification",
  "group": "nonlinear-classification", "features": 2, "classes": 2,
  "trainSize": 200, "testSize": 200, "budgetMs": 4000, "tags": [ "synthetic", "2d" ] }
```

`data.mjs` runs in the parent only. The learner never sees it:

```js
// generate(seed) must be deterministic: the same seed gives the same data.
// rng is a seeded function returning numbers in [0, 1). Use it for everything random.
export function generate(rng, { trainSize, testSize }) {
  // ... build trainX, trainY, testX, testY ...
  return { trainX, trainY, testX, testY };
}
```

**Randomness.** The generator for task `t` in run `i` is given `mulberry32(seed)` where `seed` is the
first 8 hex characters of `sha256("hellgate/data/1|" + seed_hex(i) + "|" + t)`, as an unsigned
32-bit integer. `kit.random` for the learner uses the same construction with the prefix
`hellgate/learn/1|`. `mulberry32` is the standard small generator:

```
a = (a + 0x6D2B79F5) | 0
t = imul(a ^ (a >>> 15), 1 | a)
t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t
return ((t ^ (t >>> 14)) >>> 0) / 4294967296
```

**Scoring.** For each held-out test point `j` of a task in run `i`, the case passes when:
- classification: `round(prediction[j]) === testY[j]`;
- regression: `|prediction[j] − testY[j]| ≤ tolerance`.

A run that returns the wrong number of predictions, a non-finite value, or uses more CPU time than
`budgetMs` (loading the learner's files included) scores 0 for that task. The budget is CPU time so
that machine load cannot change a result; a process is also killed on the wall clock after four
times the budget plus two seconds, to stop a runaway. The dataset for run `i` is generated with `seed(i)` (§6), so both
sides of a comparison see identical data, and different runs see different samples.

**Mode.** An attestation for an `ml` tree has `mode: "live"`, because the verifier really
re-runs the training. There is no recording, `change.recording` is `null`, and there is no
spot-check. The results digest still has to match between verifiers.

### 13.3 Areas

A claim's `area` must come from the tree's domain:

| Domain | Areas |
|---|---|
| `code` | `prompt`, `context`, `parsing`, `repair`, `decoding`, `planning`, `self-check`, `budget`, `other` |
| `ml` | `optimizer`, `schedule`, `preprocessing`, `architecture`, `regularization`, `initialization`, `loss`, `other` |
