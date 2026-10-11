// A correct solution, used to prove the task's cases are fair. Never shown to an agent.
const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };

export function parseDuration(input) {
  if (typeof input !== 'string') throw new TypeError('input must be a string');
  const text = input.trim();
  if (text === '') throw new RangeError('empty duration');
  const component = /\s*(\d+(?:\.\d+)?)(ms|s|m|h|d|w)/y;
  const seen = new Set();
  let total = 0;
  let pos = 0;
  while (pos < text.length) {
    component.lastIndex = pos;
    const match = component.exec(text);
    if (match === null) throw new RangeError(`invalid duration at "${text.slice(pos)}"`);
    if (seen.has(match[2])) throw new RangeError(`unit ${match[2]} appears twice`);
    seen.add(match[2]);
    total += Number(match[1]) * UNITS[match[2]];
    pos = component.lastIndex;
  }
  return Math.round(total);
}
