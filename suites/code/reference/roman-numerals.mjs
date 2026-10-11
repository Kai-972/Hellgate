// A correct solution, used to prove the task's cases are fair. Never shown to an agent.
const TABLE = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];

export function toRoman(n) {
  if (typeof n !== 'number') throw new TypeError('n must be a number');
  if (!Number.isInteger(n) || n < 1 || n > 3999) throw new RangeError('n must be an integer from 1 to 3999');
  let out = '';
  for (const [value, letters] of TABLE) while (n >= value) { out += letters; n -= value; }
  return out;
}

export function fromRoman(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  if (text === '' || /[^IVXLCDM]/.test(text)) throw new RangeError('not a Roman numeral');
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const v = values[text[i]];
    total += v < (values[text[i + 1]] ?? 0) ? -v : v;
  }
  if (total < 1 || total > 3999 || toRoman(total) !== text) throw new RangeError('not a canonical Roman numeral');
  return total;
}
