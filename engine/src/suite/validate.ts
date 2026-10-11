/**
 * Task authoring checks. They run a solution against a task's cases IN THIS PROCESS, so they are
 * for people writing tasks, not for measurement: nothing here is sandboxed. Measurement uses the
 * sandbox (Stage 4).
 */
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';

import type { LoadedTask } from './loader.ts';
import type { CodeTaskMeta } from './tasks.ts';

export interface CaseResult {
  name: string;
  passed: boolean;
  error: string | null;
}

interface CaseDef {
  name: string;
  run: (module: Record<string, unknown>, assertApi: typeof assert) => unknown;
}

const TIMEOUT_MS = 2000;

async function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** The task's cases, as an array of `{ name, run }`. */
export async function loadCases(task: LoadedTask<CodeTaskMeta>): Promise<CaseDef[]> {
  const mod = (await import(pathToFileURL(join(task.dir, 'cases.mjs')).href)) as { default?: CaseDef[] };
  if (!Array.isArray(mod.default) || mod.default.length === 0) throw new Error(`task ${task.id}: cases.mjs must export a non-empty array by default`);
  const names = new Set<string>();
  for (const c of mod.default) {
    if (typeof c?.name !== 'string' || typeof c?.run !== 'function') throw new Error(`task ${task.id}: every case needs a name and a run function`);
    if (names.has(c.name)) throw new Error(`task ${task.id}: duplicate case name "${c.name}"`);
    names.add(c.name);
  }
  return mod.default;
}

/** Run every case against the module at `solutionPath`. */
export async function runCases(task: LoadedTask<CodeTaskMeta>, solutionPath: string): Promise<CaseResult[]> {
  const cases = await loadCases(task);
  const module = (await import(`${pathToFileURL(solutionPath).href}?run=${Math.random()}`)) as Record<string, unknown>;
  const results: CaseResult[] = [];
  for (const c of cases) {
    try {
      await withTimeout(Promise.resolve().then(() => c.run(module, assert)));
      results.push({ name: c.name, passed: true, error: null });
    } catch (err) {
      results.push({ name: c.name, passed: false, error: err instanceof Error ? err.message.split('\n')[0]! : String(err) });
    }
  }
  return results;
}
