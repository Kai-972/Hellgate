/** A unified diff of two texts (3 lines of context), by longest common subsequence. */

type Op = { kind: ' ' | '-' | '+'; text: string };

function operations(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) ops.push({ kind: ' ', text: a[i++]! }), j++;
    else if (table[i + 1]![j]! >= table[i]![j + 1]!) ops.push({ kind: '-', text: a[i++]! });
    else ops.push({ kind: '+', text: b[j++]! });
  }
  while (i < n) ops.push({ kind: '-', text: a[i++]! });
  while (j < m) ops.push({ kind: '+', text: b[j++]! });
  return ops;
}

const lines = (text: string): string[] => (text === '' ? [] : text.replace(/\n$/, '').split('\n'));

export function unifiedDiff(path: string, before: string, after: string, context = 3): string {
  if (before === after) return '';
  const ops = operations(lines(before), lines(after));
  const keep = new Array<boolean>(ops.length).fill(false);
  ops.forEach((op, i) => {
    if (op.kind !== ' ') for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) keep[k] = true;
  });
  const out = [`--- ${path}`, `+++ ${path}`];
  let oldLine = 1;
  let newLine = 1;
  for (let i = 0; i < ops.length; ) {
    if (!keep[i]) {
      if (ops[i]!.kind !== '+') oldLine++;
      if (ops[i]!.kind !== '-') newLine++;
      i++;
      continue;
    }
    let end = i;
    while (end < ops.length && keep[end]) end++;
    const hunk = ops.slice(i, end);
    const oldCount = hunk.filter((o) => o.kind !== '+').length;
    const newCount = hunk.filter((o) => o.kind !== '-').length;
    out.push(`@@ -${oldCount === 0 ? oldLine - 1 : oldLine},${oldCount} +${newCount === 0 ? newLine - 1 : newLine},${newCount} @@`);
    for (const op of hunk) out.push(op.kind + op.text);
    oldLine += oldCount;
    newLine += newCount;
    i = end;
  }
  return out.join('\n') + '\n';
}

/** The diff of a whole build against its parent, one block per changed file. */
export function buildDiff(parent: Readonly<Record<string, string>>, child: Readonly<Record<string, string>>): string {
  return [...new Set([...Object.keys(parent), ...Object.keys(child)])]
    .sort()
    .map((p) => unifiedDiff(p, parent[p] ?? '', child[p] ?? ''))
    .join('');
}
