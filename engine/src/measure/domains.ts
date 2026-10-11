/**
 * Adapters that turn a suite and a build into a `TaskRunner`, one per domain.
 */
import type { Suite } from '../suite/loader.ts';
import type { MlTaskMeta } from '../suite/tasks.ts';
import { runMlTask } from '../sandbox/learner.ts';
import type { JailFile } from '../sandbox/workdir.ts';
import type { TaskRunner } from './batch.ts';
import { HellgateError } from '../core/errors.ts';

/** A build's files as the sandbox takes them. */
export const jailFilesOf = (files: Readonly<Record<string, string>>): JailFile[] =>
  Object.entries(files).map(([path, contents]) => ({ path, contents }));

/** The `ml` domain: no model, so a run is just the learner on a seeded sample of the task's data. */
export function mlRunner(suite: Suite<MlTaskMeta>, buildFiles: Readonly<Record<string, string>>): TaskRunner {
  const files = jailFilesOf(buildFiles);
  return async (taskId, _run, runSeed) => {
    const task = suite.tasks.find((t) => t.id === taskId);
    if (task === undefined) throw new HellgateError('not-found', `the suite has no task ${taskId}`);
    return runMlTask(files, task, runSeed);
  };
}
