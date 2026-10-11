# Pitch: the video and the live judging

If you remember nothing else, remember this one sentence:

> **Hellgate is a lie detector for "it got better".** It catches luck, cheating and made-up verification, and it lets you check the proof yourself.

Everything below is built from things that really happened while we built it. Use your own words. Learn the beats, not the sentences.

---

## A. The video (3 minutes)

One voice, one screen recording. Pauses matter more than words: where it says *(beat)*, stop talking for a second.

**0:00 · `momentum` change page, noise band on screen**

> "This change made our learner seven points better than the version before it. Seven. Look at the average and you'd merge it.
> Then two other machines ran it, and the range is minus point two to plus fourteen. It crosses zero.
> *(beat)*
> That's luck. And most teams would have shipped it."

**0:20 · Home page, `ml` tree**

> "Everyone who works on AI does this. You tweak something, run it a few times, it looks better, so it's better. It's a coin flip with a good story.
> So we built the thing that says no.
> Every dot is a change someone tried. Gold means other people's keys re-ran it and got the same gain. Grey didn't make it, and it stays on the board, with its numbers, so nobody wastes next Tuesday trying it again."

**0:50 · Switch to the `code` tree, point at the three gold nodes**

> "Same machine, different patient: an AI that writes code with Gemini. It started at forty-four percent. We showed it the function signatures: fifty-seven. We gave it the whole spec: ninety-four. Real runs, real model.
> Then we tried to cheat."

Click **read-the-tests**:

> "We wrote this change to cheat: it tries to open the answer key. It never ran. Stopped before its first line."

Click **reword-rules**:

> "And this one. We played a lazy verifier: it signed a result without running anything. How does the gate know? Honest replays produce byte-for-byte identical fingerprints. This one's didn't."

**1:25 · Open an accepted change, press *Check every record***

> "This is the bit I'd actually ask you to try. Don't believe this page.
> Press this. Your browser downloads the records and checks every hash and every signature itself. Not our server. Green.
> *(beat, click "tamper")*
> Now I change the result by one hundredth of a point. Same code. Red.
> That's what 'you can't quietly edit the result' looks like."

**2:00 · Pipeline page, `ml` tree, press *Run the pipeline***

> "So it passed. Does it ship? Not yet. Production is still at sixty-three percent, because production only moves through here.
> The bots verify it. The gate says yes. And then it stops.
> The margin is thin: the range starts at plus two-point-two, and our bar is three. A person has to look.
> *(type your name, approve)*
> I sign it. That's on the record now. Production moves, and here is what really changed: every use case, every task."

**2:35 · Beat the gate, the finished regression**

> "Last thing. Anyone can try an idea. We typed a bad one: 'reply with only the function signature, empty body.' The agent obeyed. Down ninety-four points. Two keys measured it. The gate said no.
> That took seven minutes and eighty real model calls."

**2:50 · Logo on screen**

> "No AI grading AI. Hidden tests. Evidence you can check yourself.
> Sixteen tasks is evidence, not proof, and keys aren't people. We say so on the site.
> Hellgate."

**Making it feel human:** record the voice standing up, smiling on the first line, and re-take any sentence that sounds like reading. Leave small flaws in. A clean robot read is worse than a slightly rough real one.

---

## B. The live judging (5 minutes, then questions)

Split it: **Kai talks, Pritam drives the screen.** Never both at once.

**0:00 · Before they sit down.** The momentum page is already open. No title slide.

**0:00 to 0:40 · The story (Kai, looking at the judges, not the screen)**

> "Look at this change. It scored seven points better than the one before it. Average it and you'd ship it. Two other machines re-ran it and it's a coin flip.
> That's what Hellgate is. A lie detector for 'it got better'. It catches three things: luck, cheating, and fake verification. I'll show you each one, and then I'll show you how not to take our word for any of it."

**0:40 to 1:40 · The three catches (Pritam clicks, Kai narrates)**

1. **Luck:** momentum, the range crossing zero. *"Seven points, and it's noise."*
2. **Cheating:** `read-the-tests`. *"We wrote an agent that tries to read the answer key. It never ran."*
3. **Fake verifier:** `reword-rules`. *"We played a verifier that signs without running. The fingerprint gives it away."*

