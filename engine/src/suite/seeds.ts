/**
 * Seeds and task order (PROTOCOL §6).
 *
 * Run `i` of a suite gets one seed that depends only on the suite and `i`, never on the change.
 * That is why a build's recorded run can be reused by every child change, and why every honest
 * verifier derives exactly the same numbers.
 */
import { compareCodePoints, sha256Hex } from '../core/canonical.ts';
import { mulberry32, seedFromLabel, type Rng } from '../core/rng.ts';

/** The 64-hex seed of run `i`. */
export const seedHex = (suiteId: string, i: number): string => sha256Hex(`hellgate/seed/1|${suiteId}|${i}`);

/** The integer sent to a model provider as `seed`: the first 8 hex characters, modulo 2^31. */
export const seedInt = (seed: string): number => Number.parseInt(seed.slice(0, 8), 16) % 2 ** 31;

/** The order tasks are started in for one run: Fisher–Yates over the sorted ids, driven by sha256. */
export function taskOrder(taskIds: readonly string[], seed: string): string[] {
  const out = [...taskIds].sort(compareCodePoints);
  for (let k = out.length - 1; k >= 1; k--) {
    const swap = Number(BigInt(`0x${sha256Hex(`hellgate/order/1|${seed}|${k}`).slice(0, 12)}`) % BigInt(k + 1));
    [out[k], out[swap]] = [out[swap]!, out[k]!];
  }
  return out;
}

/** The stream a task's data generator (`data.mjs`) draws from in one run. */
export const dataRng = (seed: string, taskId: string): Rng => mulberry32(seedFromLabel(`hellgate/data/1|${seed}|${taskId}`));

/** The stream handed to a learner or an agent as `kit.random` in one run. */
export const learnRng = (seed: string, taskId: string): Rng => mulberry32(seedFromLabel(`hellgate/learn/1|${seed}|${taskId}`));
