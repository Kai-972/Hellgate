/**
 * The verdict: one test per row of PROTOCOL §9, then the properties that make it trustworthy.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { idOf } from '../core/canonical.ts';
import { generateIdentity } from '../identity/keys.ts';
import { defaultPolicy, type Policy } from '../ledger/config.ts';
import type { AttestationBody, ChangeBody } from '../ledger/records.ts';
import { attestationBody, changeBody, hex } from '../ledger/testkit.ts';
import { decide, type AttestationInput, type ChangeInput, type Context } from './decide.ts';

const author = generateIdentity().address;
const [v1, v2, v3, v4] = [generateIdentity().address, generateIdentity().address, generateIdentity().address, generateIdentity().address] as [string, string, string, string];
const DIGEST = hex('the-results');

const change = (over: Partial<ChangeBody> = {}): ChangeInput => {
  const body = changeBody(author, { claimed: { runs: 5, effectBp: 900, resultsDigest: DIGEST }, ...over });
  return { id: idOf(body), body };
};
const base = change();

function att(signer: string, over: Partial<AttestationBody> = {}, target: ChangeInput = base): AttestationInput {
  const stored = { type: 'change', id: target.id, body: target.body } as never;
  const body = attestationBody(signer, stored, { resultsDigest: DIGEST, ...over });
  return { id: idOf(body), body };
}
const gain = (signer: string, effectBp = 1000, over: Partial<AttestationBody> = {}) =>
  att(signer, { effectBp, ciLowBp: effectBp - 500, ciHighBp: effectBp + 500, call: 'gain', ...over });
const loss = (signer: string, effectBp = -1000, over: Partial<AttestationBody> = {}) =>
  att(signer, { effectBp, ciLowBp: effectBp - 500, ciHighBp: effectBp + 500, call: 'loss', ...over });
const noise = (signer: string, effectBp = 50, over: Partial<AttestationBody> = {}) =>
  att(signer, { effectBp, ciLowBp: -400, ciHighBp: 500, call: 'noise', ...over });

const policy = (over: Partial<Policy> = {}): Policy => ({ ...defaultPolicy(), ...over });
const codeTree: Context = { domain: 'code' };
const mlTree: Context = { domain: 'ml' };
const run = (c: ChangeInput, atts: AttestationInput[], p = policy(), ctx = codeTree) => decide(c, atts, p, ctx);

/* ------------------------------------------------------------------ one test per row */

test('1. a change stopped by a guard is void, whatever the attestations say', () => {
  const stopped = change({ mechanical: { status: 'typecheck', detail: 'agent/index.ts(3,1): error TS2322\nmore' }, recording: null, claimed: null });
  const verdict = run(stopped, [gain(v1), gain(v2)]);
  assert.equal(verdict.status, 'void');
  assert.equal(verdict.code, 'typecheck');
  assert.match(verdict.reason, /never ran/);
  assert.match(verdict.reason, /error TS2322/);
  assert.doesNotMatch(verdict.reason, /more/, 'only the first line of the tool output is quoted');
  assert.deepEqual([verdict.effectBp, verdict.ciLowBp, verdict.ciHighBp, verdict.counted], [null, null, null, []]);
});

test('2. a change with fewer than two distinct verifier keys is pending', () => {
  const none = run(base, []);
  assert.deepEqual([none.status, none.code, none.effectBp], ['pending', 'NEEDS_VERIFIERS', null]);
  const one = run(base, [gain(v1, 800)]);
  assert.deepEqual([one.status, one.code, one.effectBp, one.counted], ['pending', 'NEEDS_VERIFIERS', 800, [v1]]);
  assert.match(one.reason, /1 of 2/);
});

test('3. two verifiers who both measure a gain accept it, and the reported numbers are the minimums', () => {
  const verdict = run(base, [gain(v2, 1200), gain(v1, 900)]);
  assert.deepEqual([verdict.status, verdict.code], ['accepted', 'GAIN']);
  assert.deepEqual([verdict.effectBp, verdict.ciLowBp, verdict.ciHighBp], [900, 400, 1400]);
  assert.deepEqual(verdict.counted, [v1, v2].sort());
  assert.match(verdict.reason, /2 distinct verifier keys/);
  assert.match(verdict.reason, /9\.0 points/);
});

