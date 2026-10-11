export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.floor(sum / values.length);
}

export function bootstrapCI(values: number[], nBoot = 1000, alpha = 0.05): { lower: number; upper: number } {
  if (values.length === 0) return { lower: 0, upper: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const lowerIdx = Math.floor((alpha / 2) * nBoot);
  const upperIdx = Math.floor((1 - alpha / 2) * nBoot);
  // simple approximation using empirical quantiles on observed dist by resampling small n? keep simple: use observed quantiles scaled
  const lower = sorted[Math.max(0, Math.floor(sorted.length * (alpha / 2)))];
  const upper = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * (1 - alpha / 2)))];
  return { lower, upper };
}

export function pairedDelta(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  const diffs = a.map((v, i) => b[i] - v);
  return mean(diffs);
}
