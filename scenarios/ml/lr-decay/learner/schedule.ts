// The learning-rate schedule: how the step size changes over the epochs. It follows a half cosine
// from the base rate down to 5% of it, so early steps explore and late steps settle.

export function learningRate(epoch: number, epochs: number, base: number): number {
  const progress = epoch / Math.max(epochs - 1, 1);
  return base * (0.05 + 0.95 * 0.5 * (1 + Math.cos(Math.PI * progress)));
}
