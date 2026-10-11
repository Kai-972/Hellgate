// Hidden test cases. The agent never sees this file.
const reference = (n) => { const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s; };
export default [
  { name: 'basic conversions to Roman', run: (m, a) => { a.equal(m.toRoman(1), 'I'); a.equal(m.toRoman(3), 'III'); a.equal(m.toRoman(8), 'VIII'); a.equal(m.toRoman(14), 'XIV'); a.equal(m.toRoman(2024), 'MMXXIV'); } },
  { name: 'subtractive forms', run: (m, a) => { for (const [n, r] of [[4, 'IV'], [9, 'IX'], [40, 'XL'], [90, 'XC'], [400, 'CD'], [900, 'CM'], [1994, 'MCMXCIV'], [3999, 'MMMCMXCIX'], [444, 'CDXLIV'], [49, 'XLIX']]) a.equal(m.toRoman(n), r); } },
  { name: 'toRoman matches the standard table for every number', run: (m, a) => { for (let n = 1; n <= 3999; n++) a.equal(m.toRoman(n), reference(n), String(n)); } },
  { name: 'basic conversions from Roman', run: (m, a) => { a.equal(m.fromRoman('I'), 1); a.equal(m.fromRoman('XIV'), 14); a.equal(m.fromRoman('MCMXCIV'), 1994); a.equal(m.fromRoman('MMMCMXCIX'), 3999); a.equal(m.fromRoman('CDXLIV'), 444); } },
  { name: 'fromRoman inverts toRoman for every number', run: (m, a) => { for (let n = 1; n <= 3999; n++) a.equal(m.fromRoman(reference(n)), n, String(n)); } },
  { name: 'fromRoman rejects non-canonical numerals', run: (m, a) => { a.equal(typeof m.fromRoman, 'function'); for (const s of ['IIII', 'VX', 'IC', 'XM', 'VV', 'IIX', 'MMMM', 'XXXX', 'LL', 'DD', 'IL', 'IXI', 'VIIII', 'CCCC', 'MCMC', 'XCX']) a.throws(() => m.fromRoman(s), RangeError, s); } },
  { name: 'fromRoman rejects lowercase, spaces and the empty string', run: (m, a) => { a.equal(typeof m.fromRoman, 'function'); for (const s of ['', 'iv', 'Iv', ' IV', 'IV ', 'I V', 'ABC', 'IV\n', 'M-C']) a.throws(() => m.fromRoman(s), RangeError, JSON.stringify(s)); } },
  { name: 'toRoman rejects numbers out of range', run: (m, a) => { a.equal(typeof m.toRoman, 'function'); for (const n of [0, -1, 4000, 1.5, NaN, Infinity, -Infinity, 3999.5]) a.throws(() => m.toRoman(n), RangeError, String(n)); } },
  { name: 'wrong types are a TypeError', run: (m, a) => { a.equal(typeof m.toRoman, 'function'); for (const v of ['5', null, undefined, [], {}, true]) a.throws(() => m.toRoman(v), TypeError, String(v)); for (const v of [5, null, undefined, ['I'], {}]) a.throws(() => m.fromRoman(v), TypeError, String(v)); } },
];
