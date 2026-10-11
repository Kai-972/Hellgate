/**
 * Checks on the real pilot tasks in `suites/`: that their cases are fair (a correct solution passes
 * every one), that they discriminate (plausible but careless solutions fail some), and that the
 * machine-learning data is deterministic, well-formed and learnable.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { codeBrief, loadSuite, type LoadedTask } from './loader.ts';
import { generateMlData, mlView, scorePredictions } from './mldata.ts';
import { seedHex } from './seeds.ts';
import type { CodeTaskMeta, MlTaskMeta } from './tasks.ts';
import { loadCases, runCases } from './validate.ts';

const SUITES = new URL('../../../suites/', import.meta.url).pathname;
const code = loadSuite(join(SUITES, 'code', 'public'), 'code');
const ml = loadSuite(join(SUITES, 'ml', 'public'), 'ml');
const reference = (id: string): string => join(SUITES, 'code', 'reference', `${id}.mjs`);
const task = (id: string): LoadedTask<CodeTaskMeta> => code.tasks.find((t) => t.id === id)!;

function temp(source: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'hg-sol-')), 'solution.mjs');
  writeFileSync(path, source);
  return path;
}

/* ------------------------------------------------------------------ code tasks */

test('the code suite has sixteen tasks in five use cases', () => {
  assert.deepEqual(code.tasks.map((t) => t.id), [
    'array-utils', 'deep-equal', 'format-bytes', 'group-by', 'lru-cache', 'merge-intervals', 'parse-csv-line', 'parse-duration',
    'query-string', 'roman-numerals', 'semver-compare', 'slugify', 'snake-case', 'title-case', 'token-bucket', 'wrap-text',
  ]);
  assert.deepEqual(code.groups.map((g) => [g.id, g.tasks.length]), [['collections', 3], ['formatting', 1], ['algorithms', 4], ['parsing', 4], ['strings', 4]]);
  assert.equal(code.id.length, 64);
  const names = code.tasks.flatMap((t) => t.id);
  assert.equal(new Set(names).size, 16);
});

test('every reference solution passes every case, and each task has at least 8 cases', async () => {
  for (const t of code.tasks) {
    const results = await runCases(t, reference(t.id));
    const failed = results.filter((r) => !r.passed);
    assert.deepEqual(failed, [], `${t.id}: ${failed.map((f) => `${f.name}: ${f.error}`).join(' | ')}`);
    assert.ok(results.length >= 8, `${t.id} has only ${results.length} cases`);
  }
});

test('an empty solution fails every case of every task', async () => {
  for (const t of code.tasks) {
    const results = await runCases(t, temp('export const nothing = 1;\n'));
    assert.equal(results.filter((r) => r.passed).length, 0, t.id);
  }
});

test('plausible but careless solutions fail some cases, so the tasks discriminate', async () => {
  const careless: Record<string, string[]> = {
    slugify: [
      // no normalisation, no trimming, no validation
      `export function slugify(t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-'); }\n`,
      // normalises with NFD instead of NFKD
      `export function slugify(t, o) { if (typeof t !== 'string') throw new TypeError('x');
        let s = t.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (o && o.maxLength !== undefined) s = s.slice(0, o.maxLength); return s; }\n`,
    ],
    'parse-duration': [
      // parseFloat-based, no validation
      `export function parseDuration(s) { return Math.round(parseFloat(s) * 1000); }\n`,
      // matches m before ms, never rejects duplicates
      `export function parseDuration(s) { if (typeof s !== 'string') throw new TypeError('x'); const U = { m: 60000, ms: 1, s: 1000, h: 3600000, d: 86400000, w: 604800000 };
        let t = 0; for (const m of s.matchAll(/(\\d+(?:\\.\\d+)?)(m|ms|s|h|d|w)/g)) t += Number(m[1]) * U[m[2]]; return Math.round(t); }\n`,
    ],
    'token-bucket': [
      // lets time run backwards and refuses nothing it should not
      `export class TokenBucket { constructor(c, r, s = 0) { this.c = c; this.r = r; this.t = c; this.l = s; }
        fill(n) { this.t = Math.min(this.c, this.t + ((n - this.l) / 1000) * this.r); this.l = n; }
        tryTake(k, n) { this.fill(n); if (k > this.t) return false; this.t -= k; return true; }
        available(n) { this.fill(n); return this.t; } }\n`,
    ],
  };
  for (const [id, sources] of Object.entries(careless)) {
    for (const source of sources) {
      const results = await runCases(task(id), temp(source));
      const failed = results.filter((r) => !r.passed).length;
      assert.ok(failed >= 1, `${id}: a careless solution passed every case`);
      assert.ok(failed < results.length, `${id}: the careless solution should still pass something, or the test proves nothing`);
    }
  }
});

