/**
 * Integer arithmetic for scores (PROTOCOL §7). Scores are whole basis points (100 bp = 1 point), and
 * every rounding rule is spelled out, because a rounding that differs by one between two machines
 * would give two different results digests for the same run.
 */
import { HellgateError } from '../core/errors.ts';

/** `floor(a / b)` for integers with `b > 0`, exact for any safe integer `a` (rounds toward −∞). */
export function floorDiv(a: number, b: number): number {
  const remainder = ((a % b) + b) % b;
  return (a - remainder) / b;
}

/** `ceil(a / b)` for integers with `b > 0`. */
export const ceilDiv = (a: number, b: number): number => -floorDiv(-a, b);

/** The mean rounded half up: `floor((2·Σx + n) / (2n))`. Defined for negative values too. */
export function halfUpMean(values: readonly number[]): number {
  if (values.length === 0) throw new HellgateError('integrity', 'the mean of nothing is undefined');
  let sum = 0;
  for (const v of values) {
    if (!Number.isSafeInteger(v)) throw new HellgateError('integrity', `a score must be a whole number, got ${v}`);
    sum += v;
  }
  return floorDiv(2 * sum + values.length, 2 * values.length);
}

/** The score of one task in one run: the share of its cases that passed, in basis points, rounded down. */
export function caseScoreBp(passed: number, total: number): number {
  if (!Number.isInteger(total) || total < 1) throw new HellgateError('integrity', 'a task needs at least one case');
  return floorDiv(passed * 10_000, total);
}
