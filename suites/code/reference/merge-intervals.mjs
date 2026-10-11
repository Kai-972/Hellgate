// A correct solution, used to prove the task's cases are fair. Never shown to an agent.
export function mergeIntervals(intervals) {
  if (!Array.isArray(intervals)) throw new TypeError('intervals must be an array');
  for (const item of intervals) {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'number' || typeof item[1] !== 'number') throw new TypeError('each interval must be [start, end]');
  }
  for (const [s, e] of intervals) {
    if (!Number.isFinite(s) || !Number.isFinite(e)) throw new RangeError('numbers must be finite');
    if (s > e) throw new RangeError('start must not exceed end');
  }
  const sorted = intervals.map(([s, e]) => [s, e]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last !== undefined && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}
