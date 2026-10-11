/**
 * Beat the gate: a visitor types one instruction, and it is added to the agent's rules as a new change.
 *
 * The visitor chooses nothing but that one sentence. The change is built here, it must clear the same
 * guards as every other change, it is recorded against the live models by a house author key, and it
 * is verified by replay by two other keys. It can be rejected like any other change, and then it
 * sits in the graveyard with its numbers.
 */
import { createHash } from 'node:crypto';

import { submitChange, verifyChange } from '../app/actions.ts';
import type { Tree } from '../app/tree.ts';
import { HellgateError } from '../core/errors.ts';
import type { Identity } from '../identity/keys.ts';
import type { Job } from './jobs.ts';

export const MIN_INSTRUCTION = 8;
export const MAX_INSTRUCTION = 280;

/** What the visitor typed, trimmed and checked. The result is safe to quote into the rules list. */
export function cleanInstruction(raw: unknown): string {
  if (typeof raw !== 'string') throw new HellgateError('usage', 'instruction must be a string');
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length < MIN_INSTRUCTION) throw new HellgateError('usage', `write at least ${MIN_INSTRUCTION} characters`);
  if (text.length > MAX_INSTRUCTION) throw new HellgateError('usage', `keep it under ${MAX_INSTRUCTION} characters`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\u2028\u2029]/.test(text)) throw new HellgateError('usage', 'the instruction contains control characters');
  return text;
}

/** The new rules file: the old one with one JSON-quoted string appended, and nothing else changed. */
export function withInstruction(rules: string, instruction: string): string {
  const close = rules.lastIndexOf('];');
  if (close < 0) throw new HellgateError('integrity', 'instructions.ts does not end its RULES list the way Beat the gate expects');
  return `${rules.slice(0, close)}  ${JSON.stringify(instruction)},\n${rules.slice(close)}`;
}

export interface ChallengeOptions {
  tree: Tree;
  author: Identity;
  verifiers: { name: string; identity: Identity }[];
  instruction: string;
  parent?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

export async function challengeJob(job: Job, options: ChallengeOptions): Promise<unknown> {
  const { tree, author, verifiers } = options;
  if (tree.domain !== 'code') throw new HellgateError('usage', 'Beat the gate runs on the coding tree');
  const instruction = options.instruction;
  job.emit('log', { line: `instruction: ${instruction}` });
  job.emit('stage', { stage: 'build' });

  const snap = tree.snapshot();
  const parent = options.parent === undefined ? tree.defaultParent(snap) : tree.find(snap, options.parent);
  if (parent.verdict.status === 'void') throw new HellgateError('usage', 'a void change cannot be built on');
  const earlier = snap.changes.find((c) => c.body.origin.by === 'challenge' && c.body.origin.instruction === instruction && c.body.parent === parent.id && c.verdict.status !== 'void');
  if (earlier !== undefined) {
    job.emit('log', { line: `this instruction was already measured on this parent: ${earlier.id.slice(0, 8)}` });
    job.emit('change', { id: earlier.id, status: earlier.verdict.status, code: earlier.verdict.code });
    return { change: earlier.id, status: earlier.verdict.status, code: earlier.verdict.code, reason: earlier.verdict.reason, repeated: true };
  }
  const parentFiles = tree.buildFiles(parent.body.build);
  const rulesPath = `${tree.config.buildDir}/instructions.ts`;
  const rules = parentFiles[rulesPath];
  if (rules === undefined) throw new HellgateError('integrity', `the build has no ${rulesPath}`);
  const files = { ...parentFiles, [rulesPath]: withInstruction(rules, instruction) };

  const runs = tree.config.policy.runs;
  const total = 2 * runs * tree.suite().tasks.length;
  let done = 0;
  const progress = (e: { run: number; task: string; passed: number; total: number }): void => {
    done++;
    job.emit('progress', { side: done <= total / 2 ? 'parent' : 'candidate', run: e.run, runs, task: e.task, done, of: total, passedCases: e.passed, cases: e.total });
  };

  job.emit('stage', { stage: 'record', as: 'author' });
  const motif = `instruction-${createHash('sha256').update(instruction).digest('hex').slice(0, 8)}`;
  const submitted = await submitChange({
    tree, identity: author, files, parent: parent.id,
    claim: {
      hypothesis: `Adding this instruction to the agent's rules will make it write better code: "${instruction}"`,
      falsifiedIf: 'Both verifiers measure an effect below +3 points.',
      area: 'prompt', motif, predictedEffectBp: 300,
      // The graveyard rule asks for a reason when an area has only failures. Every challenge is a visitor's own idea,
      // so it is allowed through, and the reason says so.
      whyThisTime: 'A visitor proposed this instruction through Beat the gate; it is judged on its own wording.',
    },
    origin: { by: 'challenge', model: null, promptHash: null, instruction },
    env: options.env ?? process.env,
    onEvent: progress,
  });
  if (submitted.stopped !== null || submitted.change === null) {
    const reason = submitted.stopped?.detail ?? 'the change did not run';
    job.emit('change', { id: submitted.id, status: 'void', code: submitted.stopped?.status ?? 'VOID' });
    return { change: submitted.id, status: 'void', code: submitted.stopped?.status ?? 'VOID', reason };
  }
  const id = submitted.id;
  job.emit('log', { line: `recorded ${id.slice(0, 8)}; the author's own score is a claim, not evidence` });

  for (const { name, identity } of verifiers) {
    done = 0;
    job.emit('stage', { stage: 'verify', as: name });
    const { attestation, body } = await verifyChange({ tree, identity, ref: id, onEvent: progress });
    job.emit('stage', { stage: 'sign', as: name });
    job.emit('attestation', { id: attestation, signer: body.signer, call: body.call, effectBp: body.effectBp, ciLowBp: body.ciLowBp, ciHighBp: body.ciHighBp });
  }
  const row = tree.snapshot().byId.get(id)!;
  job.emit('change', { id: row.id, status: row.verdict.status, code: row.verdict.code });
  return { change: row.id, status: row.verdict.status, code: row.verdict.code, reason: row.verdict.reason };
}
