// Hidden test cases. The agent never sees this file.
const bad = (m, a, inputs) => { a.equal(typeof m.parseDuration, 'function'); for (const s of inputs) a.throws(() => m.parseDuration(s), RangeError, JSON.stringify(s)); };
export default [
  { name: 'single units', run: (m, a) => {
    a.equal(m.parseDuration('250ms'), 250);
    a.equal(m.parseDuration('5s'), 5000);
    a.equal(m.parseDuration('2m'), 120000);
    a.equal(m.parseDuration('3h'), 10800000);
    a.equal(m.parseDuration('1d'), 86400000);
    a.equal(m.parseDuration('1w'), 604800000);
  } },
  { name: 'combined components', run: (m, a) => {
    a.equal(m.parseDuration('1h30m'), 5400000);
    a.equal(m.parseDuration('2d 4h'), 187200000);
    a.equal(m.parseDuration('1w2d3h4m5s6ms'), 788645006);
  } },
  { name: 'any order is allowed', run: (m, a) => a.equal(m.parseDuration('30m1h'), 5400000) },
  { name: 'ms is not minutes', run: (m, a) => {
    a.equal(m.parseDuration('5ms'), 5);
    a.equal(m.parseDuration('5m5ms'), 300005);
  } },
  { name: 'decimals', run: (m, a) => {
    a.equal(m.parseDuration('1.5h'), 5400000);
    a.equal(m.parseDuration('0.5s'), 500);
    a.equal(m.parseDuration('2.25m'), 135000);
  } },
  { name: 'rounding to the nearest millisecond', run: (m, a) => {
    a.equal(m.parseDuration('1.0004s'), 1000);
    a.equal(m.parseDuration('1.0006s'), 1001);
  } },
  { name: 'surrounding and separating whitespace', run: (m, a) => {
    a.equal(m.parseDuration('  1h   30m  '), 5400000);
    a.equal(m.parseDuration('1h\t30m'), 5400000);
  } },
  { name: 'zero is valid', run: (m, a) => {
    a.equal(m.parseDuration('0s'), 0);
    a.equal(m.parseDuration('0h0m'), 0);
  } },
  { name: 'a repeated unit is an error', run: (m, a) => bad(m, a, ['1h2h', '1m 1m', '5s5s']) },
  { name: 'empty and malformed text is an error', run: (m, a) => bad(m, a, [
    '', '   ', 'h', 'ms', '1', '1x', '1H', '1hour', 'abc', '1h30', '1h,30m', '1h-',
  ]) },
  { name: 'signs, exponents and bad decimals are errors', run: (m, a) => bad(m, a, [
    '-1h', '+1h', '1e3s', '.5h', '5.h', '1.2.3s',
  ]) },
  { name: 'whitespace between a number and its unit is an error', run: (m, a) => bad(m, a, ['1 h', '30 m', '1h 30 m']) },
  { name: 'a non-string throws TypeError', run: (m, a) => {
    a.equal(typeof m.parseDuration, 'function'); // calling a missing function also throws a TypeError
    for (const v of [5, null, undefined, {}, ['1h']]) a.throws(() => m.parseDuration(v), TypeError);
  } },
  { name: 'large values stay exact', run: (m, a) => a.equal(m.parseDuration('999999d'), 86399913600000) },
];
