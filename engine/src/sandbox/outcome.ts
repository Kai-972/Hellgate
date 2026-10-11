/**
 * What one task run reports back to the measurement stage.
 *
 * A run that cannot produce an answer is not an error to the caller. It is a task on which every
 * case failed, and the status says why. The exceptions are infrastructure failures (a model
 * provider down, the machine unable to start a process): those throw, and nothing is scored.
 */
export type TaskStatus =
  | 'ok' //           the run finished and was scored
  | 'load-error' //   the agent, learner or solution did not load or export what the contract requires
  | 'run-error' //    the agent or learner threw while working
  | 'bad-output' //   the answer was malformed: wrong length, not finite, unsafe file path
  | 'over-budget' //  the learner finished but over its time budget
  | 'timeout' //      the run was stopped for taking too long
  | 'crashed' //      the process died by itself
  | 'tampered'; //    the report channel or the exit code was interfered with

export interface TaskOutcome {
  taskId: string;
  /** One entry per case, in case order. A run that produced nothing has every entry false. */
  cases: boolean[];
  status: TaskStatus;
  /** False only when tampering was detected. An unclean batch is not accepted as evidence. */
  clean: boolean;
  ms: number;
  /** A short human sentence for logs. It is never hashed, signed or sent to a model. */
  detail: string;
}

export const failedCases = (count: number): boolean[] => Array.from({ length: count }, () => false);
