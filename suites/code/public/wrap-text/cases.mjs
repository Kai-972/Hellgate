// Hidden test cases. The agent never sees this file.
export default [
  { name: 'packs words greedily', run: (m, a) => { a.deepEqual(m.wrapText('the quick brown fox', 10), ['the quick', 'brown fox']); a.deepEqual(m.wrapText('aaa bbb ccc ddd', 7), ['aaa bbb', 'ccc ddd']); } },
  { name: 'a line may be exactly the width', run: (m, a) => { a.deepEqual(m.wrapText('abc def', 7), ['abc def']); a.deepEqual(m.wrapText('abc def', 6), ['abc', 'def']); } },
  { name: 'whitespace only separates words', run: (m, a) => { a.deepEqual(m.wrapText('a  b\n\nc', 3), ['a b', 'c']); a.deepEqual(m.wrapText('  lead and trail  ', 20), ['lead and trail']); a.deepEqual(m.wrapText('a\tb', 5), ['a b']); } },
  { name: 'text with no words gives no lines', run: (m, a) => { a.deepEqual(m.wrapText('', 5), []); a.deepEqual(m.wrapText(' \n\t ', 5), []); } },
  { name: 'a long word is cut into pieces of the width', run: (m, a) => { a.deepEqual(m.wrapText('abcdefgh', 3), ['abc', 'def', 'gh']); a.deepEqual(m.wrapText('abcdef', 3), ['abc', 'def']); } },
  { name: 'a long word starts on a new line', run: (m, a) => { a.deepEqual(m.wrapText('hi abcdefgh', 5), ['hi', 'abcde', 'fgh']); } },
  { name: 'following words continue after the last piece', run: (m, a) => { a.deepEqual(m.wrapText('abcdefgh ij', 3), ['abc', 'def', 'gh', 'ij']); a.deepEqual(m.wrapText('abcdefg h', 4), ['abcd', 'efg', 'h']); a.deepEqual(m.wrapText('abcde f', 3), ['abc', 'de', 'f']); } },
  { name: 'width one', run: (m, a) => { a.deepEqual(m.wrapText('ab c', 1), ['a', 'b', 'c']); } },
  { name: 'a single word that fits', run: (m, a) => { a.deepEqual(m.wrapText('word', 4), ['word']); a.deepEqual(m.wrapText('word', 80), ['word']); } },
  { name: 'rejects a bad width', run: (m, a) => { a.equal(typeof m.wrapText, 'function'); for (const w of [0, -1, 2.5, NaN, Infinity, '5', undefined]) a.throws(() => m.wrapText('abc', w), RangeError, String(w)); } },
  { name: 'rejects a non-string, checked before the width', run: (m, a) => { a.equal(typeof m.wrapText, 'function'); a.throws(() => m.wrapText(5, 3), TypeError); a.throws(() => m.wrapText(undefined, 0), TypeError); } },
];
