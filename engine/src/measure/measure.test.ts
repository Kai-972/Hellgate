/**
 * Measurement (Stage 6): the arithmetic, the bootstrap, the batch runner, the comparison, and the
 * score against the base.
 *
 * The vectors in `VECTORS` come from an independent implementation of PROTOCOL §7 and §8 written in
 * Python from the spec alone. Two implementations that share no code agreeing on every number is what
 * lets a verifier on another machine be trusted to reproduce a digest.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { HellgateError } from '../core/errors.ts';
import type { TaskOutcome } from '../sandbox/outcome.ts';
import { seedHex, taskOrder } from '../suite/seeds.ts';
import { ceilDiv, caseScoreBp, floorDiv, halfUpMean } from './arith.ts';
import { checkedBatch, runBatch, scoresOf, type Batch, type BatchEvent } from './batch.ts';
import { bootstrapInterval, callOf } from './bootstrap.ts';
import { againstBase, compareBatches, resultsDigest, scoreAgainstBase } from './compare.ts';

const IDS = { suite: "b51b995f829d898ec23a07897c1ba788bd1338de22420a5546928b88b533ef1e", change: "31919abffa533f3b405001b59201b02a4ea3a18e318a49de0fd04e6eefe3d338", signer: "GSIGNERVECTOR" };
const TASKS = ['alpha', 'beta', 'delta', 'epsilon', 'gamma', 'zeta'];
// Cases per task, in the order of the sorted ids above (the Python generator indexes the same way).
const CASES = [7, 10, 12, 9, 8, 11];

const FORWARD = {"parentRuns": [4269, 3878, 3038, 4198, 3908], "candidateRuns": [6376, 6155, 5953, 6161, 6125], "parentMeans": {"alpha": 3714, "beta": 3200, "delta": 3833, "epsilon": 4222, "gamma": 4000, "zeta": 4181}, "candidateMeans": {"alpha": 6285, "beta": 6000, "delta": 6166, "epsilon": 6222, "gamma": 6250, "zeta": 5999}, "d": [2571, 2800, 2333, 2000, 2250, 1818], "effect": 2295, "ci2000": [2046, 2568], "ci200": [2060, 2554], "digest": "079bb05dd9d835371573362f5ede28170f004f95701bb9b5e423656cfd34354f", "parentScore": 3858, "candidateScore": 6154};
const REVERSE = {"parentRuns": [6376, 6155, 5953, 6161, 6125], "candidateRuns": [4269, 3878, 3038, 4198, 3908], "parentMeans": {"alpha": 6285, "beta": 6000, "delta": 6166, "epsilon": 6222, "gamma": 6250, "zeta": 5999}, "candidateMeans": {"alpha": 3714, "beta": 3200, "delta": 3833, "epsilon": 4222, "gamma": 4000, "zeta": 4181}, "d": [-2571, -2800, -2333, -2000, -2250, -1818], "effect": -2295, "ci2000": [-2568, -2046], "ci200": [-2551, -2076], "digest": "b908c9a64a723fd9bd7f02484f75228dc243a1837100750c8985bbe283c7af4e", "parentScore": 6154, "candidateScore": 3858};

const RUNS = 5;
const make = (pass: (r: number, t: number, c: number) => boolean): Batch => ({
  suite: IDS.suite, runs: RUNS, taskIds: TASKS, clean: true,
  outcomes: Array.from({ length: RUNS }, (_, r) => TASKS.map((_, t) => Array.from({ length: CASES[t]! }, (_, c) => pass(r, t, c)))),
});
const parent = make((r, t, c) => (r * 7 + t * 13 + c * 5 + r * c * 3 + t * t) % 10 < 4);
const candidate = make((r, t, c) => (r * 3 + t * 11 + c * 7) % 10 < 6);
const options = { changeId: IDS.change, signer: IDS.signer, resamples: 2000, minEffectBp: 300 };

/* ------------------------------------------------------------------ arithmetic */

