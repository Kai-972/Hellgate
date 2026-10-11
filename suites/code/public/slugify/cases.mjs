// Hidden test cases. The agent never sees this file.
export default [
  { name: 'basic text', run: (m, a) => a.equal(m.slugify('Hello, World!'), 'hello-world') },
  { name: 'runs of separators collapse to one hyphen', run: (m, a) => a.equal(m.slugify('a  --  b__c'), 'a-b-c') },
  { name: 'leading and trailing hyphens are removed', run: (m, a) => a.equal(m.slugify('  --Already--slugged--  '), 'already-slugged') },
  { name: 'accents are removed', run: (m, a) => {
    a.equal(m.slugify('Crème Brûlée'), 'creme-brulee');
    a.equal(m.slugify('Ünïcödé Fïlé'), 'unicode-file');
  } },
  { name: 'compatibility forms use NFKD', run: (m, a) => a.equal(m.slugify('ﬁne ﬂour'), 'fine-flour') },
  { name: 'digits are kept', run: (m, a) => a.equal(m.slugify('Top 10 Tips of 2024'), 'top-10-tips-of-2024') },
  { name: 'other alphabets and symbols become separators', run: (m, a) => {
    a.equal(m.slugify('日本語'), '');
    a.equal(m.slugify('!!!'), '');
    a.equal(m.slugify('Tokyo 東京 Tower'), 'tokyo-tower');
  } },
  { name: 'maxLength cuts and re-trims', run: (m, a) => {
    a.equal(m.slugify('Hello World', { maxLength: 6 }), 'hello');
    a.equal(m.slugify('hello-world', { maxLength: 5 }), 'hello');
    a.equal(m.slugify('abcdef', { maxLength: 3 }), 'abc');
    a.equal(m.slugify('abc', { maxLength: 10 }), 'abc');
  } },
  { name: 'no maxLength never cuts', run: (m, a) => a.equal(m.slugify('a'.repeat(300)).length, 300) },
  { name: 'a non-string throws TypeError', run: (m, a) => {
    a.equal(typeof m.slugify, 'function'); // calling a missing function also throws a TypeError
    for (const bad of [42, null, undefined, {}, ['a']]) a.throws(() => m.slugify(bad), TypeError);
  } },
  { name: 'a bad maxLength throws RangeError', run: (m, a) => {
    for (const bad of [0, -1, 2.5, '5', NaN, Infinity]) a.throws(() => m.slugify('abc', { maxLength: bad }), RangeError);
  } },
  { name: 'an absent maxLength is fine', run: (m, a) => {
    a.equal(m.slugify('A b', {}), 'a-b');
    a.equal(m.slugify('A b', { maxLength: undefined }), 'a-b');
  } },
];
