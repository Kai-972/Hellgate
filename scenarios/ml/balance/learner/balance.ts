// Class balance: when one class is much rarer than the others in the training set, a network learns
// to ignore it. Repeat the rows of the rarer classes until every class is as common as the commonest.
// Regression has no classes, so it is left alone.

export function balanceClasses(
  xs: readonly (readonly number[])[],
  ys: readonly number[],
  kind: 'classification' | 'regression',
): { xs: (readonly number[])[]; ys: number[] } {
  if (kind === 'regression') return { xs: [...xs], ys: [...ys] };
  const byClass = new Map<number, number[]>();
  ys.forEach((label, i) => byClass.set(label, [...(byClass.get(label) ?? []), i]));
  const target = Math.max(...[...byClass.values()].map((rows) => rows.length));
  const outX: (readonly number[])[] = [];
  const outY: number[] = [];
  for (const [label, rows] of byClass) {
    for (let k = 0; k < target; k++) {
      outX.push(xs[rows[k % rows.length]!]!);
      outY.push(label);
    }
  }
  return { xs: outX, ys: outY };
}
