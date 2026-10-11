// A correct solution, used to prove the task's cases are fair. Never shown to an agent.
export function parseQuery(query) {
  if (typeof query !== 'string') throw new TypeError('query must be a string');
  const decode = (s) => {
    try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { throw new RangeError('malformed percent-escape'); }
  };
  const out = Object.create(null);
  const forced = new Set();
  for (const pair of (query.startsWith('?') ? query.slice(1) : query).split('&')) {
    if (pair === '') continue;
    const at = pair.indexOf('=');
    let key = decode(at < 0 ? pair : pair.slice(0, at));
    const value = at < 0 ? '' : decode(pair.slice(at + 1));
    if (key.endsWith('[]')) { key = key.slice(0, -2); forced.add(key); }
    if (!(key in out)) out[key] = value;
    else if (Array.isArray(out[key])) out[key].push(value);
    else out[key] = [out[key], value];
  }
  for (const key of forced) if (!Array.isArray(out[key])) out[key] = [out[key]];
  return out;
}
