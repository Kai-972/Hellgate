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

Storage: `.hellgate/records/<id[0:2]>/<id[2:]>.json`.

A reader accepts a file only when all of the following hold:
1. The body matches its schema.
2. `id(body)` equals the file name.
3. For signed types, `sig` verifies against `body.signer`.

Rejected files are reported and ignored.

## 5. Record types

### 5.1 `build`

```json
{ "type": "build", "v": 1, "files": { "agent/index.ts": "<contents>", "...": "..." } }
```

- Paths are relative and start with `agent/`. Contents are UTF-8 with `\n` line endings
  and end with a newline.
- The **empty build** (`files: {}`) is the parent of the genesis change. It must score 0
  on every case; this is the sandbox canary.

### 5.2 `suite`: computed, not stored

```
suite id = id({ "type": "suite", "v": 1,
                "tasks": [ { "id": <task id>, "files": { <relative path>: <contents> } } ] })
```

Tasks are sorted by `id`, and `files` covers every file in the task directory, including
`cases.mjs`. The sealed suite's commitment uses the same formula.

### 5.3 `recording`

```json
{ "type": "recording", "v": 1,
  "build": "Hex64", "suite": "Hex64", "model": "gemini-3.1-flash-lite", "runs": 5,
  "entries": [ { "key": "Hex64",
                 "response": { "text": "...", "finish": "stop|length|other",
                               "inputTokens": 0, "outputTokens": 0 } } ] }
```

- `entries` is sorted by `key`, and each key appears once.
- `key = id({ "type": "request", "model", "system", "messages", "maxOutputTokens",
  "temperature100", "stop", "seed" })`, where:
  - `temperature100` is the temperature × 100, rounded to an integer;
  - absent fields are encoded as `null`;
  - `messages` is `[{ "role": "user"|"assistant", "text": "..." }]`.

### 5.4 `change` (signed by the author)

```json
{ "type": "change", "v": 1,
  "tree": "string", "parent": "Hex64 | \"genesis\"",
  "build": "Hex64", "parentBuild": "Hex64", "suite": "Hex64",
  "claim": { "hypothesis": "30..600 chars", "falsifiedIf": "15..400 chars",
             "area": "prompt|context|parsing|repair|decoding|planning|self-check|budget|other",
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

For a task `t` with `n_t` cases, in run `i`:

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

## 9. The verdict: `decide(change, attestations, policy)`

This is a pure function. Steps run in order, and the first one that returns wins.

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
     the lowest `effectBp`.
   - If their calls **differ**, drop all of that signer's attestations as
     `equivocation`.

   The survivors are the **counted** set, with one per key.
4. **Unclean.** If any counted attestation has `clean = false` → `rejected`
   `NOT_CLEAN`.
5. **Reproducibility.**
   - If counted replay attestations disagree on `resultsDigest` → `contested`
     `RESULTS_MISMATCH`.
   - If at least `minVerifiers` counted replay attestations share a digest that differs
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

- `as` names one of the hub's demo verifier keys, configured with
  `HELLGATE_BOT_1_SECRET` and `HELLGATE_BOT_2_SECRET`. A bot never verifies a change it
  authored.
- A `challenge` job:
  1. builds the change on `parent` (default: the best accepted tip) by appending
     `instruction` to the agent's instruction list as a JSON-quoted string;
  2. signs it with the hub's author key (`HELLGATE_SECRET`);
  3. records a live run;
  4. then runs `verify` as `bot-1` and as `bot-2`.

**Event stream.** Each event is `event: <type>` followed by `data: <JSON>`:

| Event type | Data |
|---|---|
| `stage` | `{ "stage": "guards\|typecheck\|record\|verify\|spot-check\|sign\|push", "as": string \| null }` |
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
  "suite": { "id": "Hex64", "tasks": 16, "cases": 160 },
  "sealed": null,
  "models": { "agent": "string", "proposer": "string" },
  "policy": { "...": "..." },
  "totals": { "changes": 0, "accepted": 0, "rejected": 0, "pending": 0,
              "contested": 0, "void": 0 },
  "gatePath": [ "Hex64" ],
  "curve": [ { "change": "Hex64", "depth": 1, "scoreBp": 0 } ],
  "changes": [ {
    "id": "Hex64", "parent": "Hex64|genesis", "depth": 0,
    "status": "accepted|rejected|pending|contested|void", "code": "GAIN|...",
    "reason": "string", "effectBp": 0, "ciLowBp": 0, "ciHighBp": 0,
    "claim": { "...": "as in §5.4" }, "origin": { "...": "..." },
    "mechanical": { "...": "..." }, "claimed": { "...": "..." },
    "author": "Addr", "createdAt": "ISO-8601",
    "diff": "unified diff against the parent build",
    "perTask": [ { "task": "id", "parentBp": 0, "candidateBp": 0 } ],
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

## 12. Agent contract (`agent/contract.ts`, frozen)

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

## 13. Task format

`suites/public/<task-id>/` (a later stage adds `suites/sealed/`, which is never committed):

`task.json`:

```json
{ "id": "chunk-array", "title": "Split an array into fixed-size groups",
  "entry": "solution.mjs",
  "api": [ { "name": "chunk", "signature": "export function chunk(items: unknown[], size: number): unknown[][]" } ],
  "constraints": [ "Throw RangeError when size is not a positive integer" ],
  "timeoutMs": 4000, "tags": [ "arrays", "validation" ] }
```

`brief.md` is the statement, shown verbatim. `starter/` holds optional context files.

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
