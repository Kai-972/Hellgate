/**
 * `task.json` for both domains (PROTOCOL §13), plus the public views the build is allowed to see.
 *
 * A task's `task.json` is read with ordinary JSON (it is never canonicalised), so floats such as
 * a regression tolerance are fine here.
 */
import { z } from 'zod';

const TaskId = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/);
const Group = z.string().min(1).max(48).regex(/^[a-z0-9][a-z0-9-]*$/);
const Tags = z.array(z.string().min(1).max(32)).max(6);

/* ------------------------------------------------------------------ code */

export const CodeTaskMeta = z.strictObject({
  id: TaskId,
  title: z.string().min(3).max(120),
  group: Group,
  entry: z.string().regex(/^[a-z0-9-]+\.mjs$/),
  api: z.array(z.strictObject({
    name: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
    signature: z.string().min(5).max(400),
  })).min(1).max(6),
  constraints: z.array(z.string().min(1).max(240)).max(8),
  timeoutMs: z.int().min(500).max(20_000),
  tags: Tags,
});
export type CodeTaskMeta = z.infer<typeof CodeTaskMeta>;

/** What an agent may see of a coding task. Never the test cases. */
export interface TaskBrief {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
  readonly entry: string;
  readonly api: readonly { name: string; signature: string }[];
  readonly constraints: readonly string[];
  readonly starter: readonly { path: string; contents: string }[];
}

/* ------------------------------------------------------------------ ml */

export const MlTaskMeta = z.strictObject({
  id: TaskId,
  title: z.string().min(3).max(120),
  kind: z.enum(['classification', 'regression']),
  group: Group,
  features: z.int().min(1).max(64),
  classes: z.int().min(2).max(16).optional(),
  tolerance: z.number().positive().max(1e6).optional(),
  trainSize: z.int().min(10).max(5000),
  testSize: z.int().min(10).max(5000),
  budgetMs: z.int().min(200).max(60_000),
  tags: Tags,
}).superRefine((t, ctx) => {
  if (t.kind === 'classification' && t.classes === undefined) ctx.addIssue({ code: 'custom', message: 'a classification task needs `classes`' });
  if (t.kind === 'regression' && t.tolerance === undefined) ctx.addIssue({ code: 'custom', message: 'a regression task needs `tolerance`' });
  if (t.kind === 'classification' && t.tolerance !== undefined) ctx.addIssue({ code: 'custom', message: '`tolerance` is only for regression' });
  if (t.kind === 'regression' && t.classes !== undefined) ctx.addIssue({ code: 'custom', message: '`classes` is only for classification' });
});
export type MlTaskMeta = z.infer<typeof MlTaskMeta>;

/** What a learner is given: the train set and the test INPUTS. The labels never leave the parent. */
export interface MlTaskView {
  readonly id: string;
  readonly title: string;
  readonly kind: 'classification' | 'regression';
  readonly features: number;
  readonly classes?: number;
  readonly tolerance?: number;
  readonly train: { readonly x: number[][]; readonly y: number[] };
  readonly testX: number[][];
  readonly budgetMs: number;
}

/** What `data.mjs` returns. The test labels stay in the parent process. */
export interface MlData {
  trainX: number[][];
  trainY: number[];
  testX: number[][];
  testY: number[];
}