test('3b. a gain needs EVERY counted verifier to report one, not a majority', () => {
  // The third verifier's effect is close enough to pass the spread check, but its interval includes 0.
  const verdict = run(base, [gain(v1), gain(v2), noise(v3, 800)]);
  assert.deepEqual([verdict.status, verdict.code], ['rejected', 'NO_EFFECT']);
  // Far enough away and the disagreement is reported first (row 8).
  assert.equal(run(base, [gain(v1), gain(v2), noise(v3, 50)]).code, 'VERIFIERS_DISAGREE');
});

test('4. verifiers who both measure a loss reject it, and the reported numbers are the maximums', () => {
  const verdict = run(base, [loss(v1, -900), loss(v2, -1300)]);
  assert.deepEqual([verdict.status, verdict.code], ['rejected', 'REGRESSION']);
  assert.deepEqual([verdict.effectBp, verdict.ciLowBp, verdict.ciHighBp], [-900, -1400, -400]);
  assert.match(verdict.reason, /9\.0 points or more/);
});

test('5. verifiers who cannot separate the change from noise reject it, reporting the lower median', () => {
  const verdict = run(base, [noise(v1, 20), noise(v2, 80)]);
  assert.deepEqual([verdict.status, verdict.code], ['rejected', 'NO_EFFECT']);
  assert.equal(verdict.effectBp, 20, 'the lower middle value when the count is even');
  const three = run(base, [noise(v1, 10), noise(v2, 90), noise(v3, 40)]);
  assert.equal(three.effectBp, 40);
});

test('6. a gain and a loss together is a conflict, however far apart', () => {
  const verdict = run(base, [gain(v1, 3000), loss(v2, -3000)]);
  assert.deepEqual([verdict.status, verdict.code], ['contested', 'CONFLICT']);
});

test('7. verifiers whose effects are too far apart ask for another verifier', () => {
  const verdict = run(base, [gain(v1, 700), gain(v2, 1500)]);
  assert.deepEqual([verdict.status, verdict.code], ['pending', 'VERIFIERS_DISAGREE']);
  assert.match(verdict.reason, /8\.0 points apart/);
  assert.equal(run(base, [gain(v1, 700), gain(v2, 1300)]).status, 'accepted', 'exactly the allowed span is fine');
});

test('8. a gain on the public tasks and a loss on the sealed ones is overfitting', () => {
  const sealedSuite = hex('sealed');
  const sealed = (call: 'gain' | 'loss' | 'noise') => ({ suite: sealedSuite, runs: 3, effectBp: 0, ciLowBp: -10, ciHighBp: 10, call });
  const ctx: Context = { domain: 'code', sealedCommitment: sealedSuite };
  assert.deepEqual(
    [run(base, [gain(v1, 1000, { sealed: sealed('gain') }), gain(v2, 1000, { sealed: sealed('loss') })], policy(), ctx).code],
    ['OVERFIT'],
  );
  assert.equal(run(base, [gain(v1, 1000, { sealed: sealed('gain') }), gain(v2, 1000, { sealed: sealed('noise') })], policy(), ctx).code, 'GAIN');
});

test('9. a verifier that reports a tampered run makes the change unacceptable', () => {
  const verdict = run(base, [gain(v1), gain(v2, 1000, { clean: false })]);
  assert.deepEqual([verdict.status, verdict.code], ['rejected', 'NOT_CLEAN']);
});

test('10. replay verifiers who disagree on the results digest contest the change', () => {
  const verdict = run(base, [gain(v1), gain(v2, 1000, { resultsDigest: hex('other') })]);
  assert.deepEqual([verdict.status, verdict.code], ['contested', 'RESULTS_MISMATCH']);
});

test('11. verifiers who agree with each other but not with the author reject it', () => {
  const mine = hex('what-i-saw');
  const verdict = run(base, [gain(v1, 1000, { resultsDigest: mine }), gain(v2, 1000, { resultsDigest: mine })]);
  assert.deepEqual([verdict.status, verdict.code], ['rejected', 'UNREPRODUCIBLE']);
  const lonely = run(base, [gain(v1, 1000, { resultsDigest: mine })]);
  assert.equal(lonely.code, 'NEEDS_VERIFIERS', 'one verifier is below the quorum, so it proves nothing yet');
});

