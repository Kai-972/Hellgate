/**
 * A change's figures, derived from its COUNTED attestations only: its score, and its per-task and
 * per-use-case means on both sides. An attestation that was ignored (self, mismatched, an
 * equivocator's) contributes nothing, so a figure on screen is always backed by counted evidence.
 */
import { halfUpMean } from '../measure/arith.ts';
import { buildScoreBp } from '../measure/batch.ts';
import type { Suite } from '../suite/loader.ts';
import type { AttestationInput } from '../verdict/decide.ts';
import type { ChangeRow } from './tree.ts';

export interface Figures {
  counted: AttestationInput[];
  perTask: { task: string; group: string; parentBp: number; candidateBp: number }[];
  perGroup: { group: string; parentBp: number; candidateBp: number }[];
  /** The build's score: the mean of its task means, averaged over counted attestations. `null` if none. */
  scoreBp: number | null;
}

const mean = (xs: number[]): number | null => (xs.length === 0 ? null : halfUpMean(xs));

export function figuresOf(suite: Suite<{ group: string }>, change: ChangeRow): Figures {
  const counted = change.attestations.filter((a) => change.verdict.counted.includes(a.body.signer) && !change.verdict.ignored.some((i) => i.attestation === a.id));
  if (change.verdict.status === 'void' || counted.length === 0) return { counted, perTask: [], perGroup: [], scoreBp: null };
  const side = (pick: 'parent' | 'candidate'): Record<string, number> =>
    Object.fromEntries(suite.tasks.map((t) => [t.id, mean(counted.map((a) => a.body[pick].taskMeansBp[t.id]).filter((v): v is number => v !== undefined))!]));
  const parent = side('parent');
  const candidate = side('candidate');
  return {
    counted,
    perTask: suite.tasks.map((t) => ({ task: t.id, group: t.meta.group, parentBp: parent[t.id]!, candidateBp: candidate[t.id]! })),
    perGroup: suite.groups.map((g) => ({
      group: g.id, parentBp: halfUpMean(g.tasks.map((t) => parent[t]!)), candidateBp: halfUpMean(g.tasks.map((t) => candidate[t]!)),
    })),
    scoreBp: halfUpMean(counted.map((a) => buildScoreBp(a.body.candidate.taskMeansBp))),
  };
}
