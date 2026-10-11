/**
 * Temporary directories for jails, and the rules for the files written into them.
 *
 * File paths come from a build or from an agent's answer, so they are untrusted. A path is a
 * relative `a/b.ext` made of plain segments; anything that could climb out of the directory
 * (`..`, an absolute path, an empty segment, a backslash) is refused before a byte is written.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { HellgateError } from '../core/errors.ts';

export interface JailFile {
  path: string;
  contents: string;
}

export const ANSWER_LIMITS = { files: 12, fileBytes: 128 * 1024, totalBytes: 512 * 1024 } as const;
const ANSWER_EXTENSIONS = new Set(['.mjs', '.js', '.json', '.txt', '.md']);
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Why `path` may not be written into a jail, or `null` if it may. */
export function pathProblem(path: string): string | null {
  if (typeof path !== 'string' || path.length === 0 || path.length > 200) return 'path is empty or too long';
  const segments = path.split('/');
  for (const segment of segments) {
    if (!SEGMENT.test(segment) || segment === '.' || segment === '..') return `path "${path}" has an unsafe segment`;
  }
  return null;
}

/**
 * Check the files of an agent's answer. Returns the files, or the reason they were refused.
 * The entry module must not collide with `package.json`, which the sandbox writes itself.
 */
export function checkAnswerFiles(files: unknown): { ok: true; files: JailFile[] } | { ok: false; reason: string } {
  if (!Array.isArray(files)) return { ok: false, reason: 'answer.files is not an array' };
  if (files.length > ANSWER_LIMITS.files) return { ok: false, reason: `more than ${ANSWER_LIMITS.files} files` };
  const seen = new Set<string>();
  const out: JailFile[] = [];
  let total = 0;
  for (const file of files as unknown[]) {
    if (file === null || typeof file !== 'object') return { ok: false, reason: 'a file is not an object' };
    const { path, contents } = file as Record<string, unknown>;
    if (typeof path !== 'string' || typeof contents !== 'string') return { ok: false, reason: 'a file needs a string path and string contents' };
    const problem = pathProblem(path);
    if (problem !== null) return { ok: false, reason: problem };
    const extension = path.slice(path.lastIndexOf('.'));
    if (!ANSWER_EXTENSIONS.has(extension)) return { ok: false, reason: `"${path}" has an extension that is not allowed` };
    if (path.toLowerCase() === 'package.json') return { ok: false, reason: 'package.json is written by the sandbox' };
    if (seen.has(path.toLowerCase())) return { ok: false, reason: `"${path}" appears twice` };
    seen.add(path.toLowerCase());
    const bytes = Buffer.byteLength(contents);
    total += bytes;
    if (bytes > ANSWER_LIMITS.fileBytes || total > ANSWER_LIMITS.totalBytes) return { ok: false, reason: 'the answer is too large' };
    out.push({ path, contents });
  }
  return { ok: true, files: out };
}

/**
 * Make a fresh directory holding `files` (and a `package.json` that makes `.js` and `.ts` files
 * ES modules), run `work` with its real path, and remove it afterwards, whatever happens.
 */
export async function withWorkdir<T>(files: readonly JailFile[], work: (dir: string) => Promise<T>): Promise<T> {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hellgate-jail-')));
  try {
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n');
    for (const file of files) {
      const problem = pathProblem(file.path);
      if (problem !== null) throw new HellgateError('integrity', `refusing to write ${file.path}: ${problem}`);
      const target = join(dir, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.contents);
    }
    return await work(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