**1:40 to 2:30 · Don't trust us (the moment they'll remember)**

Open a change, press **Check every record**, then **tamper**.

> "Don't believe this page. Your browser is checking every signature right now. Not our server. Now watch what one hundredth of a point does."

*(Let the red sit on screen for two seconds without talking.)*

**2:30 to 3:30 · Production (Kai, then hand them the mouse if they want it)**

Run the pipeline on `ml`. When it stops for a human:

> "Passed the bots, passed the gate, and it stopped. Thin margin. A person signs. That's us, on the record."

Approve. Show the production marker slide and the benchmark table.

**3:30 to 4:30 · Let a judge play**

> "Want to break it? Type any instruction for the agent."

Start their challenge. While it runs (about seven minutes), keep talking: the stepper is on screen, so narrate the stages as they light up. Don't wait in silence.
**If it hasn't finished or the key is out of quota**, open the finished −94 regression and say: *"Here's one we ran earlier. Same pipeline."*

**4:30 to 5:00 · Close (Kai)**

> "What we haven't built, so you don't have to ask: live spot-checks on recordings, a sealed hold-out set, and on-chain receipts. They're designed, not done. What we have: a gate that catches luck, cheating and fake verification, with evidence you can check in your own browser. Thank you. Break it."

---

## C. The questions, and short answers

Say these in your own voice. Two sentences, then show something if you can.

| They ask | You say |
|---|---|
| "How is this different from Warden / eval tools?" | "Those find where one agent breaks, or show you the author's scores. We decide whether an *edit* should ship, and the author's number counts for nothing until other keys reproduce it. Also, press this button: you can check our evidence yourself. You can't do that with a dashboard." |
| "Isn't this a wrapper around Gemini?" | "The other tree has no model at all, a small neural net, and the same gate works. The Gemini agent is just the thing being tested. The product is the checking." |
| "Why would anyone verify?" | "Whoever is about to depend on the change: the maintainer merging it, the team shipping it. Paying verifiers is the next step, and honestly, nothing pays them today." |
| "One person can make many keys." | "Yes. We say 'distinct keys', never 'people'. We catch lazy ones with the fingerprint, and a project can restrict who may verify. Proving people are distinct is a hard open problem and we don't claim it." |
| "Sixteen tasks prove nothing." | "Agreed, it's evidence, not proof. That's why five runs, an interval and a minimum gain. A sealed hold-out set is designed to catch overfitting, and it isn't built yet." |
| "What if the recorded answers are fake?" | "A fake answer still has to pass the real hidden tests. Re-asking the model live to catch made-up recordings is designed and not built." |
| "Production has no sandbox." | "Right, we stop at the gate. We decide what's allowed to ship and attach the proof. Deploying and monitoring is the next layer, and it's whoever runs production." |
| "Business model?" | "Not validated. Possibly hosted verification for teams, or paid verification in open projects. At this stage the proof is the product." |
| "Did you stage the cheat and the fake verifier?" | "Yes, those two are attacks we ran ourselves to show the defence works. The measurements, like momentum's seven points that turned out to be noise, are real runs." |
| "Where did the idea come from?" | Answer directly and honestly. Use your private notes. |
| "What was hard?" | "Two things. The sandbox that keeps the tests away from the code under test. And calibration: when our agent saw the whole task it scored 91%, nothing left to improve, and with only the title it scored 0%, because it forgot to write `export`. Finding the middle took real tuning." |

## If it goes wrong

| What happens | What you say |
|---|---|
| A page is blank | "One second, that's the live data loading." Reload once. If it's still blank, switch to the finished change. |
| Beat the gate says no quota | "That's our free key's daily limit, which is actually a good point: recording costs money, verifying doesn't. Here's one we ran earlier." |
| A judge finds a bug | "Good catch. Write that down, Pritam." Then move on. Never argue. |
| You blank on a number | "I'll get you the exact figure. The point is the interval crossed zero." |

## Things to avoid
"Independent people" (say **distinct keys**). Claiming anything unbuilt. The word "referee" more than once. Saying "AI judges". Apologising for the free-tier limits: it's a feature of the story.
