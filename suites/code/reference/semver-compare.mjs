// A correct solution, used to prove the task's cases are fair. Never shown to an agent.
const RE = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parse(s) {
  if (typeof s !== 'string') throw new TypeError('versions must be strings');
  const m = RE.exec(s);
  if (m === null) throw new RangeError('invalid version: ' + s);
  const pre = m[4] === undefined ? [] : m[4].split('.');
  for (const id of pre) if (/^\d+$/.test(id) && !/^(0|[1-9]\d*)$/.test(id)) throw new RangeError('invalid prerelease: ' + s);
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre };
}

const sign = (n) => (n < 0 ? -1 : n > 0 ? 1 : 0);

export function compareSemver(a, b) {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return sign(x.core[i] - y.core[i]);
  if (x.pre.length === 0 && y.pre.length === 0) return 0;
  if (x.pre.length === 0) return 1;
  if (y.pre.length === 0) return -1;
  for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return sign(Number(p) - Number(q));
    if (pn) return -1;
    if (qn) return 1;
    return p < q ? -1 : 1;
  }
  return sign(x.pre.length - y.pre.length);
}
