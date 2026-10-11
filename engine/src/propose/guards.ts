/**
 * Guards (ARCHITECTURE §6.9). They run before any measurement, and a proposal that fails one is still
 * signed and stored, as a `void` change with the verbatim reason: a graveyard entry that explains
 * itself is worth more than a silent refusal.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRecord } from '../ledger/records.ts';

export type MechanicalStatus = 'ok' | 'bad-path' | 'too-large' | 'frozen-file' | 'bad-import' | 'graveyard-rule' | 'unfalsifiable' | 'typecheck';
export interface GuardResult {
  status: MechanicalStatus;
  detail: string;
}
const ok: GuardResult = { status: 'ok', detail: '' };
const fail = (status: MechanicalStatus, detail: string): GuardResult => ({ status, detail: detail.slice(0, 4000) });

export type Files = Readonly<Record<string, string>>;
export const LIMITS = { files: 2, lines: 120 } as const;

/** The entry signature each domain's `index.ts` must export, exactly (PROTOCOL §12). */
export const ENTRY: Record<'agent' | 'learner', { name: string; signature: string }> = {
  agent: { name: 'solve', signature: 'export async function solve(task: TaskBrief, kit: Kit): Promise<Answer>' },
  learner: { name: 'fit', signature: 'export async function fit(task: MlTask, kit: MlKit): Promise<Predictions>' },
};

/** Lines added plus lines removed between two texts, by longest common subsequence. */
export function changedLines(before: string, after: string): number {
  const a = before === '' ? [] : before.split('\n');
  const b = after === '' ? [] : after.split('\n');
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) row[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, row[j - 1]!);
    prev = row;
  }
  return a.length + b.length - 2 * prev[b.length]!;
}

/** Files whose contents differ between two builds (added, removed or edited). */
export function changedFiles(parent: Files, child: Files): string[] {
  return [...new Set([...Object.keys(parent), ...Object.keys(child)])].filter((p) => parent[p] !== child[p]).sort();
}

const BANNED = [
  { re: /\beval\s*\(/, why: 'eval' },
  { re: /\bnew\s+Function\b|\bFunction\s*\(/, why: 'the Function constructor' },
  { re: /\bimport\s*\(/, why: 'a dynamic import' },
  { re: /\brequire\s*\(/, why: 'require' },
  { re: /\bprocess\b/, why: 'process' },
  { re: /\bglobalThis\b/, why: 'globalThis' },
  { re: /\bfetch\s*\(/, why: 'fetch' },
];

/** Mechanical checks on a child build against its parent. */
export function checkBuild(parent: Files, child: Files, dir: 'agent' | 'learner'): GuardResult {
  const parsed = parseRecord({ body: { type: 'build', v: 1, files: child } });
  if (!parsed.ok) return fail('bad-path', parsed.reason);
  const changed = changedFiles(parent, child);
  if (changed.length === 0) return fail('too-large', 'the build is identical to its parent');
  if (changed.length > LIMITS.files) return fail('too-large', `${changed.length} files changed; the limit is ${LIMITS.files}: ${changed.join(', ')}`);
  const lines = changed.reduce((n, p) => n + changedLines(parent[p] ?? '', child[p] ?? ''), 0);
  if (lines > LIMITS.lines) return fail('too-large', `${lines} lines changed; the limit is ${LIMITS.lines}`);

  const contract = `${dir}/contract.ts`;
  if (parent[contract] !== child[contract]) return fail('frozen-file', `${contract} is frozen and may not change`);
  const entry = child[`${dir}/index.ts`];
  if (entry === undefined || !entry.includes(ENTRY[dir].signature)) {
    return fail('frozen-file', `${dir}/index.ts must export exactly: ${ENTRY[dir].signature}`);
  }

  for (const path of changed) {
    const source = child[path];
    if (source === undefined) continue;
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const m of code.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/g)) {
      if (!/^\.\/[a-z0-9_-]+\.ts$/.test(m[1]!)) return fail('bad-import', `${path} imports "${m[1]}"; only relative siblings such as "./name.ts" are allowed`);
    }
    for (const m of code.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) return fail('bad-import', `${path} imports "${m[1]}" for its side effects`);
    for (const { re, why } of BANNED) if (re.test(code)) return fail('bad-import', `${path} uses ${why}, which a ${dir === 'agent' ? 'agent' : 'learner'} may not`);
  }
  return ok;
}

export interface ClaimInput {
  falsifiedIf: string;
  motif: string;
  area: string;
  contradicts: readonly { change: string }[];
  whyThisTime: string | null;
}

/** A claim that nothing could disprove is not a claim. It must name a number to be beaten. */
export function checkFalsifiable(claim: Pick<ClaimInput, 'falsifiedIf'>): GuardResult {
  return /\d/.test(claim.falsifiedIf) ? ok : fail('unfalsifiable', 'falsifiedIf must name a measurable outcome, such as "under +3 points on both verifiers"');
}

export interface Death {
  motif: string;
  area: string;
  rejected: boolean;
  accepted: boolean;
}

/** The graveyard rules: do not repeat a dead idea without saying why this time is different. */
export function checkGraveyard(claim: ClaimInput, history: readonly Death[]): GuardResult {
  const sameMotif = history.filter((h) => h.rejected && h.motif === claim.motif).length;
  if (sameMotif >= 2 && claim.contradicts.length === 0) {
    return fail('graveyard-rule', `the motif "${claim.motif}" was rejected ${sameMotif} times; name the change(s) this one contradicts with --contradicts`);
  }
  const inArea = history.filter((h) => h.area === claim.area);
  if (inArea.filter((h) => h.rejected).length >= 3 && !inArea.some((h) => h.accepted) && claim.whyThisTime === null) {
    return fail('graveyard-rule', `three changes in "${claim.area}" were rejected and none was accepted; explain with --why-this-time`);
  }
  return ok;
}

/* ------------------------------------------------------------------ typecheck */

const TSC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'node_modules', '.bin', 'tsc');
const TSCONFIG = {
  compilerOptions: {
    target: 'ES2023', lib: ['ES2023'], module: 'NodeNext', moduleResolution: 'NodeNext', noEmit: true, strict: true,
    noUncheckedIndexedAccess: true, erasableSyntaxOnly: true, allowImportingTsExtensions: true, verbatimModuleSyntax: true,
    isolatedModules: true, skipLibCheck: true, types: [],
  },
  include: ['**/*.ts'],
};

/** Run the TypeScript compiler on a scratch copy of the build. Its output, verbatim, is the reason. */
export async function typecheck(files: Files): Promise<GuardResult> {
  const dir = mkdtempSync(join(tmpdir(), 'hellgate-tsc-'));
  try {
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n');
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(TSCONFIG));
    for (const [path, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), contents);
    }
    const output = await new Promise<{ code: number | null; text: string }>((resolve, reject) => {
      const child = spawn(TSC, ['-p', dir, '--pretty', 'false'], { cwd: dir });
      let text = '';
      child.stdout.on('data', (c: Buffer) => (text += c));
      child.stderr.on('data', (c: Buffer) => (text += c));
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, text }));
    });
    if (output.code === 0) return ok;
    return fail('typecheck', output.text.replaceAll(dir + '/', '').trim());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