test('floorDiv and ceilDiv round toward minus and plus infinity', () => {
  assert.deepEqual([floorDiv(7, 2), floorDiv(-7, 2), floorDiv(-8, 2), floorDiv(0, 5), floorDiv(-1, 5)], [3, -4, -4, 0, -1]);
  assert.deepEqual([ceilDiv(7, 2), ceilDiv(-7, 2), ceilDiv(8, 2), ceilDiv(1, 5)], [4, -3, 4, 1]);
  assert.equal(floorDiv(2 ** 52 + 1, 2), 2 ** 51);
});

test('halfUpMean rounds halves up, including for negative values', () => {
  assert.equal(halfUpMean([1, 2]), 2); //  1.5 → 2
  assert.equal(halfUpMean([-1, -2]), -1); // −1.5 → −1
  assert.equal(halfUpMean([0, 1, 1]), 1); //  0.67 → 1
  assert.equal(halfUpMean([-1, 0, 0]), 0); // −0.33 → 0
  assert.equal(halfUpMean([5]), 5);
  assert.throws(() => halfUpMean([]), HellgateError);
  assert.throws(() => halfUpMean([1.5]), /whole number/);
});

test('a task score is the share of cases passed, in basis points, rounded down', () => {
  assert.equal(caseScoreBp(0, 7), 0);
  assert.equal(caseScoreBp(7, 7), 10000);
  assert.equal(caseScoreBp(1, 3), 3333);
  assert.equal(caseScoreBp(2, 3), 6666);
  assert.throws(() => caseScoreBp(0, 0), HellgateError);
});

/* ------------------------------------------------------------------ scoring, interval, digest */

test('per-run scores, task means, differences, effect, interval and digest match the independent implementation', () => {
  for (const [label, p, c, want] of [['forward', parent, candidate, FORWARD], ['reverse', candidate, parent, REVERSE]] as const) {
    const out = compareBatches(p, c, options);
    assert.deepEqual(out.parent.runScoresBp, want.parentRuns, label);
    assert.deepEqual(out.candidate.runScoresBp, want.candidateRuns, label);
    assert.deepEqual(out.parent.taskMeansBp, want.parentMeans, label);
    assert.deepEqual(out.candidate.taskMeansBp, want.candidateMeans, label);
    assert.deepEqual(out.d, want.d, label);
    assert.equal(out.effectBp, want.effect, label);
    assert.deepEqual([out.ciLowBp, out.ciHighBp], want.ci2000, label);
    assert.equal(out.resultsDigest, want.digest, label);
    assert.equal(out.clean, true);
  }
});

test('the bootstrap follows the number of resamples, and its calls are sorted-index exact', () => {
  const small = bootstrapInterval({ changeId: IDS.change, signer: IDS.signer, suiteId: IDS.suite, d: FORWARD.d, resamples: 200 });
  assert.deepEqual([small.ciLowBp, small.ciHighBp], FORWARD.ci200);
  const reverse = bootstrapInterval({ changeId: IDS.change, signer: IDS.signer, suiteId: IDS.suite, d: REVERSE.d, resamples: 200 });
  assert.deepEqual([reverse.ciLowBp, reverse.ciHighBp], REVERSE.ci200);
});

test('the interval depends on the change and the signer, so it cannot be shopped for', () => {
  const base = { changeId: IDS.change, signer: IDS.signer, suiteId: IDS.suite, d: FORWARD.d, resamples: 2000 };
  const a = bootstrapInterval(base);
  assert.deepEqual(a, bootstrapInterval(base), 'deterministic');
  const other = bootstrapInterval({ ...base, signer: 'GSOMEONEELSE' });
  assert.notDeepEqual(other, a);
});

test('a single task gives a degenerate interval and a constant difference gives a point', () => {
  const one = bootstrapInterval({ changeId: IDS.change, signer: IDS.signer, suiteId: IDS.suite, d: [500], resamples: 200 });
  assert.deepEqual(one, { ciLowBp: 500, ciHighBp: 500 });
  const flat = bootstrapInterval({ changeId: IDS.change, signer: IDS.signer, suiteId: IDS.suite, d: [-40, -40, -40, -40], resamples: 200 });
  assert.deepEqual(flat, { ciLowBp: -40, ciHighBp: -40 });
});

