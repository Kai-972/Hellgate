// The contract between the engine and a learner. FROZEN: a change that touches this file is stopped
// by the guards (PROTOCOL §12.2). Types only, so it is erased at run time.

export interface MlTask {
  readonly id: string;
  readonly title: string;
  readonly kind: 'classification' | 'regression';
  readonly features: number;
  readonly classes?: number; //                      classification: labels are integers 0 … classes−1
  readonly tolerance?: number; //                    regression: how close a prediction must be
  readonly train: { readonly x: number[][]; readonly y: number[] };
  readonly testX: number[][]; //                     test INPUTS only. The labels never leave the parent.
  readonly budgetMs: number; //                      CPU-time budget for this task, in milliseconds
}

export interface MlKit {
  readonly random: () => number; //                  seeded per run. Math.random is replaced by it.
  readonly trace: (event: string, data?: Record<string, unknown>) => void;
  readonly elapsedMs: () => number;
}

export interface Predictions {
  readonly y: readonly number[]; //                  exactly one per test row, all finite
}
