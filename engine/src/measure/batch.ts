/**
 * A batch is one build measured on a suite: `runs` runs, every task in each, every case scored.
 *
 * `runBatch` produces it by running tasks through a domain's task runner, in the seeded order of
 * PROTOCOL §6, a few at a time. Everything else (per-task scores, the interval, the digest) is
 * computed from the case outcomes alone, so a batch is all the evidence a measurement needs.
 */
import { compareCodePoints } from '../core/canonical.ts';
import { HellgateError, messageOf } from '../core/errors.ts';
import { mapLanes } from '../sandbox/lanes.ts';
import type { TaskOutcome, TaskStatus } from '../sandbox/outcome.ts';
import { seedHex, taskOrder } from '../suite/seeds.ts';
import { caseScoreBp, halfUpMean } from './arith.ts';

export interface Batch {
  suite: string;
  runs: number;
  /** Task ids in sorted (code point) order. */
  taskIds: string[];
  /** `outcomes[run][task][case]`, tasks in sorted order, cases in case order. */
  outcomes: boolean[][][];
  /** False if any run of any task was tampered with. */
  clean: boolean;
}

export type TaskRunner = (taskId: string, run: number, runSeed: string) => Promise<TaskOutcome>;

export interface BatchEvent {
  type: 'task';
  run: number;
  task: string;
  passed: number;
  total: number;
  status: TaskStatus;
  clean: boolean;
  ms: number;
}

export interface BatchSpec {
  suiteId: string;
  taskIds: readonly string[];
  runs: number;
  runTask: TaskRunner;
  lanes: number;
  /** How many times a task is run again when it fails for infrastructure reasons. Default 1. */
  retries?: number;
  onEvent?: (event: BatchEvent) => void;
}

const RETRY_PAUSE_MS = 1500;

export async function runBatch(spec: BatchSpec): Promise<Batch> {
  const taskIds = [...spec.taskIds].sort(compareCodePoints);
  const retries = spec.retries ?? 1;
  const jobs: { run: number; task: string; seed: string }[] = [];
  for (let run = 0; run < spec.runs; run++) {
    const seed = seedHex(spec.suiteId, run);
    for (const task of taskOrder(taskIds, seed)) jobs.push({ run, task, seed });
  }

  const outcomes: boolean[][][] = Array.from({ length: spec.runs }, () => new Array<boolean[]>(taskIds.length));
  let clean = true;
  await mapLanes(jobs, spec.lanes, async (job) => {
    let outcome: TaskOutcome | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        outcome = await spec.runTask(job.task, job.run, job.seed);
        break;
      } catch (err) {
        // A failure of the machinery is not a score. Try again, and if it keeps failing, stop: a batch
        // with a hole in it is not evidence.
        if (attempt >= retries) throw new HellgateError('environment', `task ${job.task} (run ${job.run}) could not be run: ${messageOf(err)}`, { cause: err });
        await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
      }
    }
    if (outcome.taskId !== job.task) throw new HellgateError('integrity', `the runner answered for ${outcome.taskId}, not ${job.task}`);
    outcomes[job.run]![taskIds.indexOf(job.task)] = outcome.cases;
    if (!outcome.clean) clean = false;
    spec.onEvent?.({
      type: 'task', run: job.run, task: job.task, passed: outcome.cases.filter(Boolean).length,
      total: outcome.cases.length, status: outcome.status, clean: outcome.clean, ms: outcome.ms,
    });
  });
  return checkedBatch({ suite: spec.suiteId, runs: spec.runs, taskIds, outcomes, clean });
}

/** Refuse a batch whose shape is not what scoring assumes: the same cases for a task in every run. */
export function checkedBatch(batch: Batch): Batch {
  if (batch.outcomes.length !== batch.runs) throw new HellgateError('integrity', 'a batch needs one entry per run');
  batch.taskIds.forEach((task, t) => {
    const expected = batch.outcomes[0]?.[t]?.length ?? 0;
    for (let run = 0; run < batch.runs; run++) {
      const cases = batch.outcomes[run]?.[t];
      if (cases === undefined || cases.length === 0 || cases.length !== expected) {
        throw new HellgateError('integrity', `task ${task} has a different number of cases in run ${run} than in run 0`);
      }
    }
  });
  return batch;
}

export interface BatchScores {
  /** `scoreBp[run][task]` */
  taskScoresBp: number[][];
  runScoresBp: number[];
  /** Mean over runs of each task's score, by task id. */
  taskMeansBp: Record<string, number>;
}

/** PROTOCOL §7: per-task scores, per-run scores, per-task means. */
export function scoresOf(batch: Batch): BatchScores {
  const taskScoresBp = batch.outcomes.map((run) => run.map((cases) => caseScoreBp(cases.filter(Boolean).length, cases.length)));
  const runScoresBp = taskScoresBp.map((run) => halfUpMean(run));
  const taskMeansBp: Record<string, number> = {};
  batch.taskIds.forEach((task, t) => {
    taskMeansBp[task] = halfUpMean(taskScoresBp.map((run) => run[t]!));
  });
  return { taskScoresBp, runScoresBp, taskMeansBp };
}

/** A build's score: the mean of its task means (PROTOCOL §11.1). */
export const buildScoreBp = (taskMeansBp: Readonly<Record<string, number>>): number => halfUpMean(Object.values(taskMeansBp));