test('the call needs the whole interval beyond zero and an effect of at least the minimum', () => {
  assert.equal(callOf(400, 10, 800, 300), 'gain');
  assert.equal(callOf(400, 0, 800, 300), 'noise', 'an interval touching 0 is not a gain');
  assert.equal(callOf(250, 10, 800, 300), 'noise', 'too small an effect');
  assert.equal(callOf(300, 1, 800, 300), 'gain', 'exactly the minimum counts');
  assert.equal(callOf(-400, -800, -10, 300), 'loss');
  assert.equal(callOf(-400, -800, 0, 300), 'noise');
  assert.equal(callOf(-299, -800, -10, 300), 'noise');
  assert.equal(callOf(0, -100, 100, 300), 'noise');
});

test('the same outcomes give the same digest, and one flipped case changes it', () => {
  assert.equal(resultsDigest(parent, candidate), FORWARD.digest);
  const flipped: Batch = { ...candidate, outcomes: candidate.outcomes.map((run) => run.map((cases) => [...cases])) };
  flipped.outcomes[2]![3]![0] = !flipped.outcomes[2]![3]![0];
  assert.notEqual(resultsDigest(parent, flipped), FORWARD.digest);
  assert.notEqual(resultsDigest(candidate, parent), FORWARD.digest, 'which side is which matters');
});

test('an unclean batch makes the comparison unclean', () => {
  assert.equal(compareBatches(parent, { ...candidate, clean: false }, options).clean, false);
  assert.equal(compareBatches({ ...parent, clean: false }, candidate, options).clean, false);
});

test('batches that do not line up are refused, never compared', () => {
  assert.throws(() => compareBatches(parent, { ...candidate, suite: 'f'.repeat(64) }, options), /different suites/);
  assert.throws(() => compareBatches(parent, { ...candidate, runs: 3, outcomes: candidate.outcomes.slice(0, 3) }, options), /different numbers of runs/);
  assert.throws(() => compareBatches(parent, { ...candidate, taskIds: [...TASKS.slice(0, 5), 'omega'] }, options), /different tasks/);
  const shorter = { ...candidate, outcomes: candidate.outcomes.map((run) => run.map((cases, t) => (t === 0 ? cases.slice(1) : cases))) };
  assert.throws(() => compareBatches(parent, shorter, options), /different cases/);
  const ragged = { ...candidate, outcomes: candidate.outcomes.map((run, r) => run.map((cases, t) => (r === 1 && t === 0 ? cases.slice(1) : cases))) };
  assert.throws(() => checkedBatch(ragged), /different number of cases/);
  assert.throws(() => checkedBatch({ ...candidate, outcomes: candidate.outcomes.slice(0, 4) }), /one entry per run/);
});

/* ------------------------------------------------------------------ score against the base */

test('a build\'s score is the mean of its task means, and vsBase is positive when better and negative when worse', () => {
  assert.equal(scoresOf(parent).runScoresBp.length, RUNS);
  const better = scoreAgainstBase(candidate, parent);
  assert.deepEqual(better, { scoreBp: FORWARD.candidateScore, baseScoreBp: FORWARD.parentScore, vsBaseBp: FORWARD.candidateScore - FORWARD.parentScore });
  assert.ok(better.vsBaseBp > 0);
  const worse = scoreAgainstBase(parent, candidate);
  assert.equal(worse.vsBaseBp, -better.vsBaseBp);
  assert.equal(scoreAgainstBase(parent, parent).vsBaseBp, 0);
  assert.deepEqual(againstBase(7000, 5500), { scoreBp: 7000, baseScoreBp: 5500, vsBaseBp: 1500 });
  assert.throws(() => scoreAgainstBase(parent, { ...candidate, suite: 'f'.repeat(64) }), /same suite/);
});