test('12. one failed live spot-check contests the change; two reject it', () => {
  const failed = { tasks: ['alpha'], recordedBp: 6000, liveBp: 2000, ok: false };
  const fine = { tasks: ['alpha'], recordedBp: 6000, liveBp: 5800, ok: true };
  assert.deepEqual(run(base, [gain(v1, 1000, { spotCheck: failed }), gain(v2, 1000, { spotCheck: fine })]).code, 'SPOT_CHECK_FAILED');
  assert.equal(run(base, [gain(v1, 1000, { spotCheck: failed }), gain(v2, 1000, { spotCheck: fine })]).status, 'contested');
  const two = run(base, [gain(v1, 1000, { spotCheck: failed }), gain(v2, 1000, { spotCheck: failed })]);
  assert.deepEqual([two.status, two.code], ['rejected', 'UNREPRODUCIBLE']);
});

/* ------------------------------------------------------------------ filtering and equivocation */

test('an attestation from the change\'s own author is ignored, and an author cannot supply the quorum', () => {
  const verdict = run(base, [gain(author, 5000), gain(v1)]);
  assert.equal(verdict.code, 'NEEDS_VERIFIERS');
  assert.deepEqual(verdict.counted, [v1]);
  assert.deepEqual(verdict.ignored.map((i) => [i.signer, i.why]), [[author, 'self']]);
});

test('an attestation about something else is ignored', () => {
  const other = change({ build: hex('another-build') });
  const mismatches: AttestationInput[] = [
    att(v1, { change: hex('another-change') }),
    att(v2, { build: hex('wrong-build') }),
    att(v3, { parentBuild: hex('wrong-parent') }),
    att(v4, { suite: hex('wrong-suite') }),
    att(v1, { tree: 'another-tree' }),
    att(v2, {}, other),
  ];
  const verdict = run(base, mismatches);
  assert.equal(verdict.code, 'NEEDS_VERIFIERS');
  assert.deepEqual(verdict.counted, []);
  assert.ok(verdict.ignored.every((i) => i.why === 'mismatch'));
  assert.equal(verdict.ignored.length, 6);
});

test('an attestation with too few or an even number of runs is ignored', () => {
  const verdict = run(base, [gain(v1, 1000, { runs: 1 }), gain(v2, 1000, { runs: 4 }), gain(v3, 1000, { runs: 3 })]);
  assert.deepEqual(verdict.ignored.map((i) => i.why).sort(), ['runs', 'runs']);
  assert.deepEqual(verdict.counted, [v3]);
});

test('with an allow-list only the listed verifiers count', () => {
  const verdict = run(base, [gain(v1), gain(v2), gain(v3)], policy({ allowedVerifiers: [v1, v2] }));
  assert.deepEqual(verdict.counted, [v1, v2].sort());
  assert.deepEqual(verdict.ignored.map((i) => [i.signer, i.why]), [[v3, 'not-allowed']]);
});

test('a sealed block for a commitment the tree does not have is ignored', () => {
  const sealed = { suite: hex('sealed'), runs: 3, effectBp: 0, ciLowBp: -10, ciHighBp: 10, call: 'noise' as const };
  const verdict = run(base, [gain(v1, 1000, { sealed }), gain(v2, 1000, { sealed })]);
  assert.equal(verdict.code, 'NEEDS_VERIFIERS');
  assert.ok(verdict.ignored.every((i) => i.why === 'sealed-mismatch'));
  assert.equal(run(base, [gain(v1, 1000, { sealed }), gain(v2, 1000, { sealed })], policy(), { domain: 'code', sealedCommitment: sealed.suite }).code, 'GAIN');
});

test('one key saying two different things is dropped as equivocation', () => {
  const verdict = run(base, [gain(v1), loss(v1), gain(v2)]);
  assert.equal(verdict.code, 'NEEDS_VERIFIERS');
  assert.deepEqual(verdict.counted, [v2]);
  assert.deepEqual(verdict.ignored.map((i) => i.why), ['equivocation', 'equivocation']);
  assert.equal(run(base, [gain(v1), gain(v1, 900, { notes: ['again'] }), noise(v1)]).counted.length, 0, 'any disagreement drops all of that key\'s attestations');
});

