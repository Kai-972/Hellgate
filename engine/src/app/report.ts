/**
 * Plain-text views of a tree for the terminal. Every number comes from the ledger through `decide()`
 * and `figuresOf()`: this file formats, it never measures or decides.
 */
import { casesIn } from '../suite/count.ts';
import type { MlTaskMeta } from '../suite/tasks.ts';
import type { BaseComparison } from '../measure/compare.ts';
import { scoresOf, type Batch } from '../measure/batch.ts';
import { figuresOf } from './scores.ts';
import type { ChangeRow, Snapshot, Tree } from './tree.ts';

export const pct = (bp: number): string => `${(bp / 100).toFixed(1)}%`;
/** An up/down arrow with the size of a difference in points. */
export const delta = (bp: number): string => (bp === 0 ? '— 0.0' : `${bp > 0 ? '▲ +' : '▼ −'}${(Math.abs(bp) / 100).toFixed(1)}`);
const short = (id: string): string => id.slice(0, 8);
const label = (c: ChangeRow): string => `${c.body.claim.area}/${c.body.claim.motif}`;
const AREAS = {
  ml: ['optimizer', 'schedule', 'preprocessing', 'architecture', 'regularization', 'initialization', 'loss', 'other'],
  code: ['prompt', 'context', 'parsing', 'repair', 'decoding', 'planning', 'self-check', 'budget', 'other'],
} as const;

export function statusText(tree: Tree, snap: Snapshot, c: ChangeRow, why: boolean): string {
  const v = c.verdict;
  const f = figuresOf(tree.suite(), c);
  const base = snap.genesis === null ? null : figuresOf(tree.suite(), snap.genesis).scoreBp;
  const out = [`${short(c.id)}  ${label(c)}`, `  ${v.status.toUpperCase()}  ${v.code}`, `  ${v.reason}`];
  if (v.effectBp !== null) out.push(`  effect ${delta(v.effectBp)} points, 95% interval ${delta(v.ciLowBp!)} … ${delta(v.ciHighBp!)}`);
  if (f.scoreBp !== null) out.push(`  score ${pct(f.scoreBp)}${base === null ? '' : `  (${delta(f.scoreBp - base)} vs base)`}`);
  out.push(`  verifier keys counted: ${v.counted.length} of ${tree.config.policy.minVerifiers} needed`);
  if (why) {
    for (const i of v.ignored) out.push(`  ignored ${i.signer.slice(0, 6)}…  ${i.why}`);
    for (const a of c.attestations) out.push(`  ${a.body.signer.slice(0, 6)}…  ${a.body.call}  ${delta(a.body.effectBp)}  [${delta(a.body.ciLowBp)} … ${delta(a.body.ciHighBp)}]  digest ${short(a.body.resultsDigest)}${a.body.clean ? '' : '  UNCLEAN'}`);
  }
  return out.join('\n');
}

export function treeText(tree: Tree, snap: Snapshot): string {
  const base = snap.genesis === null ? null : figuresOf(tree.suite(), snap.genesis).scoreBp;
  const onPath = new Set(tree.gatePath(snap).map((c) => c.id));
  const lines = [`tree ${tree.config.tree}  (${tree.domain}, suite ${tree.config.suite.slice(0, 8)}, ${tree.suite().tasks.length} tasks)`];
  for (const c of snap.changes) {
    const f = figuresOf(tree.suite(), c);
    const score = f.scoreBp === null ? '      –' : `${pct(f.scoreBp).padStart(6)}`;
    const vs = f.scoreBp === null || base === null ? '' : `  ${delta(f.scoreBp - base)}`;
    lines.push(`${'  '.repeat(c.depth)}${onPath.has(c.id) ? '●' : '○'} ${short(c.id)}  ${label(c).padEnd(34)} ${c.verdict.status.padEnd(9)} ${c.verdict.code.padEnd(16)} ${score}${vs}`);
  }
  if (snap.problems.length > 0) lines.push(`${snap.problems.length} record file(s) failed their checks and were ignored`);
  return lines.join('\n');
}

