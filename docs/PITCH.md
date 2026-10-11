# Pitch and demo video script

## The positioning, in one breath
Warden and the eval tools answer **"is this agent any good?"** and ask you to trust the tester.
Hellgate answers **"did this change really help?"** and asks you to trust **nobody**: every verdict is a pile of signed
files, and your own browser can re-check them. When an AI edits itself, that is the only kind of proof worth having.

Three things nobody else on the page can do:
1. **You can check us.** Open any change, press *Check every record*: your browser re-hashes and re-verifies every signature,
   with code that shares nothing with our server. Press *tamper*: one number changes and the same code goes red.
2. **We catch the two ways self-improving systems lie.** Luck (a +7 that was a coin flip) and cheating (an agent that tried
   to read the answer key). Both are in the committed trees, with their numbers.
3. **It is a pipeline, not a report.** Bots verify, the gate decides, a person signs off only when something is flagged, and production
   moves only then. The benchmark before and after is shown.

## Against the competitors (the lines to use)
| They say | You say |
|---|---|
| "Warden crash-tests your agent." | "They find where one agent breaks. We decide whether an edit should ship. Different question, and you'd want both." |
| "Warden uses LLM judges." | "We never let a model grade a model. Hidden tests decide, so anyone gets the same score." |
| "Warden is an independent tester." | "Independent means you trust them. Open our evidence and check it yourself, in the browser, right now." |
| "Evals tools already do this." | "They show the author's scores. Here the author's number counts for nothing until other keys reproduce it, and failures are kept." |
| "It's a wrapper around Gemini." | "The learner on the other tree has no model at all, and the same gate works. The product is the referee." |

## The video: 3 minutes, in your own voice
Say it like you'd tell a friend. Don't read these word for word; learn the beats.

**0:00 · Cold open. Camera on the `momentum` change page.**
"We had a change that made our learner seven points better. We nearly shipped it. Then two other machines re-ran it, and it was a coin flip.
The range runs from minus point two to plus fourteen. It crosses zero. That's luck, and nothing in our normal workflow would have told us."

**0:25 · The problem, over the home page.**
"That's the whole problem with improving AI. Results are noisy, you grade your own work, and the ideas that fail get forgotten.
Hellgate is the referee. A change only counts when other keys re-run it on tests they can't game. The failures stay here, with their numbers. This is a learning algorithm: sixty-three percent to ninety-two."

**0:55 · The cheat. Code tree, `read-the-tests`, then `reword-rules`.**
"This tree improves an AI agent that writes code. One of the changes tried to read the answer key. Stopped before it ran. This one: a verifier who signed numbers without running anything. Honest replays give identical fingerprints, so it stands out."

**1:25 · The step up. Open an accepted change, press *Check every record*.**
"Here's what I care about. You don't have to trust this page. Every record behind this verdict is signed. Press this, and your browser downloads them and re-checks every hash and signature itself. Green.
Now I change one number. Point zero one of a point. Same code, same records. Red. The edit is caught. No server involved."

**2:00 · The pipeline. `ml` tree, *Run the pipeline*.**
"Production is at sixty-three. Non-production is at ninety-two. Not consistent, and we say so. The bots verify, the gate accepts it, and then the check flags it: the margin is thin. It stops for a person. I approve, with my name, on the record. Production moves, and this is what really changed in the benchmark."

**2:35 · Beat the gate. The finished regression.**
"Anyone can try. This instruction told the agent to write empty functions. Two keys measured it: down ninety-four points. The gate said no."

**2:50 · Close, on the logo.**
"No AI judges. Hidden tests. Signed evidence you can check yourself. Sixteen tasks are evidence, not proof, and keys aren't people, and we say that out loud. Hellgate: proof for AI changes."

## If a judge says "this is like Warden / tons of similar products"
Don't argue the category. Say: "Fair. Here's the difference you can test in thirty seconds." Then open a change, press *Check every record*,
press tamper. Nothing else in a vendor dashboard can do that, because there the evidence lives on their server.

## Don't say
"Independent people" (say distinct keys); anything about spot-checks, the sealed suite, Stellar receipts or the AI proposer as built;
"AI judges"; where the idea came from, unless asked, and then be direct.
