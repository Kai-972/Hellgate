// A correct solution, used to prove the task's cases are fair. Never shown to an agent.
const SMALL = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'of', 'in', 'on', 'at', 'to', 'by', 'up', 'as']);
const ACRONYM = /^[A-Z]{2,}$/;
const cap = (w) => w.toLowerCase().replace(/[a-z]/, (c) => c.toUpperCase());

export function titleCase(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const tokens = text.split(/(\s+)/);
  const words = tokens.map((t, i) => (t !== '' && !/^\s+$/.test(t) ? i : -1)).filter((i) => i >= 0);
  const first = words[0];
  const last = words[words.length - 1];
  return tokens.map((t, i) => {
    if (!words.includes(i)) return t;
    if (ACRONYM.test(t)) return t;
    if (t.includes('-')) return t.split('-').map((p) => (ACRONYM.test(p) ? p : cap(p))).join('-');
    if (SMALL.has(t.toLowerCase()) && i !== first && i !== last) return t.toLowerCase();
    return cap(t);
  }).join('');
}
