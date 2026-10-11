/**
 * The `ml` runner: one learner, one task, one run.
 *
 * The learner runs in a jail with the train set and the test INPUTS. It returns predictions. The
 * hidden test labels never enter the jail, so there is no second wall to build: the parent compares
 * the predictions with the labels it holds. Predictions of the wrong length or with a value that is
 * not a finite number score 0, as does a learner that uses more CPU time than its budget.
 */
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

import { HellgateError } from '../core/errors.ts';
import { generateMlData, mlView, scorePredictions } from '../suite/mldata.ts';
import type { LoadedTask } from '../suite/loader.ts';
import { learnSeed } from '../suite/seeds.ts';
import type { MlTaskMeta, MlTaskView } from '../suite/tasks.ts';
import { runJailed } from './jail.ts';
import { failedCases, type TaskOutcome, type TaskStatus } from './outcome.ts';
import { programFor } from './programs.ts';
import { endingOf, peek, readReport } from './report.ts';
import { withWorkdir, type JailFile } from './workdir.ts';

export interface LearnerRunInput {
  /** The build's `learner/*.ts` files. */
  files: readonly JailFile[];
  view: MlTaskView;
  /** The 32-bit seed of `kit.random` and `Math.random` inside the jail. */
  seed: number;
}

export interface LearnerRun {
  status: TaskStatus;
  /** The predictions, present only when `status` is `ok`. */
  y: number[] | null;
  clean: boolean;
  /** Wall-clock milliseconds the run took. */
  ms: number;
  /** CPU milliseconds the learner used. This is what the budget limits. */
  cpuMs: number;
  trace: { event: string; data: unknown }[];
  detail: string;
}

const STARTUP_MS = 10_000;
/**
 * The budget is CPU time, so a busy machine does not change a score. The process is killed on the
 * wall clock only to stop a runaway: after four times the budget plus a grace period.
 */
const KILL_MULTIPLE = 4;
const KILL_GRACE_MS = 2_000;

export async function runLearner(input: LearnerRunInput): Promise<LearnerRun> {
  return withWorkdir(input.files, async (dir) => {
    const nonce = randomBytes(16).toString('hex');
    const budgetMs = input.view.budgetMs;
    const program = programFor('learnerbed', {
      nonce,
      seed: input.seed,
      entryUrl: pathToFileURL(join(dir, 'learner', 'index.ts')).href,
      task: input.view,
    });
    const outcome = await runJailed({
      readDir: dir,
      program,
      deadlineMs: STARTUP_MS,
      onLine(line, control) {
        if (peek(line)?.t === 'begin') control.setDeadline(budgetMs * KILL_MULTIPLE + KILL_GRACE_MS);
      },
    });
    const report = readReport(outcome.lines, nonce);
    const ending = endingOf(report, outcome);
    const done = (status: TaskStatus, detail: string, extra: Partial<LearnerRun> = {}): LearnerRun => ({
      status, y: null, clean: status !== 'tampered', ms: outcome.elapsedMs, cpuMs: 0, trace: [], detail, ...extra,
    });

    if (ending === 'tampered') return done('tampered', report.foreign > 0 ? 'unrecognised lines on the report channel' : 'the report and the exit code disagree');
    const began = report.records.some((r) => r.t === 'begin');
    if (ending === 'killed') {
      if (!began) throw new HellgateError('environment', `the learner jail did not start: ${outcome.stderr.trim().slice(-300)}`);
      return done('timeout', `stopped after ${budgetMs * KILL_MULTIPLE + KILL_GRACE_MS} ms of wall-clock time`);
    }
    const fatal = report.records.find((r) => r.t === 'fatal');
    if (ending === 'crashed') return done('crashed', fatal ? String(fatal.message) : `the process died (exit ${outcome.exitCode}${outcome.signal ? `, ${outcome.signal}` : ''})`);

    const loadError = report.records.find((r) => r.t === 'load-error');
    if (loadError !== undefined) return done('load-error', String(loadError.message));
    const fitError = report.records.find((r) => r.t === 'fit-error');
    if (fitError !== undefined) return done('run-error', String(fitError.message), { trace: traceOf(fitError.trace) });

    const result = report.records.find((r) => r.t === 'result');
    if (result === undefined) return done('tampered', 'the run closed without a result');
    const trace = traceOf(result.trace);
    const ms = typeof result.ms === 'number' ? result.ms : outcome.elapsedMs;
    const cpuMs = typeof result.cpuMs === 'number' ? result.cpuMs : ms;
    const y = result.y;
    if (!Array.isArray(y) || y.length !== input.view.testX.length) {
      return done('bad-output', `expected ${input.view.testX.length} predictions`, { trace, ms, cpuMs });
    }
    if (!y.every((v) => typeof v === 'number' && Number.isFinite(v))) return done('bad-output', 'a prediction is not a finite number', { trace, ms, cpuMs });
    if (cpuMs > budgetMs) return done('over-budget', `used ${cpuMs} ms of CPU time; the budget is ${budgetMs} ms`, { trace, ms, cpuMs });
    return { status: 'ok', y: y as number[], clean: true, ms, cpuMs, trace, detail: 'finished' };
  });
}

function traceOf(value: unknown): LearnerRun['trace'] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 64).map((e) => ({ event: String((e as { event?: unknown })?.event ?? ''), data: (e as { data?: unknown })?.data ?? null }));
}

/**
 * One task in one run: generate the data from the run's seed, run the learner on it, and score the
 * predictions against the labels, which stay in this process. `files` is the build's learner folder.
 */
export async function runMlTask(files: readonly JailFile[], task: LoadedTask<MlTaskMeta>, runSeed: string): Promise<TaskOutcome> {
  const data = await generateMlData(task, runSeed);
  const run = await runLearner({ files, view: mlView(task, data), seed: learnSeed(runSeed, task.id) });
  const cases = run.status === 'ok' && run.y !== null ? scorePredictions(task.meta, run.y, data.testY) : failedCases(data.testY.length);
  return { taskId: task.id, cases, status: run.status, clean: run.clean, ms: run.ms, detail: run.detail };
}
