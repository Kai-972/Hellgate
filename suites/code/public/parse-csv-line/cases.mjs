// Hidden test cases. The agent never sees this file.
const bad = (m, a, lines) => { a.equal(typeof m.parseCsvLine, 'function'); for (const l of lines) a.throws(() => m.parseCsvLine(l), RangeError, JSON.stringify(l)); };
export default [
  { name: 'plain fields', run: (m, a) => { a.deepEqual(m.parseCsvLine('a,b,c'), ['a', 'b', 'c']); a.deepEqual(m.parseCsvLine('one'), ['one']); } },
  { name: 'empty fields and empty lines', run: (m, a) => { a.deepEqual(m.parseCsvLine('a,,c'), ['a', '', 'c']); a.deepEqual(m.parseCsvLine(''), ['']); a.deepEqual(m.parseCsvLine(','), ['', '']); a.deepEqual(m.parseCsvLine('a,'), ['a', '']); a.deepEqual(m.parseCsvLine(',,'), ['', '', '']); } },
  { name: 'whitespace is not trimmed', run: (m, a) => { a.deepEqual(m.parseCsvLine(' a , b '), [' a ', ' b ']); a.deepEqual(m.parseCsvLine('   '), ['   ']); a.deepEqual(m.parseCsvLine('a,\t'), ['a', '\t']); } },
  { name: 'quoted fields hold commas', run: (m, a) => { a.deepEqual(m.parseCsvLine('a,"b,c",d'), ['a', 'b,c', 'd']); a.deepEqual(m.parseCsvLine('"x,y"'), ['x,y']); } },
  { name: 'doubled quotes are one quote', run: (m, a) => { a.deepEqual(m.parseCsvLine('"say ""hi""",x'), ['say "hi"', 'x']); a.deepEqual(m.parseCsvLine('""""'), ['"']); a.deepEqual(m.parseCsvLine('"a""b"'), ['a"b']); } },
  { name: 'a quoted empty field', run: (m, a) => { a.deepEqual(m.parseCsvLine('""'), ['']); a.deepEqual(m.parseCsvLine('a,"",c'), ['a', '', 'c']); } },
  { name: 'a quoted field may hold a newline', run: (m, a) => { a.deepEqual(m.parseCsvLine('"line1\nline2",x'), ['line1\nline2', 'x']); } },
  { name: 'quotes keep surrounding space inside', run: (m, a) => { a.deepEqual(m.parseCsvLine('" a ",b'), [' a ', 'b']); } },
  { name: 'a quote inside an unquoted field is an error', run: (m, a) => bad(m, a, ['a"b', 'ab"', 'a,b"c,d']) },
  { name: 'an unclosed quote is an error', run: (m, a) => bad(m, a, ['"abc', 'a,"b', '"a""', '"']) },
  { name: 'text after a closing quote is an error', run: (m, a) => bad(m, a, ['"a"b', '"a" ,b', 'x,"a"y']) },
  { name: 'rejects non-strings', run: (m, a) => { a.equal(typeof m.parseCsvLine, 'function'); for (const v of [undefined, null, 5, ['a']]) a.throws(() => m.parseCsvLine(v), TypeError); } },
];
