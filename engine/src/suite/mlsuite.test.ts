/**
 * The `ml` domain's content: the twelve-task suite, the genesis learner, and the ready-made changes in
 * `scenarios/ml/`. These tests check that the pieces fit the protocol. The slow test at the end
 * (`HELLGATE_SLOW=1`) re-measures every scenario and checks that each one comes out as documented.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { runBatch, scoresOf } from '../measure/batch.ts';
import { mlRunner } from '../measure/domains.ts';
import { buildBody, parseRecord } from '../ledger/records.ts';
import { runMlTask } from '../sandbox/learner.ts';
import type { JailFile } from '../sandbox/workdir.ts';
import { loadSuite } from './loader.ts';
import { generateMlData, scorePredictions } from './mldata.ts';
import { seedHex } from './seeds.ts';

const ROOT = new URL('../../../', import.meta.url).pathname;
const ml = loadSuite(join(ROOT, 'suites', 'ml', 'public'), 'ml');

/** The `.ts` files of a learner folder, as a build's `files` map. */
function learnerFiles(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.ts')).sort()) files[`learner/${name}`] = readFileSync(join(dir, name), 'utf8');
  return files;
}
const asJail = (files: Record<string, string>): JailFile[] => Object.entries(files).map(([path, contents]) => ({ path, contents }));

const genesis = learnerFiles(join(ROOT, 'learner'));
const SCENARIOS = ['standardise', 'momentum', 'adam', 'lr-decay', 'lr-nudge', 'balance'] as const;
const scenario = (name: string): Record<string, string> => learnerFiles(join(ROOT, 'scenarios', 'ml', name, 'learner'));

/** Which files differ from the genesis build, by name. */
function changedFiles(files: Record<string, string>): string[] {
  const names = new Set([...Object.keys(genesis), ...Object.keys(files)]);
  return [...names].filter((n) => genesis[n] !== files[n]).sort();
}

/* ------------------------------------------------------------------ the data */

test('the imbalanced tasks are imbalanced in training and balanced in testing', async () => {
  for (const t of ml.tasks.filter((x) => x.meta.group === 'imbalanced-classes')) {
    const d = await generateMlData(t, seedHex(ml.id, 0));
    const share = (ys: number[]) => ys.filter((y) => y === 1).length / ys.length;
    assert.ok(Math.abs(share(d.trainY) - 0.1) < 0.005, `${t.id}: ${share(d.trainY)} of train is class 1`);
    assert.ok(Math.abs(share(d.testY) - 0.5) < 0.005, `${t.id}: ${share(d.testY)} of test is class 1`);
  }
});

test('a learner that always picks the common class scores about half on a balanced test set', async () => {
  for (const t of ml.tasks.filter((x) => x.meta.kind === 'classification')) {
    const d = await generateMlData(t, seedHex(ml.id, 2));
    const accuracy = scorePredictions(t.meta, d.testY.map(() => 0), d.testY).filter(Boolean).length / d.testY.length;
    assert.ok(accuracy > 0.45 && accuracy < 0.55, `${t.id}: ${accuracy}`);
  }
});

test('badly scaled tasks really are badly scaled, and the others are not', async () => {
  const spread = (xs: number[][], f: number) => Math.max(...xs.map((r) => r[f]!)) - Math.min(...xs.map((r) => r[f]!));
  for (const t of ml.tasks) {
    const d = await generateMlData(t, seedHex(ml.id, 0));
    const widths = Array.from({ length: t.meta.features }, (_, f) => spread(d.trainX, f));
    const ratio = Math.max(...widths) / Math.min(...widths);
    if (t.meta.group === 'badly-scaled-features') assert.ok(ratio > 100, `${t.id}: feature ranges differ by only ${ratio}`);
    else assert.ok(ratio < 5, `${t.id}: feature ranges differ by ${ratio}`);
  }
});

/* ------------------------------------------------------------------ the genesis learner and the scenarios */

test('the genesis learner and every scenario are valid builds, with a frozen contract', () => {
  const builds: [string, Record<string, string>][] = [['genesis', genesis], ...SCENARIOS.map((s): [string, Record<string, string>] => [s, scenario(s)])];
  for (const [name, files] of builds) {
    const parsed = parseRecord({ body: buildBody(files) });
    assert.equal(parsed.ok, true, `${name}: ${parsed.ok ? '' : parsed.reason}`);
    assert.equal(files['learner/contract.ts'], genesis['learner/contract.ts'], `${name} changed the frozen contract`);
    assert.ok(Object.values(files).every((c) => c.length < 40_000));
  }
  assert.deepEqual(Object.keys(genesis), ['learner/contract.ts', 'learner/index.ts', 'learner/model.ts', 'learner/optim.ts', 'learner/prep.ts', 'learner/schedule.ts']);
});

