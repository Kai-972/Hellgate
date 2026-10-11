/**
 * The seeded random stream shared by data generation, the learner jail and the agent jail.
 *
 * It is mulberry32, a small public-domain generator with 32 bits of state. It is not for
 * cryptography. It exists so that "the same seed" means "the same numbers" on every machine.
 */
import { sha256Hex } from './canonical.ts';

/** A function returning numbers in [0, 1). */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A 32-bit unsigned integer taken from the first 8 hex characters of `sha256(label)`. */
export function seedFromLabel(label: string): number {
  return Number.parseInt(sha256Hex(label).slice(0, 8), 16);
}

/** The stream for `label`. The same label always gives the same stream. */
export const rngFor = (label: string): Rng => mulberry32(seedFromLabel(label));

/** A standard normal number from two uniform draws (Box–Muller). */
export function gaussian(rng: Rng): number {
  const u = 1 - rng(); // in (0, 1], so the logarithm is finite
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Fisher–Yates in place, driven by `rng`. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
