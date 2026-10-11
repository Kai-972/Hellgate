// Hidden test cases. The agent never sees this file.
export default [
  { name: 'basic pairs', run: (m, a) => { a.deepEqual({ ...m.parseQuery('a=1&b=2') }, { a: '1', b: '2' }); a.deepEqual({ ...m.parseQuery('?a=1&b=2') }, { a: '1', b: '2' }); } },
  { name: 'empty input and empty pairs', run: (m, a) => { a.deepEqual({ ...m.parseQuery('') }, {}); a.deepEqual({ ...m.parseQuery('?') }, {}); a.deepEqual({ ...m.parseQuery('a=1&&b=2&') }, { a: '1', b: '2' }); a.deepEqual({ ...m.parseQuery('&&') }, {}); } },
  { name: 'a pair without = or with an empty side', run: (m, a) => { a.deepEqual({ ...m.parseQuery('flag&n=') }, { flag: '', n: '' }); a.deepEqual({ ...m.parseQuery('=x') }, { '': 'x' }); } },
  { name: 'the first = splits the pair', run: (m, a) => { a.deepEqual({ ...m.parseQuery('a=b=c') }, { a: 'b=c' }); a.deepEqual({ ...m.parseQuery('token=abc==') }, { token: 'abc==' }); } },
  { name: 'plus is a space and percent-escapes are decoded', run: (m, a) => { a.deepEqual({ ...m.parseQuery('q=hello+world%21') }, { q: 'hello world!' }); a.deepEqual({ ...m.parseQuery('n=caf%C3%A9') }, { n: 'café' }); a.deepEqual({ ...m.parseQuery('a%20b=c+d') }, { 'a b': 'c d' }); } },
  { name: 'decoding happens after splitting', run: (m, a) => { a.deepEqual({ ...m.parseQuery('a=1%262&b=%3D') }, { a: '1&2', b: '=' }); a.deepEqual({ ...m.parseQuery('k%3Dv=1') }, { 'k=v': '1' }); } },
  { name: 'repeated keys give arrays in order', run: (m, a) => { a.deepEqual({ ...m.parseQuery('a=1&a=2&a=3') }, { a: ['1', '2', '3'] }); a.deepEqual({ ...m.parseQuery('a=1&b=x&a=2') }, { a: ['1', '2'], b: 'x' }); } },
  { name: 'a key ending in [] is always an array', run: (m, a) => { a.deepEqual({ ...m.parseQuery('tag[]=x') }, { tag: ['x'] }); a.deepEqual({ ...m.parseQuery('t[]=1&t[]=2') }, { t: ['1', '2'] }); a.deepEqual({ ...m.parseQuery('t=1&t[]=2') }, { t: ['1', '2'] }); a.deepEqual({ ...m.parseQuery('t[]=1&t=2') }, { t: ['1', '2'] }); } },
  { name: 'the result has no prototype', run: (m, a) => { const r = m.parseQuery('__proto__=1&constructor=2'); a.equal(Object.getPrototypeOf(r), null); a.equal(r.__proto__, '1'); a.equal(r.constructor, '2'); a.deepEqual(Object.keys(r), ['__proto__', 'constructor']); } },
  { name: 'keys keep their first-seen order', run: (m, a) => { a.deepEqual(Object.keys(m.parseQuery('b=1&a=2&b=3&c=4')), ['b', 'a', 'c']); } },
  { name: 'malformed escapes are an error', run: (m, a) => { a.equal(typeof m.parseQuery, 'function'); for (const q of ['a=%', 'a=%zz', 'a=%E0%A4%A', '%=1']) a.throws(() => m.parseQuery(q), RangeError, q); } },
  { name: 'rejects non-strings', run: (m, a) => { a.equal(typeof m.parseQuery, 'function'); for (const v of [undefined, null, 5, {}]) a.throws(() => m.parseQuery(v), TypeError); } },
];
