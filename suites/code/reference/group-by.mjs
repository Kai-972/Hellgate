// A correct solution, used to prove the task's cases are fair. Never shown to an agent.
export function groupBy(items, key) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  if (typeof key !== 'string' && typeof key !== 'function') throw new TypeError('key must be a string or a function');
  const pick = typeof key === 'function' ? key : (item) => (item === null || item === undefined ? undefined : item[key]);
  const out = new Map();
  items.forEach((item, index) => {
    const k = pick(item, index);
    if (out.has(k)) out.get(k).push(item);
    else out.set(k, [item]);
  });
  return out;
}
