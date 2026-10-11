/**
 * The confidence interval and the call (PROTOCOL §8).
 *
 * The unit being resampled is the TASK, not the case or the run: tasks are what the suite is a
 * sample of, so resampling them answers "would this gain hold on other tasks like these?".
 * Every random choice comes from sha256 over a seed fixed by the change, the signer and the
 * observed differences. Anyone with the same numbers computes the same interval.
 */
import { createHash } from 'node:crypto';

import { idOf } from '../core/canonical.ts';
import { ceilDiv, floorDiv, halfUpMean } from './arith.ts';

export type Call = 'gain' | 'loss' | 'noise';

export interface BootstrapInput {
  changeId: string;
  signer: string;
  suiteId: string;
  /** The paired difference of each task, in sorted task id order. */
  d: readonly number[];
  /** The number of resamples (`policy.bootstrap`). */
  resamples: number;
}

export function bootstrapInterval(input: BootstrapInput): { ciLowBp: number; ciHighBp: number } {
  const { d, resamples: B } = input;
  const m = d.length;
  const seed = idOf({ change: input.changeId, signer: input.signer, suite: input.suiteId, d: [...d] });
  const stats = new Array<number>(B);
  const picked = new Array<number>(m);
  for (let b = 0; b < B; b++) {
    for (let j = 0; j < m; j++) {
      const digest = createHash('sha256').update(`hellgate/boot/1|${seed}|${b}|${j}`).digest();
      picked[j] = d[digest.readUInt32BE(0) % m]!;
    }
    stats[b] = halfUpMean(picked);
  }
  stats.sort((x, y) => x - y);
  return { ciLowBp: stats[floorDiv(25 * B, 1000)]!, ciHighBp: stats[ceilDiv(975 * B, 1000) - 1]! };
}

/** A gain needs the whole interval above 0 and an effect of at least `minEffectBp`; a loss is its mirror. */
export function callOf(effectBp: number, ciLowBp: number, ciHighBp: number, minEffectBp: number): Call {
  if (ciLowBp > 0 && effectBp >= minEffectBp) return 'gain';
  if (ciHighBp < 0 && effectBp <= -minEffectBp) return 'loss';
  return 'noise';
}
