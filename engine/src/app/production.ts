/**
 * Production, as an environment that can lag behind non-production.
 *
 * Non-production is the whole tree: every candidate, measured in the sandbox. Production is ONE pointer to a
 * change that was accepted, and it moves only through a promotion. So the two can differ, and the difference
 * is exactly what a promotion is about: "non-production is ahead by these changes, by this many points".
 *
 * The pointer is deployment state, not evidence, so it is a plain file next to the ledger and never part of
 * a record. A new tree starts with the baseline in production.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { HellgateError } from '../core/errors.ts';
import { figuresOf } from './scores.ts';
import type { ChangeRow, Snapshot, Tree } from './tree.ts';

export interface Promotion {
  change: string;
  at: string;
  /** `baseline` (the start), `automatic` (nothing was flagged) or `human` (somebody approved the flags). */
  mode: 'baseline' | 'automatic' | 'human';
  by: string | null;
  note: string | null;
}

export interface ProdState {
  current: string | null;
  history: Promotion[];
}

const stateFile = (tree: Tree): string => join(tree.root, '.hellgate', 'production.json');

export function readProd(tree: Tree): ProdState {
  const file = stateFile(tree);
  if (!existsSync(file)) return { current: null, history: [] };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as ProdState;
    if ((parsed.current === null || typeof parsed.current === 'string') && Array.isArray(parsed.history)) return parsed;
  } catch {
    /* fall through */
  }
  throw new HellgateError('integrity', `${file} is not a production state file`);
}

/** The change that runs in production: the pointer, or the baseline if nothing was ever promoted. */
export function productionRow(tree: Tree, snap: Snapshot = tree.snapshot()): ChangeRow | null {
  const state = readProd(tree);
  if (state.current !== null) return snap.byId.get(state.current) ?? null;
  return snap.genesis !== null && snap.genesis.verdict.status === 'accepted' ? snap.genesis : null;
}

export function resetProd(tree: Tree): void {
  writeFileSync(stateFile(tree), `${JSON.stringify({ current: null, history: [] }, null, 2)}\n`);
}

export interface Compared {
  scoreBp: number | null;
  perGroup: { group: string; name: string; fromBp: number; toBp: number }[];
  perTask: { task: string; group: string; fromBp: number; toBp: number }[];
}

export interface Plan {
  from: ChangeRow | null;
  to: ChangeRow;
  /** The gate-path changes production would take on, oldest first, ending with `to`. */
  carries: ChangeRow[];
  /** Why a person must look before this goes out. Empty means the bots can promote it by themselves. */
  flags: string[];
  inSync: boolean;
  fromScoreBp: number | null;
  toScoreBp: number | null;
  compared: Compared;
}

const points = (bp: number): string => `${bp >= 0 ? '+' : '−'}${(Math.abs(bp) / 100).toFixed(1)}`;

/** What promoting `to` would do, and whether anything about it needs a human. Pure: it changes nothing. */
export function planPromotion(tree: Tree, to: ChangeRow, snap: Snapshot = tree.snapshot()): Plan {
  const suite = tree.suite();
  const from = productionRow(tree, snap);
  const path = tree.gatePath(snap);
  const fromAt = from === null ? -1 : path.findIndex((p) => p.id === from.id);
  const toAt = path.findIndex((p) => p.id === to.id);
  if (toAt < 0) throw new HellgateError('refused', `${to.id.slice(0, 8)} is not on the gate path, so it cannot go to production.`);

  const toFigures = figuresOf(suite, to);
  const fromFigures = from === null ? null : figuresOf(suite, from);
  const flags: string[] = [];
  const minEffect = tree.config.policy.minEffectBp;
  if (to.verdict.ciLowBp !== null && to.verdict.ciLowBp < minEffect) {
    flags.push(`The gain is real but the margin is thin: the 95% interval starts at ${points(to.verdict.ciLowBp)} points, below the ${points(minEffect)}-point minimum.`);
  }
  for (const g of toFigures.perGroup) {
    if (g.candidateBp - g.parentBp <= -minEffect) {
      flags.push(`The "${g.group}" use case got worse by ${points(g.parentBp - g.candidateBp).replace('+', '')} points while the total improved.`);
    }
  }
  if (to.verdict.ignored.length > 0) {
    flags.push(`${to.verdict.ignored.length} verifier attestation(s) were ignored (${[...new Set(to.verdict.ignored.map((i) => i.why))].join(', ')}), so fewer keys vouch for it than were asked.`);
  }
  if (fromAt >= 0 && toAt < fromAt) flags.push('This moves production backwards to an older version (a rollback).');
  if (from !== null && fromAt < 0) flags.push('Production runs a change that is no longer on the gate path.');

  const fromGroup = new Map((fromFigures?.perGroup ?? []).map((g) => [g.group, g.candidateBp]));
  const fromTask = new Map((fromFigures?.perTask ?? []).map((t) => [t.task, t.candidateBp]));
  const compared: Compared = {
    scoreBp: toFigures.scoreBp,
    perGroup: toFigures.perGroup.map((g) => ({ group: g.group, name: suite.groups.find((x) => x.id === g.group)?.id ?? g.group, fromBp: fromGroup.get(g.group) ?? 0, toBp: g.candidateBp })),
    perTask: toFigures.perTask.map((t) => ({ task: t.task, group: t.group, fromBp: fromTask.get(t.task) ?? 0, toBp: t.candidateBp })),
  };
  return {
    from, to, carries: path.slice(Math.max(fromAt + 1, 0), toAt + 1), flags, inSync: from?.id === to.id,
    fromScoreBp: fromFigures?.scoreBp ?? null, toScoreBp: toFigures.scoreBp, compared,
  };
}

export interface Approval {
  by: string;
  note: string | null;
}

/** Move the pointer. Flags need an approval; without flags the promotion is automatic. */
export function applyPromotion(tree: Tree, plan: Plan, approval?: Approval): Promotion {
  if (plan.flags.length > 0 && approval === undefined) throw new HellgateError('refused', 'a person has to approve this promotion first');
  const state = readProd(tree);
  const entry: Promotion = { change: plan.to.id, at: new Date().toISOString(), mode: approval === undefined ? 'automatic' : 'human', by: approval?.by ?? null, note: approval?.note ?? null };
  const history = state.current === null && state.history.length === 0 && plan.from !== null
    ? [{ change: plan.from.id, at: plan.from.body.createdAt, mode: 'baseline' as const, by: null, note: 'the baseline was in production from the start' }]
    : state.history;
  writeFileSync(stateFile(tree), `${JSON.stringify({ current: plan.to.id, history: [...history, entry] }, null, 2)}\n`);
  return entry;
}
