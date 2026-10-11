import assert from 'node:assert/strict';
import test from 'node:test';

import { gaussian, mulberry32, shuffle } from '../core/rng.ts';
import { dataRng, learnRng, seedHex, seedInt, taskOrder } from './seeds.ts';

// These vectors were produced by a separate implementation (Python), not by this code.
const SUITE = 'ab'.repeat(32);
const SEED0 = '86beb34aa92541183fcdf145099df4630adb937b99d15897ba475c32515d6bc7';
const SEED1 = '3a774c4b85e4961094a0f4f22917ca999faa127b60261a377698bc6cd2da2d6b';
const IDS = ['slugify', 'parse-duration', 'token-bucket', 'moons', 'chunk', 'Zeta', 'alpha'];

test('seeds derive from the suite and the run index alone', () => {
  assert.equal(seedHex(SUITE, 0), SEED0);
  assert.equal(seedHex(SUITE, 1), SEED1);
  assert.equal(seedInt(SEED0), 113161034);
  assert.notEqual(seedHex(SUITE, 0), seedHex('cd'.repeat(32), 0));
});

test('task order is a seeded permutation of the sorted ids, in code-point order', () => {
  assert.deepEqual(taskOrder(IDS, SEED0), ['Zeta', 'moons', 'alpha', 'chunk', 'token-bucket', 'slugify', 'parse-duration']);
  assert.deepEqual(taskOrder(IDS, SEED1), ['Zeta', 'slugify', 'moons', 'alpha', 'token-bucket', 'parse-duration', 'chunk']);
  assert.deepEqual([...taskOrder(IDS, SEED0)].sort(), [...IDS].sort());
  assert.deepEqual(taskOrder([...IDS].reverse(), SEED0), taskOrder(IDS, SEED0), 'input order does not matter');
  assert.deepEqual(taskOrder([], SEED0), []);
  assert.deepEqual(taskOrder(['only'], SEED0), ['only']);
});

test('mulberry32 and the derived streams match the reference numbers exactly', () => {
  const r = mulberry32(12345);
  assert.deepEqual([r(), r(), r()], [0.9797282677609473, 0.3067522644996643, 0.484205421525985]);
  const d = dataRng(SEED0, 'moons');
  assert.deepEqual([d(), d()], [0.5109247618820518, 0.08426934876479208]);
  const l = learnRng(SEED0, 'moons');
  assert.deepEqual([l(), l()], [0.18457182100974023, 0.664537496631965]);
});

test('streams are independent per task and per purpose', () => {
  assert.notEqual(dataRng(SEED0, 'moons')(), dataRng(SEED0, 'circles')());
  assert.notEqual(dataRng(SEED0, 'moons')(), learnRng(SEED0, 'moons')());
  assert.equal(dataRng(SEED0, 'moons')(), dataRng(SEED0, 'moons')());
});

test('draws stay in [0, 1)', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 10_000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
  }
});

test('gaussian has roughly zero mean and unit variance, and shuffle is a permutation', () => {
  const r = mulberry32(99);
  const xs = Array.from({ length: 20_000 }, () => gaussian(r));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  assert.ok(Math.abs(mean) < 0.03, `mean ${mean}`);
  assert.ok(Math.abs(variance - 1) < 0.05, `variance ${variance}`);
  const items = Array.from({ length: 50 }, (_, i) => i);
  const shuffled = shuffle([...items], mulberry32(1));
  assert.deepEqual([...shuffled].sort((a, b) => a - b), items);
  assert.notDeepEqual(shuffled, items);
});
