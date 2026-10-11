import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson, compareCodePoints, idOf } from './canonical.ts';

test('keys are sorted and there is no whitespace', () => {
  assert.equal(canonicalJson({ b: 1, a: [1, 2, { d: null, c: true }] }), '{"a":[1,2,{"c":true,"d":null}],"b":1}');
});

test('key order in the input never changes the output', () => {
  assert.equal(canonicalJson({ x: 1, y: 2, z: 3 }), canonicalJson({ z: 3, x: 1, y: 2 }));
});

test('keys sort by code point, not by UTF-16 unit', () => {
  // U+FFFF is below U+10000 by code point, but above the surrogate 0xD800 that starts U+10000.
  assert.ok(compareCodePoints('￿', '\u{10000}') < 0);
  assert.equal(canonicalJson({ '\u{10000}': 1, '￿': 2 }), '{"￿":2,"\u{10000}":1}');
});

test('frozen vectors', () => {
  assert.equal(idOf({}), '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a');
  assert.equal(idOf({ a: 1 }), '015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862');
  assert.equal(idOf({ z: 'x', a: [1, 2, { b: null }] }), '08c69ec480f6acca635226a38e2debf6d7c167e7a51b57ad1e8d1e060a1841ba');
});

test('only safe integers are allowed', () => {
  for (const bad of [1.5, NaN, Infinity, -0, 2 ** 53]) {
    assert.throws(() => canonicalJson({ n: bad }), /canonical/, String(bad));
  }
  assert.equal(canonicalJson({ n: -7 }), '{"n":-7}');
});

test('values with no stable encoding are refused', () => {
  const bad: unknown[] = [undefined, () => 1, Symbol('s'), 10n, new Date(0), new Map(), new Set(), [1, , 3]];
  for (const value of bad) assert.throws(() => canonicalJson({ v: value }), /canonical/);
  assert.throws(() => canonicalJson({ v: undefined }), /canonical/);
});

test('a runaway nesting is refused rather than overflowing the stack', () => {
  let deep: unknown = 1;
  for (let i = 0; i < 100; i++) deep = [deep];
  assert.throws(() => canonicalJson(deep), /deeper/);
});

test('strings escape the same way JSON does', () => {
  assert.equal(canonicalJson({ s: 'a"b\\c\n\u0001é' }), '{"s":"a\\"b\\\\c\\n\\u0001é"}');
});
