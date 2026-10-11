/**
 * Bounded concurrency. The reference machine has two cores, so two jails at a time is the default;
 * `HELLGATE_LANES` raises it on a bigger machine.
 */
import { HellgateError } from '../core/errors.ts';

const MAX_LANES = 16;

export function lanesFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = env.HELLGATE_LANES;
  if (raw === undefined || raw === '') return 2;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LANES) throw new HellgateError('usage', `HELLGATE_LANES must be a whole number from 1 to ${MAX_LANES}, not "${raw}"`);
  return n;
}

/**
 * Run `work` over `items`, at most `lanes` at a time, and return the results in item order.
 * The first failure stops new work from starting; work already running finishes, then the failure
 * is thrown. Nothing is returned for a partial batch.
 */
export async function mapLanes<T, R>(items: readonly T[], lanes: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failure: { error: unknown } | null = null;
  const worker = async (): Promise<void> => {
    while (failure === null && next < items.length) {
      const index = next++;
      try {
        results[index] = await work(items[index]!, index);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(lanes, items.length)) }, worker));
  if (failure !== null) throw (failure as { error: unknown }).error;
  return results;
}
