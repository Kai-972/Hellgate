/**
 * Loading a suite from disk, and computing its id (PROTOCOL §5.2).
 *
 * The suite id hashes EVERY file of EVERY task, hidden tests included. Edit one assertion and the
 * suite is a different suite, so evidence gathered on the old one stops counting against the new.
 *
 * Nothing here is silent. A task folder that is incomplete, unreadable or inconsistent is an
 * error that names the task, because a loader that skips what it cannot read would turn a broken
 * checkout into a valid-looking, empty suite.
 */
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { compareCodePoints, idOf } from '../core/canonical.ts';
import { HellgateError } from '../core/errors.ts';
import { CodeTaskMeta, MlTaskMeta, type TaskBrief } from './tasks.ts';

export type Domain = 'code' | 'ml';

const MAX_FILES_PER_TASK = 50;
const MAX_FILE_BYTES = 256 * 1024;
const REQUIRED: Record<Domain, readonly string[]> = {
  code: ['task.json', 'brief.md', 'cases.mjs'],
  ml: ['task.json', 'data.mjs'],
};

export interface LoadedTask<M> {
  id: string;
  dir: string;
  /** Every file of the task, relative path to contents, with line endings normalised to `\n`. */
  files: Record<string, string>;
  meta: M;
}

export interface Suite<M> {
  domain: Domain;
  dir: string;
  id: string;
  tasks: LoadedTask<M>[];
  /** Tasks grouped by use case, in the order groups first appear among the sorted tasks. */
  groups: { id: string; tasks: string[] }[];
}

/** Contents are hashed with `\n` line endings, so a checkout with `\r\n` still has the same suite id. */
const normalise = (text: string): string => text.replace(/\r\n?/g, '\n');

/** All regular files below `dir`, relative, sorted by code point. Dotfiles are skipped, symlinks refused. */
function walk(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(dir, base)).sort(compareCodePoints)) {
    if (name.startsWith('.')) continue;
    const rel = base === '' ? name : `${base}/${name}`;
    const stat = lstatSync(join(dir, rel));
    if (stat.isSymbolicLink()) throw new HellgateError('integrity', `${join(dir, rel)} is a symbolic link; a task may contain only regular files`);
    if (stat.isDirectory()) out.push(...walk(dir, rel));
    else if (stat.isFile()) out.push(rel);
  }
  return out;
}

function readTaskFiles(taskDir: string, id: string): Record<string, string> {
  const paths = walk(taskDir);
  if (paths.length > MAX_FILES_PER_TASK) throw new HellgateError('integrity', `task ${id} has ${paths.length} files; the limit is ${MAX_FILES_PER_TASK}`);
  const files: Record<string, string> = {};
  for (const rel of paths) {
    const abs = join(taskDir, rel);
    if (lstatSync(abs).size > MAX_FILE_BYTES) throw new HellgateError('integrity', `task ${id}: ${rel} is larger than ${MAX_FILE_BYTES} bytes`);
    files[rel] = normalise(readFileSync(abs, 'utf8'));
  }
  return files;
}

/** The suite id: a hash of every task's id and complete file set (PROTOCOL §5.2). */
export function suiteIdOf(tasks: readonly { id: string; files: Record<string, string> }[]): string {
  const sorted = [...tasks].sort((a, b) => compareCodePoints(a.id, b.id));
  return idOf({ type: 'suite', v: 1, tasks: sorted.map((t) => ({ id: t.id, files: t.files })) });
}

function groupsOf(tasks: { id: string; meta: { group: string } }[]): { id: string; tasks: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const t of tasks) groups.set(t.meta.group, [...(groups.get(t.meta.group) ?? []), t.id]);
  return [...groups].map(([id, ids]) => ({ id, tasks: ids }));
}

/** Load every task under `<dir>` (for example `suites/code/public`). */
export function loadSuite(dir: string, domain: 'code'): Suite<CodeTaskMeta>;
export function loadSuite(dir: string, domain: 'ml'): Suite<MlTaskMeta>;
export function loadSuite(dir: string, domain: Domain): Suite<CodeTaskMeta> | Suite<MlTaskMeta> {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => !n.startsWith('.')).sort(compareCodePoints);
  } catch (err) {
    throw new HellgateError('not-found', `cannot read the suite folder ${dir}`, { cause: err });
  }
  const tasks: LoadedTask<CodeTaskMeta | MlTaskMeta>[] = [];
  for (const name of names) {
    const taskDir = join(dir, name);
    if (!lstatSync(taskDir).isDirectory()) continue;
    const files = readTaskFiles(taskDir, name);
    for (const required of REQUIRED[domain]) {
      if (!(required in files)) throw new HellgateError('integrity', `task ${name} is missing ${required}`);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(files['task.json']!);
    } catch (err) {
      throw new HellgateError('integrity', `task ${name}: task.json is not valid JSON`, { cause: err });
    }
    const parsed = (domain === 'code' ? CodeTaskMeta : MlTaskMeta).safeParse(raw);
    if (!parsed.success) {
      const why = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(task.json)'}: ${i.message}`).join('; ');
      throw new HellgateError('integrity', `task ${name}: task.json is invalid: ${why}`);
    }
    if (parsed.data.id !== name) throw new HellgateError('integrity', `task folder "${name}" holds a task whose id is "${parsed.data.id}"`);
    tasks.push({ id: name, dir: taskDir, files, meta: parsed.data });
  }
  if (tasks.length === 0) throw new HellgateError('integrity', `${dir} holds no tasks`);
  return { domain, dir, id: suiteIdOf(tasks), tasks, groups: groupsOf(tasks) } as Suite<CodeTaskMeta> | Suite<MlTaskMeta>;
}

/**
 * What an agent may see of a coding task: `task.json`, `brief.md` and `starter/`, and nothing
 * else. (The loader reads `cases.mjs` only so that the suite id covers it; the brief is built from
 * the three public sources and has no way to include it.)
 */
export function codeBrief(task: LoadedTask<CodeTaskMeta>): TaskBrief {
  const starter = Object.keys(task.files)
    .filter((p) => p.startsWith('starter/'))
    .map((p) => ({ path: p.slice('starter/'.length), contents: task.files[p]! }));
  return {
    id: task.meta.id,
    title: task.meta.title,
    brief: task.files['brief.md']!,
    entry: task.meta.entry,
    api: task.meta.api.map((a) => ({ name: a.name, signature: a.signature })),
    constraints: [...task.meta.constraints],
    starter,
  };
}