test('each scenario is one small idea: it changes only the files that idea lives in', () => {
  assert.deepEqual(changedFiles(scenario('standardise')), ['learner/prep.ts']);
  assert.deepEqual(changedFiles(scenario('momentum')), ['learner/optim.ts']);
  assert.deepEqual(changedFiles(scenario('adam')), ['learner/index.ts', 'learner/optim.ts']);
  assert.deepEqual(changedFiles(scenario('lr-decay')), ['learner/schedule.ts']);
  assert.deepEqual(changedFiles(scenario('lr-nudge')), ['learner/index.ts']);
  assert.deepEqual(changedFiles(scenario('balance')), ['learner/balance.ts', 'learner/index.ts']);
  const nudge = changedFiles(scenario('lr-nudge'));
  assert.equal(nudge.length, 1);
  assert.match(scenario('lr-nudge')['learner/index.ts']!, /BASE_RATE = 0\.055/);
});

test('the genesis learner runs every task in the sandbox, is deterministic, and starts inside the target band', async () => {
  const seed = seedHex(ml.id, 0);
  const files = asJail(genesis);
  const outcomes = [];
  for (const t of ml.tasks) outcomes.push(await runMlTask(files, t, seed));
  assert.ok(outcomes.every((o) => o.status === 'ok' && o.clean), JSON.stringify(outcomes.filter((o) => o.status !== 'ok')));
  const score = outcomes.reduce((sum, o) => sum + o.cases.filter(Boolean).length / o.cases.length, 0) / outcomes.length;
  assert.ok(score > 0.4 && score < 0.7, `the baseline scored ${score}; the target band is 40% to 70%`);

  const again = await runMlTask(files, ml.tasks.find((t) => t.id === 'moons')!, seed);
  assert.deepEqual(again.cases, outcomes[ml.tasks.findIndex((t) => t.id === 'moons')]!.cases, 'the same seed gives the same predictions');
});

test('the learner trains for real: the same learner scores far above chance on an easy task and fails an impossible one', async () => {
  const seed = seedHex(ml.id, 3);
  const accuracy = async (id: string) => {
    const o = await runMlTask(asJail(genesis), ml.tasks.find((t) => t.id === id)!, seed);
    return o.cases.filter(Boolean).length / o.cases.length;
  };
  assert.ok((await accuracy('moons')) > 0.8);
  assert.ok((await accuracy('scaled-regression')) < 0.3, 'plain SGD on features in the thousands cannot learn');
});

/* ------------------------------------------------------------------ the slow check */

test('every scenario comes out as documented when re-measured', { skip: process.env.HELLGATE_SLOW ? false : 'set HELLGATE_SLOW=1 to re-measure every scenario' }, async () => {
  const measure = async (files: Record<string, string>) => {
    const batch = await runBatch({ suiteId: ml.id, taskIds: ml.tasks.map((t) => t.id), runs: 3, lanes: 2, runTask: mlRunner(ml, files) });
    const means = scoresOf(batch).taskMeansBp;
    const group = (g: string) => Math.round(ml.groups.find((x) => x.id === g)!.tasks.reduce((s, id) => s + means[id]!, 0) / 3);
    const total = Math.round(Object.values(means).reduce((a, b) => a + b, 0) / ml.tasks.length);
    return { total, imbalanced: group('imbalanced-classes'), scaled: group('badly-scaled-features'), nonlinear: group('nonlinear-classification') };
  };
  const base = await measure(genesis);
  // One after another: batches that run at the same time would only compete for the two cores.
  const m: Record<string, Awaited<ReturnType<typeof measure>>> = {};
  for (const s of SCENARIOS) m[s] = await measure(scenario(s));
  assert.ok(m.standardise!.total - base.total > 1000, 'standardising features is a large gain');
  assert.ok(m.standardise!.scaled - base.scaled > 3000, '… and it is the badly-scaled use case that gains');
  assert.ok(m.adam!.total - base.total > 500, 'Adam gains');
  assert.ok(m.adam!.scaled > base.scaled, 'Adam beats plain SGD on badly scaled features');
  assert.ok(m.momentum!.total - base.total > 500, 'momentum gains');
  assert.ok(m['lr-decay']!.total < base.total, 'a cosine decay hurts this underfit baseline');
  assert.ok(Math.abs(m['lr-nudge']!.total - base.total) < 300, 'a ten percent nudge is below the minimum effect');
  assert.ok(m.balance!.imbalanced - base.imbalanced > 1500, 'rebalancing gains on the imbalanced use case');
  assert.ok(Math.abs(m.balance!.nonlinear - base.nonlinear) < 300 && Math.abs(m.balance!.scaled - base.scaled) < 300, '… and nowhere else');
});
