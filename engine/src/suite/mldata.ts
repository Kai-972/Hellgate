/**
 * Running a task's hidden data generator (`data.mjs`) in the PARENT process, and checking what it
 * returns before anything trusts it.
 *
 * The generator is trusted task code, written by us. The learner never sees it and never sees the
 * test labels it returns: those stay with the parent, which scores the learner's predictions.
 */
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

import { HellgateError } from '../core/errors.ts';
import { dataRng } from './seeds.ts';
import type { LoadedTask } from './loader.ts';
import type { MlData, MlTaskMeta, MlTaskView } from './tasks.ts';

type Generate = (rng: () => number, size: { trainSize: number; testSize: number }) => unknown;

const isFiniteRow = (row: unknown, width: number): row is number[] =>
  Array.isArray(row) && row.length === width && row.every((v) => typeof v === 'number' && Number.isFinite(v));

/** Generate the data for one task in one run. The same seed always gives the same data. */
export async function generateMlData(task: LoadedTask<MlTaskMeta>, seed: string): Promise<MlData> {
  const url = pathToFileURL(join(task.dir, 'data.mjs')).href;
  const mod = (await import(url)) as { generate?: Generate };
  if (typeof mod.generate !== 'function') throw new HellgateError('integrity', `task ${task.id}: data.mjs does not export generate()`);
  const { trainSize, testSize, features, kind, classes } = task.meta;
  const raw = mod.generate(dataRng(seed, task.id), { trainSize, testSize }) as Partial<MlData> | null;
  const fail = (why: string): never => {
    throw new HellgateError('integrity', `task ${task.id}: generate() ${why}`);
  };
  if (raw === null || typeof raw !== 'object') return fail('did not return an object');
  const { trainX, trainY, testX, testY } = raw;
  if (!Array.isArray(trainX) || trainX.length !== trainSize) fail(`must return trainX with ${trainSize} rows`);
  if (!Array.isArray(testX) || testX.length !== testSize) fail(`must return testX with ${testSize} rows`);
  if (!Array.isArray(trainY) || trainY.length !== trainSize) fail('must return one trainY per train row');
  if (!Array.isArray(testY) || testY.length !== testSize) fail('must return one testY per test row');
  for (const row of [...trainX!, ...testX!]) if (!isFiniteRow(row, features)) fail(`has a row that is not ${features} finite numbers`);
  for (const y of [...trainY!, ...testY!]) {
    if (typeof y !== 'number' || !Number.isFinite(y)) fail('has a label that is not a finite number');
    if (kind === 'classification' && (!Number.isInteger(y) || y < 0 || y >= classes!)) fail(`has a label outside 0 … ${classes! - 1}`);
  }
  return { trainX: trainX!, trainY: trainY!, testX: testX!, testY: testY! };
}

/** What the learner is given: the train set and the test inputs. Not the test labels. */
export function mlView(task: LoadedTask<MlTaskMeta>, data: MlData): MlTaskView {
  const m = task.meta;
  return {
    id: m.id,
    title: m.title,
    kind: m.kind,
    features: m.features,
    ...(m.classes !== undefined ? { classes: m.classes } : {}),
    ...(m.tolerance !== undefined ? { tolerance: m.tolerance } : {}),
    train: { x: data.trainX, y: data.trainY },
    testX: data.testX,
    budgetMs: m.budgetMs,
  };
}

/** Count correct predictions, as the scorer will (PROTOCOL §13.2). Returns one boolean per test point. */
export function scorePredictions(meta: MlTaskMeta, predictions: readonly number[], testY: readonly number[]): boolean[] {
  return testY.map((truth, j) => {
    const p = predictions[j];
    if (p === undefined || !Number.isFinite(p)) return false;
    return meta.kind === 'classification' ? Math.round(p) === truth : Math.abs(p - truth) <= meta.tolerance!;
  });
}
