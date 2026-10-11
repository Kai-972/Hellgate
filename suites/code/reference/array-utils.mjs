// A correct solution, used to prove the task's cases are fair. Never shown to an agent.
export function chunk(items, size) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  if (!Number.isInteger(size) || size < 1) throw new RangeError('size must be an integer of at least 1');
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function flatten(items, depth = 1) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  if (!(depth === Infinity || (Number.isInteger(depth) && depth >= 0))) throw new RangeError('depth must be a non-negative integer or Infinity');
  const out = [];
  const walk = (list, level) => {
    for (const item of list) {
      if (Array.isArray(item) && level > 0) walk(item, level - 1);
      else out.push(item);
    }
  };
  walk(items, depth);
  return out;
}
