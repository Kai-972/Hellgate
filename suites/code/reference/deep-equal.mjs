// A correct solution, used to prove the task's cases are fair. Never shown to an agent.
export function deepEqual(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a === b || (a !== a && b !== b);
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const kind = (v) => (Array.isArray(v) ? 'array' : v instanceof Date ? 'date' : v instanceof Map ? 'map' : v instanceof Set ? 'set' : 'object');
  if (kind(a) !== kind(b)) return false;
  switch (kind(a)) {
    case 'array':
      return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
    case 'date':
      return deepEqual(a.getTime(), b.getTime());
    case 'map':
      return a.size === b.size && [...a].every(([k, v]) => b.has(k) && deepEqual(v, b.get(k)));
    case 'set':
      return a.size === b.size && [...a].every((v) => b.has(v));
    default: {
      const ka = Object.keys(a);
      const kb = Object.keys(b);
      return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
    }
  }
}
