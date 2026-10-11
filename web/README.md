# Hellgate web app

The web app that shows the tree, the graveyard and the evidence behind every verdict, and
runs verifications and Beat the gate live.

Start with [../docs/FRONTEND.md](../docs/FRONTEND.md). It is the full brief, and it ends
with a ready-to-paste prompt for your coding assistant.

Until the hub is running, build against the mock data:

- `mock/export.sample.json`: the whole tree, in the `hellgate/export/1` shape (PROTOCOL §11)
- `mock/job-events.sample.json`: a recorded Beat-the-gate job's event stream (PROTOCOL §10.1)
