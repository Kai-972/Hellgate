/**
 * Adapters that turn a suite and a build into a `TaskRunner`, one per domain.
 */
import type { Suite } from '../suite/loader.ts';
import type { CodeTaskMeta, MlTaskMeta } from '../suite/tasks.ts';
import type { Gateway } from '../model/gateway.ts';
import { runCodeTask } from '../sandbox/codetask.ts';
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

/**
 * The `code` domain: the agent runs in its jail, asks the gateway for model replies, and its solution is
 * tested in a second process. A replay that had to refuse a request missing from the recording marks the
 * outcome unclean: the build is not sending the requests that were recorded.
 */
export function codeRunner(suite: Suite<CodeTaskMeta>, buildFiles: Readonly<Record<string, string>>, gateway: Gateway): TaskRunner {
  const agentFiles = jailFilesOf(buildFiles);
  return async (taskId, _run, runSeed) => {
    const task = suite.tasks.find((t) => t.id === taskId);
    if (task === undefined) throw new HellgateError('not-found', `the suite has no task ${taskId}`);
    const session = gateway.session(runSeed);
    const outcome = await runCodeTask({ agentFiles, task, runSeed, serve: session.serve, remaining: () => session.remaining() });
    return session.missed > 0 ? { ...outcome, clean: false, detail: `${outcome.detail}; ${session.missed} request(s) not in the recording` } : outcome;
  };
}