test('the briefs of the real tasks never contain a line from their hidden cases', async () => {
  for (const t of code.tasks) {
    const brief = JSON.stringify(codeBrief(t));
    const caseLines = t.files['cases.mjs']!.split('\n').map((l) => l.trim()).filter((l) => l.length > 24);
    for (const line of caseLines) assert.equal(brief.includes(line), false, `${t.id} brief leaks: ${line}`);
    const cases = await loadCases(t);
    for (const c of cases) assert.equal(brief.includes(`'${c.name}'`), false, `${t.id} brief names a hidden case: ${c.name}`);
  }
});

/* ------------------------------------------------------------------ ml tasks */

const mlTask = (id: string): LoadedTask<MlTaskMeta> => ml.tasks.find((t) => t.id === id)!;
const SEED = seedHex(ml.id, 0);

test('the ml suite has twelve tasks in four use cases of three', () => {
  assert.deepEqual(ml.tasks.map((t) => t.id), [
    'circles', 'imbalanced-blobs', 'imbalanced-moons', 'imbalanced-rings', 'moons', 'noisy-parabola',
    'noisy-sine', 'noisy-wave', 'scaled-blobs', 'scaled-moons', 'scaled-regression', 'spirals',
  ]);
  assert.deepEqual(ml.groups.map((g) => [g.id, g.tasks.length]), [
    ['nonlinear-classification', 3], ['imbalanced-classes', 3], ['noisy-regression', 3], ['badly-scaled-features', 3],
  ]);
});

test('generated data is deterministic, well-formed, and differs between seeds and tasks', async () => {
  for (const t of ml.tasks) {
    const a = await generateMlData(t, SEED);
    const b = await generateMlData(t, SEED);
    assert.deepEqual(a, b, `${t.id} is not deterministic`);
    assert.equal(a.trainX.length, t.meta.trainSize);
    assert.equal(a.testX.length, t.meta.testSize);
    assert.notDeepEqual(a, await generateMlData(t, seedHex(ml.id, 1)), `${t.id}: two seeds gave the same data`);
  }
  assert.notDeepEqual((await generateMlData(mlTask('moons'), SEED)).trainX, (await generateMlData(mlTask('scaled-blobs'), SEED)).trainX);
});

test('the learner view carries the train set and the test inputs, and never the test labels', async () => {
  const t = mlTask('moons');
  const data = await generateMlData(t, SEED);
  const view = mlView(t, data);
  assert.equal(view.train.x.length, 200);
  assert.equal(view.testX.length, 200);
  assert.deepEqual(Object.keys(view).sort(), ['budgetMs', 'classes', 'features', 'id', 'kind', 'testX', 'title', 'train']);
  assert.equal('testY' in view, false);
  assert.equal(JSON.stringify(view).includes(JSON.stringify(data.testY)), false);
});

test('classification tasks are balanced and scoring follows the protocol', async () => {
  for (const id of ['moons', 'scaled-blobs']) {
    const t = mlTask(id);
    const d = await generateMlData(t, SEED);
    const ones = d.testY.filter((y) => y === 1).length;
    assert.ok(ones >= 90 && ones <= 110, `${id}: ${ones} of 200 test points are class 1`);
    assert.equal(scorePredictions(t.meta, d.testY, d.testY).every(Boolean), true);
    assert.equal(scorePredictions(t.meta, d.testY.map((y) => 1 - y), d.testY).some(Boolean), false);
    assert.equal(scorePredictions(t.meta, [0.4], [0]).every(Boolean), true, 'a prediction of 0.4 rounds to class 0');
    assert.equal(scorePredictions(t.meta, [NaN], [0])[0], false);
    assert.equal(scorePredictions(t.meta, [], [0])[0], false, 'a missing prediction is wrong');
  }
  const reg = mlTask('noisy-sine').meta;
  assert.deepEqual(scorePredictions(reg, [0.1, 0.3, -0.1], [0, 0, 0.25]), [true, false, false]);
});