test('one key saying the same thing twice counts once, with its lowest effect', () => {
  const verdict = run(base, [gain(v1, 1000), gain(v1, 800, { notes: ['second look'] }), gain(v1, 1100, { notes: ['third'] })]);
  assert.equal(verdict.code, 'NEEDS_VERIFIERS', 'a single key is not a quorum, however often it signs');
  assert.deepEqual([verdict.counted, verdict.effectBp], [[v1], 800]);
  assert.equal(verdict.ignored.filter((i) => i.why === 'duplicate').length, 2);
  const withSecond = run(base, [gain(v1, 1000), gain(v1, 800, { notes: ['again'] }), gain(v2, 1000)]);
  assert.deepEqual([withSecond.code, withSecond.effectBp], ['GAIN', 800]);
});

/* ------------------------------------------------------------------ digests: replay, live, ml */

test('live attestations against a model are not compared by digest, but in an ml tree they are', () => {
  const live = [gain(v1, 1000, { mode: 'live', resultsDigest: hex('a') }), gain(v2, 1000, { mode: 'live', resultsDigest: hex('b') })];
  assert.equal(run(base, live, policy(), codeTree).code, 'GAIN', 'a live run against a model is not reproducible digest for digest');
  const mismatch = run(base, live, policy(), mlTree);
  assert.deepEqual([mismatch.status, mismatch.code], ['contested', 'RESULTS_MISMATCH']);

  const agreeing = [gain(v1, 1000, { mode: 'live' }), gain(v2, 1000, { mode: 'live' })];
  assert.equal(run(base, agreeing, policy(), mlTree).code, 'GAIN');
  const unmatched = [gain(v1, 1000, { mode: 'live', resultsDigest: hex('x') }), gain(v2, 1000, { mode: 'live', resultsDigest: hex('x') })];
  assert.equal(run(base, unmatched, policy(), mlTree).code, 'UNREPRODUCIBLE', 'two ml verifiers who agree with each other but not with the author');
});

/* ------------------------------------------------------------------ precedence */

test('earlier rows win: unclean beats a digest mismatch, a mismatch beats the quorum, the quorum beats a conflict', () => {
  const messy = [gain(v1, 1000, { clean: false }), gain(v2, 1000, { resultsDigest: hex('other') })];
  assert.equal(run(base, messy).code, 'NOT_CLEAN');
  assert.equal(run(base, [gain(v1, 1000, { resultsDigest: hex('o1') }), gain(v2, 1000, { resultsDigest: hex('o2') })]).code, 'RESULTS_MISMATCH');
  assert.equal(run(base, [gain(v1, 1000, { spotCheck: { tasks: ['a'], recordedBp: 1, liveBp: 0, ok: false } })]).code, 'SPOT_CHECK_FAILED', 'before the quorum is even asked');
  assert.equal(run(base, [loss(v1)]).code, 'NEEDS_VERIFIERS');
  assert.equal(run(base, [gain(v1, 5000), loss(v2, -5000)]).code, 'CONFLICT', 'a conflict is reported before the spread is');
});

test('a verdict does not depend on the order attestations arrive in', () => {
  const set = [gain(v1, 1000), gain(v2, 900), noise(v3), gain(v1, 700, { notes: ['x'] }), gain(author), att(v4, { build: hex('z') })];
  const reference = JSON.stringify(run(base, set));
  const permutations = [[0, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 0], [2, 0, 5, 1, 4, 3], [3, 5, 1, 0, 2, 4], [1, 3, 5, 4, 2, 0]];
  for (const order of permutations) assert.equal(JSON.stringify(run(base, order.map((i) => set[i]!))), reference, order.join(','));
});

test('the verdict never changes its inputs', () => {
  const frozenChange = Object.freeze({ id: base.id, body: base.body });
  const atts = Object.freeze([gain(v1), gain(v2)].map((a) => Object.freeze(a)));
  const frozenPolicy = Object.freeze({ ...defaultPolicy(), allowedVerifiers: Object.freeze([]) as unknown as string[] });
  assert.doesNotThrow(() => decide(frozenChange, atts, frozenPolicy, Object.freeze({ domain: 'code' as const })));
});

test('the default policy gives the numbers in the documentation', () => {
  const p = defaultPolicy();
  assert.deepEqual([p.minVerifiers, p.minEffectBp, p.maxVerifierSpanBp, p.bootstrap, p.runs], [2, 300, 600, 2000, 5]);
});
