/**
 * Comparing a candidate batch with its parent's (PROTOCOL §7 and §8), and a build's score against
 * the base (PROTOCOL §11.1).
 */
import { idOf } from '../core/canonical.ts';
import { HellgateError } from '../core/errors.ts';
import { halfUpMean } from './arith.ts';
import { buildScoreBp, checkedBatch, scoresOf, type Batch } from './batch.ts';
import { bootstrapInterval, callOf, type Call } from './bootstrap.ts';

export interface Side {
  runScoresBp: number[];
  taskMeansBp: Record<string, number>;
}

export interface Comparison {
  parent: Side;
  candidate: Side;
  /** The paired difference of each task, in sorted task id order. */
  d: number[];
  effectBp: number;
  ciLowBp: number;
  ciHighBp: number;
  call: Call;
  resultsDigest: string;
  /** False if either side had a tampered run. */
  clean: boolean;
}

export interface CompareOptions {
  changeId: string;
  signer: string;
  /** `policy.bootstrap` */
  resamples: number;
  /** `policy.minEffectBp` */
  minEffectBp: number;
}

/** The digest of every case outcome on both sides: two verifiers that agree on it saw the same runs. */
export function resultsDigest(parent: Batch, candidate: Batch): string {
  const bits = (batch: Batch): number[][][] => batch.outcomes.map((run) => run.map((cases) => cases.map((passed) => (passed ? 1 : 0))));
  return idOf({ type: 'results', parent: bits(parent), candidate: bits(candidate) });
}

export function compareBatches(parent: Batch, candidate: Batch, options: CompareOptions): Comparison {
  checkedBatch(parent);
  checkedBatch(candidate);
  if (parent.suite !== candidate.suite) throw new HellgateError('integrity', 'the two batches were measured on different suites');
  if (parent.runs !== candidate.runs) throw new HellgateError('integrity', 'the two batches have different numbers of runs');
  if (parent.taskIds.join('\n') !== candidate.taskIds.join('\n')) throw new HellgateError('integrity', 'the two batches cover different tasks');
  parent.taskIds.forEach((task, t) => {
    for (let run = 0; run < parent.runs; run++) {
      if (parent.outcomes[run]![t]!.length !== candidate.outcomes[run]![t]!.length) {
        throw new HellgateError('integrity', `task ${task} has different cases on the two sides`);
      }
    }
  });

  const p = scoresOf(parent);
  const c = scoresOf(candidate);
  const d = parent.taskIds.map((task) => c.taskMeansBp[task]! - p.taskMeansBp[task]!);
  const effectBp = halfUpMean(d);
  const { ciLowBp, ciHighBp } = bootstrapInterval({ changeId: options.changeId, signer: options.signer, suiteId: parent.suite, d, resamples: options.resamples });
  return {
    parent: { runScoresBp: p.runScoresBp, taskMeansBp: p.taskMeansBp },
    candidate: { runScoresBp: c.runScoresBp, taskMeansBp: c.taskMeansBp },
    d,
    effectBp,
    ciLowBp,
    ciHighBp,
    call: callOf(effectBp, ciLowBp, ciHighBp, options.minEffectBp),
    resultsDigest: resultsDigest(parent, candidate),
    clean: parent.clean && candidate.clean,
  };
}

export interface BaseComparison {
  scoreBp: number;
  baseScoreBp: number;
  /** `scoreBp − baseScoreBp`: positive is up from the base build, negative is down. */
  vsBaseBp: number;
}

export const againstBase = (scoreBp: number, baseScoreBp: number): BaseComparison => ({ scoreBp, baseScoreBp, vsBaseBp: scoreBp - baseScoreBp });

/** A batch's own score and its distance from a base batch measured on the same suite. */
export function scoreAgainstBase(batch: Batch, base: Batch): BaseComparison {
  if (batch.suite !== base.suite) throw new HellgateError('integrity', 'a score can only be compared with a base measured on the same suite');
  return againstBase(buildScoreBp(scoresOf(batch).taskMeansBp), buildScoreBp(scoresOf(base).taskMeansBp));
}
