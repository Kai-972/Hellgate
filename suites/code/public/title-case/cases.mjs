// Hidden test cases. The agent never sees this file.
const bad = (m, a, v) => { a.equal(typeof m.titleCase, 'function'); a.throws(() => m.titleCase(v), TypeError); };
export default [
  { name: 'capitalises ordinary words', run: (m, a) => { a.equal(m.titleCase('hello brave new world'), 'Hello Brave New World'); a.equal(m.titleCase('x'), 'X'); } },
  { name: 'small words stay lowercase in the middle', run: (m, a) => { a.equal(m.titleCase('the lord of the rings'), 'The Lord of the Rings'); a.equal(m.titleCase('war and peace in the east'), 'War and Peace in the East'); } },
  { name: 'small words are capitalised first and last', run: (m, a) => { a.equal(m.titleCase('of mice and men to'), 'Of Mice and Men To'); a.equal(m.titleCase('a'), 'A'); a.equal(m.titleCase('what is it for'), 'What Is It For'); } },
  { name: 'acronyms are kept', run: (m, a) => { a.equal(m.titleCase('NASA and the USB era'), 'NASA and the USB Era'); a.equal(m.titleCase('use the API now'), 'Use the API Now'); } },
  { name: 'a single capital is not an acronym', run: (m, a) => { a.equal(m.titleCase('I am a man'), 'I Am a Man'); a.equal(m.titleCase('i am'), 'I Am'); } },
  { name: 'the rest of each word is lowercased', run: (m, a) => { a.equal(m.titleCase('hELLO wORLD'), 'Hello World'); a.equal(m.titleCase('mIxEd cAsE'), 'Mixed Case'); } },
  { name: 'hyphenated parts are each capitalised', run: (m, a) => { a.equal(m.titleCase('state-of-the-art design'), 'State-Of-The-Art Design'); a.equal(m.titleCase('NASA-grc and e-mail'), 'NASA-Grc and E-Mail'); } },
  { name: 'whitespace is preserved exactly', run: (m, a) => { a.equal(m.titleCase('  what  is   this  for  '), '  What  Is   This  For  '); a.equal(m.titleCase('a\tb\nc'), 'A\tB\nC'); } },
  { name: 'only letters are capitalised', run: (m, a) => { a.equal(m.titleCase('(hello) 3rd "quote"'), '(Hello) 3Rd "Quote"'); a.equal(m.titleCase('see you, of course'), 'See You, of Course'); a.equal(m.titleCase('well of, then'), 'Well Of, Then'); } },
  { name: 'empty and blank text', run: (m, a) => { a.equal(m.titleCase(''), ''); a.equal(m.titleCase('   '), '   '); } },
  { name: 'rejects non-strings', run: (m, a) => { for (const v of [undefined, null, 5, ['a'], {}]) bad(m, a, v); } },
];