export function graveyardText(snap: Snapshot): string {
  const dead = snap.changes.filter((c) => c.verdict.status === 'rejected' || c.verdict.status === 'void');
  if (dead.length === 0) return 'The graveyard is empty.';
  return dead.map((c) => {
    const n = c.verdict.effectBp === null ? '' : `  effect ${delta(c.verdict.effectBp)}`;
    return `${short(c.id)}  ${label(c).padEnd(34)} ${String(c.verdict.code).padEnd(16)}${n}\n   ${c.verdict.reason}`;
  }).join('\n');
}

export function showText(tree: Tree, snap: Snapshot, c: ChangeRow): string {
  const k = c.body.claim;
  return [
    statusText(tree, snap, c, true), '',
    `  claim       ${k.hypothesis}`, `  falsified   ${k.falsifiedIf}`, `  predicted   ${delta(k.predictedEffectBp)} points`,
    c.body.claimed ? `  author saw  ${delta(c.body.claimed.effectBp)} points over ${c.body.claimed.runs} runs` : `  never ran   ${c.body.mechanical.status}: ${c.body.mechanical.detail}`,
    `  author      ${c.body.signer}`, `  parent      ${c.body.parent === 'genesis' ? 'genesis' : short(c.body.parent)}  depth ${c.depth}`,
  ].join('\n');
}

/** A short summary of the tree for a person or a proposer model to read. */
export function digestText(tree: Tree, snap: Snapshot): string {
  const suite = tree.suite();
  const cases = casesIn(suite);
  const base = snap.genesis === null ? null : figuresOf(suite, snap.genesis).scoreBp;
  const out = [`# HELLGATE DIGEST  ${tree.config.tree}`, `suite ${suite.tasks.length} tasks / ${cases} cases · ${suite.groups.length} use cases · ${tree.config.policy.runs} runs per side`, '', '## GATE PATH'];
  for (const c of tree.gatePath(snap)) {
    const s = figuresOf(suite, c).scoreBp;
    out.push(`${c.depth} ${short(c.id)}  ${label(c)}  score ${s === null ? '–' : pct(s)}  vs base ${s === null || base === null ? '–' : delta(s - base).replace('▲ ', '').replace('▼ ', '')}`);
  }
  out.push('', '## GRAVEYARD');
  for (const c of snap.changes.filter((x) => x.verdict.status === 'rejected' || x.verdict.status === 'void')) out.push(`- ${label(c)}  ${c.verdict.code}`);
  const tried = new Set(snap.changes.map((c) => c.body.claim.area));
  out.push('', '## NEVER TRIED', AREAS[tree.domain].filter((a) => a !== 'other' && !tried.has(a)).join(', ') || '(every area has been tried)');
  return out.join('\n');
}

export interface BenchRow {
  name: string;
  batch: Batch;
  against: BaseComparison | null;
}

/** `hellgate bench`: a build's score against the base, per use case and per task. Signs nothing. */
export function benchText(tree: Tree, rows: BenchRow[], baseName: string): string {
  const suite = tree.suite();
  const out: string[] = [];
  for (const row of rows) {
    const s = scoresOf(row.batch);
    out.push(`${row.name}   score ${pct(row.against?.scoreBp ?? 0)}   ${row.against ? `${delta(row.against.vsBaseBp)} points vs ${baseName}` : ''}   runs: ${s.runScoresBp.map((b) => (b / 100).toFixed(1)).join(' ')}${row.batch.clean ? '' : '   UNCLEAN'}`);
    for (const g of suite.groups) {
      const mean = Math.round(g.tasks.reduce((n, t) => n + s.taskMeansBp[t]!, 0) / g.tasks.length);
      out.push(`  ${g.id.padEnd(26)} ${pct(mean).padStart(6)}   ${g.tasks.map((t) => `${t} ${Math.round(s.taskMeansBp[t]! / 100)}`).join('  ')}`);
    }
    out.push('');
  }
  return out.join('\n').trimEnd();
}
