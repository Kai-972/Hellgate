import { execFileSync } from 'node:child_process';

import type { Suite } from './loader.ts';
import type { MlTaskMeta } from './tasks.ts';

const caseCounts = new Map<string, number>();

/**
 * How many hidden cases a suite has. An `ml` task states its test size. A `code` task is a list of
 * cases, which is counted once per suite by loading each `cases.mjs` in a throwaway process.
 */
export function casesIn(suite: Suite<unknown>): number {
  if (suite.domain === 'ml') return suite.tasks.reduce((n, t) => n + ((t.meta as MlTaskMeta).testSize ?? 0), 0);
  const known = caseCounts.get(suite.id);
  if (known !== undefined) return known;
  const sources = suite.tasks.map((t) => t.files['cases.mjs'] ?? '');
  const script = 'import { readFileSync } from "node:fs"; let n = 0; for (const s of JSON.parse(readFileSync(0, "utf8"))) n += (await import("data:text/javascript;base64," + Buffer.from(s).toString("base64"))).default.length; console.log(n);';
  const count = Number(execFileSync(process.execPath, ['--input-type=module', '-e', script], { input: JSON.stringify(sources), encoding: 'utf8', timeout: 20_000, maxBuffer: 1 << 16, env: { PATH: process.env.PATH ?? '' } }).trim());
  caseCounts.set(suite.id, count);
  return count;
}