/** A plain k-nearest-neighbours learner, to show the data is learnable by a standard method. */
function knn(trainX: number[][], trainY: number[], testX: number[][], k: number, scale: number[]): number[] {
  return testX.map((q) => {
    const d = trainX.map((p, i) => ({ i, d: p.reduce((s, v, j) => s + ((v - q[j]!) / scale[j]!) ** 2, 0) }));
    d.sort((a, b) => a.d - b.d);
    const near = d.slice(0, k).map((e) => trainY[e.i]!);
    return near.reduce((a, b) => a + b, 0) / k;
  });
}

test('the data is learnable: a nearest-neighbour learner scores well, a constant learner does not', async () => {
  for (const [id, scale] of [['moons', [1, 1]], ['scaled-blobs', [1, 1000]]] as const) {
    const t = mlTask(id);
    const d = await generateMlData(t, SEED);
    const knnPred = knn(d.trainX, d.trainY, d.testX, 7, [...scale]).map((p) => (p >= 0.5 ? 1 : 0));
    const good = scorePredictions(t.meta, knnPred, d.testY).filter(Boolean).length / d.testY.length;
    const constant = scorePredictions(t.meta, d.testY.map(() => 1), d.testY).filter(Boolean).length / d.testY.length;
    assert.ok(good > 0.85, `${id}: knn only scored ${good}`);
    assert.ok(constant > 0.4 && constant < 0.6, `${id}: a constant learner scored ${constant}`);
  }
  const t = mlTask('noisy-sine');
  const d = await generateMlData(t, SEED);
  const pred = knn(d.trainX, d.trainY, d.testX, 9, [1]);
  const good = scorePredictions(t.meta, pred, d.testY).filter(Boolean).length / d.testY.length;
  const zero = scorePredictions(t.meta, d.testY.map(() => 0), d.testY).filter(Boolean).length / d.testY.length;
  assert.ok(good > 0.75, `noisy-sine: knn only scored ${good}`);
  assert.ok(zero < 0.3, `noisy-sine: predicting zero scored ${zero}`);
});

test('a generator that returns bad data is rejected with a clear error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hg-ml-'));
  const make = (source: string): LoadedTask<MlTaskMeta> => {
    const taskDir = mkdtempSync(join(dir, 't-'));
    writeFileSync(join(taskDir, 'data.mjs'), source);
    return { id: 'bad', dir: taskDir, files: {}, meta: { ...mlTask('moons').meta, id: 'bad', trainSize: 10, testSize: 10 } };
  };
  const rows = (n: number, v: unknown) => `Array.from({ length: ${n} }, () => ${v})`;
  await assert.rejects(generateMlData(make('export const generate = 1;\n'), SEED), /does not export generate/);
  await assert.rejects(generateMlData(make(`export function generate() { return { trainX: ${rows(9, '[0,0]')}, trainY: ${rows(10, 0)}, testX: ${rows(10, '[0,0]')}, testY: ${rows(10, 0)} }; }\n`), SEED), /trainX with 10 rows/);
  await assert.rejects(generateMlData(make(`export function generate() { return { trainX: ${rows(10, '[0,NaN]')}, trainY: ${rows(10, 0)}, testX: ${rows(10, '[0,0]')}, testY: ${rows(10, 0)} }; }\n`), SEED), /finite numbers/);
  await assert.rejects(generateMlData(make(`export function generate() { return { trainX: ${rows(10, '[0,0]')}, trainY: ${rows(10, 5)}, testX: ${rows(10, '[0,0]')}, testY: ${rows(10, 0)} }; }\n`), SEED), /label outside/);
});
