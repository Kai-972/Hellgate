# Team log

A shared log so we always know what the other person did and what's next.

**Rules**
- Append only. New entries go at the **bottom**. Never edit or delete an old entry; if
  something was wrong, add a new entry that corrects it.
- No dates or times. Entries are numbered: take the last number and add one.
- Keep each entry short. Link to files and to [STAGES.md](STAGES.md) instead of copying them.
- Write blockers plainly, including what you need and from whom.

**Template**

```
### #NNN · <who> · <area: engine | web | docs | demo>
**Stage:** <number and name>
**Did:** <what changed, with file paths>
**Found:** <anything surprising: bugs, limits, numbers measured>
**Next:** <the very next step>
**Blocked on:** <nothing | what and who>
```

---

### #001 · Kai · docs
**Stage:** 0, Foundation
**Did:** Wrote the design ([ARCHITECTURE.md](ARCHITECTURE.md)), the exact rules
([PROTOCOL.md](PROTOCOL.md)), the build plan ([STAGES.md](STAGES.md)), the web app brief
([FRONTEND.md](FRONTEND.md)) and this log. Set up the monorepo folders `engine/` and `web/`.
**Found:**
- The free Gemini key handles bursts on `gemini-3.1-flash-lite`: 12 parallel calls, 12
  successes, about 1.5 s each.
- `gemini-3.5-flash` returned a 429 on 2 of 12 parallel calls, so it is only used for the
  proposer, at low volume.
- Node 26's permission model denies network access by default, which the sandbox relies on.
**Next:** Stage 1, core primitives.
**Blocked on:** nothing.

### #002 · Kai · web
**Stage:** 12, web app (can start now, in parallel)
**Did:** Added the mock data `web/mock/export.sample.json` so the frontend can be built
before the engine exists.
**Next:** Frontend: follow [FRONTEND.md](FRONTEND.md) and log progress here.
**Blocked on:** nothing.

### #003 · Kai · docs
**Stage:** 0, Foundation (plan for working in parallel)
**Did:**
- Added ownership, contracts, git rules, the tier and cut line, and effort targets to
  [STAGES.md](STAGES.md). Added [../PROGRESS.md](../PROGRESS.md), a status board, so either of
  us can see the current state at a glance.
- Reviewed the engine scaffold that landed on `main`: its tests pass, but its typecheck
  fails, and several parts differ from [PROTOCOL.md](PROTOCOL.md). Details are in the next
  entry once the merge is done.
**Found:**
- The scaffold was written against an earlier version of the docs, so it predates STAGES.md,
  FRONTEND.md and this log.
- The scaffold's audit list is accurate about what is missing; it is a good gap list.
**Next:**
- Merge the scaffold into the current tree, keeping its history, then finish Stage 1.
- Frontend: pull the latest `main`, read FRONTEND.md and STAGES.md, then start the web app
  on the mock data.
**Blocked on:** the docs reaching `main`, so the frontend can read them.

### #004 · Kai · docs
**Stage:** 0, Foundation (final plan)
**Did:** Settled the split of work and recorded it in [../PROGRESS.md](../PROGRESS.md) under
Decisions: engine with Kai and Claude, the whole web app with the frontend teammate, benchmark
tasks drafted by Kai and checked by a validator, and the demo running on Kai's laptop.
**Found:**
- The two root documents on `main` restate the architecture and protocol, so they will be
  removed to keep a single source of truth. One passage in them describes a "majority" gain
  rule; the protocol rule is that **every** counted verifier must report a gain.
- The engine scaffold used a different toolchain from the one the protocol was written for.
**Next:** Merge the scaffold into the current tree, keeping its history, then Stage 1.
**Blocked on:** nothing.

### #005 · Kai · docs
**Stage:** 0, Foundation (pipeline doc)
**Did:** Wrote [PIPELINE.md](PIPELINE.md): the whole journey of a change in eight steps (P0
setup to P7 learn), the records and how they link, the sandbox, the measurement, a failure
table, who can do what, timing, a worked example and a map from each step to its module and
command. Linked it from the README and ARCHITECTURE.md.
**Found:** The teammate's two root documents restated the same pipeline against the earlier
version of the docs. Their list of what was still missing was accurate and matches STAGES.md.
They are replaced by PIPELINE.md and removed from the root so there is one source of truth.
**Next:**
- Teammate: pull `main`, read PIPELINE.md, then FRONTEND.md, and start the web app on the mock data.
- Kai: Stage 1.
**Blocked on:** nothing.