/* ------------------------------------------------------------------ the batch runner */

const fakeTask = (taskId: string, cases: boolean[], over: Partial<TaskOutcome> = {}): TaskOutcome =>
  ({ taskId, cases, status: 'ok', clean: true, ms: 1, detail: 'fake', ...over });

test('runBatch runs every task in every run, in the seeded order, and returns outcomes by sorted task', async () => {
  const seen: { run: number; task: string; seed: string }[] = [];
  const events: BatchEvent[] = [];
  const batch = await runBatch({
    suiteId: IDS.suite, taskIds: [...TASKS].reverse(), runs: 3, lanes: 1, onEvent: (e) => events.push(e),
    runTask: async (task, run, seed) => {
      seen.push({ run, task, seed });
      return fakeTask(task, Array.from({ length: 4 }, (_, i) => i <= TASKS.indexOf(task)));
    },
  });
  assert.deepEqual(batch.taskIds, TASKS);
  assert.equal(batch.clean, true);
  for (let run = 0; run < 3; run++) {
    const seed = seedHex(IDS.suite, run);
    assert.deepEqual(seen.filter((s) => s.run === run).map((s) => s.task), taskOrder(TASKS, seed), `run ${run} starts tasks in the seeded order`);
    assert.ok(seen.filter((s) => s.run === run).every((s) => s.seed === seed));
  }
  assert.deepEqual(batch.outcomes[0]![0], [true, false, false, false]);
  assert.deepEqual(batch.outcomes[2]![5], [true, true, true, true]);
  assert.equal(events.length, 18);
  assert.deepEqual(events.find((e) => e.run === 1 && e.task === 'beta'), { type: 'task', run: 1, task: 'beta', passed: 2, total: 4, status: 'ok', clean: true, ms: 1 });
});

test('runBatch uses several lanes at once and marks the batch unclean when a task was tampered with', async () => {
  let active = 0;
  let peak = 0;
  const batch = await runBatch({
    suiteId: IDS.suite, taskIds: TASKS, runs: 3, lanes: 2,
    runTask: async (task, run) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      const tampered = task === 'gamma' && run === 1;
      return fakeTask(task, tampered ? [false, false] : [true, false], tampered ? { status: 'tampered', clean: false } : {});
    },
  });
  assert.equal(peak, 2);
  assert.equal(batch.clean, false);
  assert.deepEqual(batch.outcomes[1]![TASKS.indexOf('gamma')], [false, false]);
});

test('a task that fails for infrastructure reasons is run again, and a batch with a hole is an error', async () => {
  let attempts = 0;
  const flaky = await runBatch({
    suiteId: IDS.suite, taskIds: ['alpha'], runs: 3, lanes: 1, retries: 1,
    runTask: async (task) => {
      if (attempts++ === 0) throw new Error('HTTP 503');
      return fakeTask(task, [true]);
    },
  });
  assert.equal(attempts, 4, 'one failure, then every run once');
  assert.equal(flaky.outcomes.length, 3);

  await assert.rejects(
    runBatch({ suiteId: IDS.suite, taskIds: ['alpha'], runs: 3, lanes: 1, retries: 0, runTask: async () => { throw new Error('HTTP 503'); } }),
    (err: unknown) => err instanceof HellgateError && err.kind === 'environment' && /HTTP 503/.test(err.message),
  );
});

test('a runner that answers for the wrong task, or with a different case count per run, is refused', async () => {
  await assert.rejects(
    runBatch({ suiteId: IDS.suite, taskIds: ['alpha'], runs: 3, lanes: 1, retries: 0, runTask: async () => fakeTask('beta', [true]) }),
    /not alpha/,
  );
  let n = 0;
  await assert.rejects(
    runBatch({ suiteId: IDS.suite, taskIds: ['alpha'], runs: 3, lanes: 1, retries: 0, runTask: async (task) => fakeTask(task, new Array(2 + (n++ % 2)).fill(true)) }),
    /different number of cases/,
  );
});
