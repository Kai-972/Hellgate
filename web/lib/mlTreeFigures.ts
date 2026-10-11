/**
 * Real ML tree figures — §7 data to render.
 * Void shows — (null), never zero.
 */
import type { ScoreCurvePoint } from '@/components/charts/ScoreCurve';
import type { TreeDatum } from '@/components/charts/TreeDiagram';
import type { MatrixRow } from '@/components/charts/UseCaseMatrix';

export interface MlChangeRow {
  change: string;
  status: 'accepted' | 'rejected' | 'pending' | 'contested' | 'void';
  scorePct: number | null;
  vsBase: number | null;
  vsParent: number | null;
}

export const ML_TREE: MlChangeRow[] = [
  { change: 'baseline', status: 'accepted', scorePct: 63.1, vsBase: 0, vsParent: 0 },
  { change: 'standardise', status: 'accepted', scorePct: 84.3, vsBase: 21.1, vsParent: 21.1 },
  { change: 'momentum', status: 'rejected', scorePct: 91.0, vsBase: 27.8, vsParent: 6.7 },
  { change: 'Adam', status: 'accepted', scorePct: 91.9, vsBase: 28.7, vsParent: 7.6 },
  { change: 'balance rare classes', status: 'rejected', scorePct: 92.8, vsBase: 29.6, vsParent: 0.9 },
  { change: 'learning-rate nudge', status: 'rejected', scorePct: 91.7, vsBase: 28.6, vsParent: -0.2 },
  { change: 'cosine decay', status: 'rejected', scorePct: 91.3, vsBase: 28.2, vsParent: -0.6 },
  { change: 'drop standardisation', status: 'rejected', scorePct: 75.9, vsBase: 12.8, vsParent: -16.0 },
  { change: 'read data generator', status: 'void', scorePct: null, vsBase: null, vsParent: null },
  { change: 'longer training', status: 'contested', scorePct: 91.4, vsBase: 28.3, vsParent: null },
];

const toBp = (pts: number | null) => (pts === null ? null : Math.round(pts * 100));

export function mlScoreCurvePoints(): ScoreCurvePoint[] {
  return ML_TREE.map((r) => ({
    label: r.change,
    scoreBp: toBp(r.scorePct !== null ? r.scorePct : null),
    status: r.status,
    vsBaseBp: toBp(r.vsBase),
    vsParentBp: toBp(r.vsParent),
  }));
}

export function mlGatePoints(): ScoreCurvePoint[] {
  return mlScoreCurvePoints().filter((p) => p.status === 'accepted');
}

export function mlTreeData(): TreeDatum[] {
  // gate chain baseline → standardise → Adam on one row; rest hang below
  const parentOf: Record<string, string | null> = {
    baseline: null,
    standardise: 'baseline',
    momentum: 'standardise',
    Adam: 'standardise',
    'balance rare classes': 'Adam',
    'learning-rate nudge': 'Adam',
    'cosine decay': 'Adam',
    'drop standardisation': 'Adam',
    'read data generator': 'Adam',
    'longer training': 'Adam',
  };
  return ML_TREE.map((r) => ({
    id: r.change,
    label: r.change,
    parent: parentOf[r.change] ?? null,
    status: r.status,
    scoreBp: toBp(r.scorePct),
    vsParentBp: toBp(r.vsParent),
  }));
}

export function mlUseCaseRows(): MatrixRow[] {
  // 4 use-case rows × accepted-change columns (standardise, Adam)
  // values illustrative of spec: standardise lit up badly scaled, Adam lit up imbalanced
  const cell = (change: string, delta: number | null, highlight = false) => ({ change, deltaBp: toBp(delta), highlight });
  return [
    {
      useCase: 'Nonlinear classification',
      cells: [cell('standardise', 4.2), cell('Adam', 3.1)],
    },
    {
      useCase: 'Badly scaled features',
      cells: [cell('standardise', 18.4, true), cell('Adam', 5.6)],
    },
    {
      useCase: 'Noisy regression',
      cells: [cell('standardise', 1.1), cell('Adam', 2.4)],
    },
    {
      useCase: 'Imbalanced classes',
      cells: [cell('standardise', 2.0), cell('Adam', 9.8, true)],
    },
  ];
}
