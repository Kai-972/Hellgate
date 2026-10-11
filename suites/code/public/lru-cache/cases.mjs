// Hidden test cases. The agent never sees this file.
export default [
  { name: 'stores and returns values', run: (m, a) => { const c = new m.LruCache(3); c.set('a', 1); c.set('b', 2); a.equal(c.get('a'), 1); a.equal(c.get('b'), 2); a.equal(c.get('zzz'), undefined); a.equal(c.size, 2); } },
  { name: 'evicts the least recently set entry', run: (m, a) => { const c = new m.LruCache(2); c.set('a', 1); c.set('b', 2); c.set('c', 3); a.equal(c.has('a'), false); a.deepEqual(c.keys(), ['b', 'c']); a.equal(c.size, 2); } },
  { name: 'get refreshes an entry', run: (m, a) => { const c = new m.LruCache(2); c.set('a', 1); c.set('b', 2); a.equal(c.get('a'), 1); c.set('c', 3); a.deepEqual(c.keys(), ['a', 'c']); a.equal(c.has('b'), false); } },
  { name: 'has does not refresh', run: (m, a) => { const c = new m.LruCache(2); c.set('a', 1); c.set('b', 2); a.equal(c.has('a'), true); c.set('c', 3); a.deepEqual(c.keys(), ['b', 'c']); } },
  { name: 'a failed get does not disturb the order', run: (m, a) => { const c = new m.LruCache(2); c.set('a', 1); c.set('b', 2); a.equal(c.get('x'), undefined); a.deepEqual(c.keys(), ['a', 'b']); } },
  { name: 'updating a key replaces the value and refreshes it without growing', run: (m, a) => { const c = new m.LruCache(2); c.set('a', 1); c.set('b', 2); c.set('a', 10); a.equal(c.size, 2); a.deepEqual(c.keys(), ['b', 'a']); a.equal(c.get('a'), 10); c.set('c', 3); a.deepEqual(c.keys(), ['a', 'c']); } },
  { name: 'set returns the cache so calls chain', run: (m, a) => { const c = new m.LruCache(3); a.equal(c.set('a', 1), c); a.deepEqual(c.set('b', 2).set('c', 3).keys(), ['a', 'b', 'c']); } },
  { name: 'delete', run: (m, a) => { const c = new m.LruCache(3); c.set('a', 1).set('b', 2); a.equal(c.delete('a'), true); a.equal(c.delete('a'), false); a.equal(c.size, 1); a.deepEqual(c.keys(), ['b']); c.set('c', 3).set('d', 4); a.deepEqual(c.keys(), ['b', 'c', 'd']); } },
  { name: 'keys returns a fresh array', run: (m, a) => { const c = new m.LruCache(2); c.set('a', 1); const k = c.keys(); k.push('x'); a.deepEqual(c.keys(), ['a']); } },
  { name: 'keys follow Map equality', run: (m, a) => { const c = new m.LruCache(5); c.set(NaN, 'n').set(1, 'one').set('1', 'str'); a.equal(c.get(NaN), 'n'); a.equal(c.get(1), 'one'); a.equal(c.get('1'), 'str'); a.equal(c.size, 3); const o = {}; c.set(o, 'obj'); a.equal(c.get({}), undefined); a.equal(c.get(o), 'obj'); } },
  { name: 'an undefined value is still present', run: (m, a) => { const c = new m.LruCache(2); c.set('u', undefined); a.equal(c.has('u'), true); a.equal(c.size, 1); a.equal(c.get('u'), undefined); } },
  { name: 'capacity one', run: (m, a) => { const c = new m.LruCache(1); c.set('a', 1); c.set('b', 2); a.deepEqual(c.keys(), ['b']); a.equal(c.get('a'), undefined); } },
  { name: 'size is read-only and a bad capacity is a RangeError', run: (m, a) => { a.equal(typeof m.LruCache, 'function'); for (const cap of [0, -1, 1.5, NaN, Infinity, '2', undefined, null]) a.throws(() => new m.LruCache(cap), RangeError, String(cap)); const c = new m.LruCache(2); c.set('a', 1); try { c.size = 9; } catch {} a.equal(c.size, 1); } },
];
