/**
 * One coding task in one run: the agent writes a solution inside its jail, then the hidden cases
 * run against that solution in a second, separate process.
 *
 * A failed agent (it crashed, ran too long, returned something unusable) leaves an empty solution,
 * and the cases then fail for real: the score is 0 because the tests said so, not because a
 * shortcut did. Tampering by either process is the exception: the task is marked unclean.
 */
import { codeBrief, type LoadedTask } from '../suite/loader.ts';
import { learnSeed } from '../suite/seeds.ts';
import type { CodeTaskMeta } from '../suite/tasks.ts';
import type { ModelReply, ModelRequest, Remaining } from '../model/types.ts';
import { runAgent } from './agent.ts';
import { runCaseTests } from './cases.ts';
import type { TaskOutcome, TaskStatus } from './outcome.ts';
import type { JailFile } from './workdir.ts';

export interface CodeTaskInput {
  /** The build's `agent/*.ts` files. */
  agentFiles: readonly JailFile[];
  task: LoadedTask<CodeTaskMeta>;
  /** The run's 64-hex seed (PROTOCOL §6). */
  runSeed: string;
  serve: (request: ModelRequest) => Promise<ModelReply>;
  remaining: () => Remaining;
  computeMs?: number;
}

export async function runCodeTask(input: CodeTaskInput): Promise<TaskOutcome> {
  const { task } = input;
  const agent = await runAgent({
    files: input.agentFiles,
    brief: codeBrief(task),
    seed: learnSeed(input.runSeed, task.id),
    serve: input.serve,
    remaining: input.remaining,
    ...(input.computeMs !== undefined ? { computeMs: input.computeMs } : {}),
  });
  const solution = agent.status === 'ok' && agent.answer !== null ? agent.answer : [];
  const tests = await runCaseTests({
    entry: task.meta.entry,
    files: solution,
    casesSource: task.files['cases.mjs']!,
    timeoutMs: task.meta.timeoutMs,
  });

  const clean = agent.clean && tests.status !== 'tampered';
  let status: TaskStatus;
  let detail: string;
  if (!agent.clean) [status, detail] = ['tampered', `agent: ${agent.detail}`];
  else if (tests.status === 'tampered') [status, detail] = ['tampered', `tests: ${tests.detail}`];
  else if (agent.status !== 'ok') [status, detail] = [agent.status, `agent: ${agent.detail}`];
  else if (tests.status === 'load-error') [status, detail] = ['load-error', tests.detail];
  else [status, detail] = ['ok', tests.detail];

  return {
    taskId: task.id,
    cases: clean ? tests.passed : tests.passed.map(() => false),
    status,
    clean,
    ms: agent.ms + tests.ms,
    detail,
  };
}
