/**
 * The verdict (PROTOCOL §9): one pure function from a change and the attestations about it to
 * `accepted`, `rejected`, `pending`, `contested` or `void`.
 *
 * It performs no I/O, reads no clock, and imports only types from the ledger, so the CLI, the hub,
 * the export and CI all reach the same answer from the same records. The steps run in order and the
 * first one that decides wins.
 */
import type { Policy } from '../ledger/config.ts';
import type { AttestationBody, ChangeBody } from '../ledger/records.ts';

export type Status = 'accepted' | 'rejected' | 'pending' | 'contested' | 'void';

export type Code =
  | 'GAIN'
  | 'NO_EFFECT'
  | 'REGRESSION'
  | 'OVERFIT'
  | 'NEEDS_VERIFIERS'
  | 'VERIFIERS_DISAGREE'
  | 'CONFLICT'
  | 'RESULTS_MISMATCH'
  | 'SPOT_CHECK_FAILED'
  | 'UNREPRODUCIBLE'
  | 'NOT_CLEAN'
  /** A void change: the code is the mechanical status that stopped it (`typecheck`, `bad-import`, …). */
  | (string & {});

export type IgnoreReason = 'self' | 'mismatch' | 'runs' | 'not-allowed' | 'sealed-mismatch' | 'equivocation' | 'duplicate';

export interface Verdict {
  status: Status;
  code: Code;
  /** Plain English, with the numbers. For people, never hashed or signed. */
  reason: string;
  effectBp: number | null;
  ciLowBp: number | null;
  ciHighBp: number | null;
  /** The verifier keys whose attestations decided this, sorted. */
  counted: string[];
  ignored: { signer: string; attestation: string; why: IgnoreReason }[];
}

export interface ChangeInput {
  id: string;
  body: ChangeBody;
}

export interface AttestationInput {
  id: string;
  body: AttestationBody;
}

export interface Context {
  /**
   * The tree's domain. In an `ml` tree every verifier re-runs the training for real, which is
   * deterministic, so every counted attestation's results digest must match. In a `code` tree only
   * `replay` attestations are compared: a live run against a model is not reproducible.
   */
  domain: 'code' | 'ml';
  /** The tree's sealed-suite commitment, or `null` if it has none. */
  sealedCommitment?: string | null;
}

/** A size in points, without a sign: 450 bp is "4.5". */
const points = (bp: number): string => (Math.abs(bp) / 100).toFixed(1);

/** The lower middle value of a sorted copy. */
function lowerMedian(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}


export function decide(change: ChangeInput, attestations: readonly AttestationInput[], policy: Policy, context: Context): Verdict {
  const ignored: Verdict['ignored'] = [];
  const ignore = (a: AttestationInput, why: IgnoreReason): void => void ignored.push({ signer: a.body.signer, attestation: a.id, why });
  const finish = (v: Omit<Verdict, 'ignored' | 'counted'> & { counted?: string[] }): Verdict => ({
    ...v,
    counted: v.counted ?? [],
    ignored: ignored.sort((x, y) => (x.signer === y.signer ? (x.attestation < y.attestation ? -1 : 1) : x.signer < y.signer ? -1 : 1)),
  });

  // 1. Void.
  const mechanical = change.body.mechanical;
  if (mechanical.status !== 'ok') {
    return finish({
      status: 'void', code: mechanical.status, effectBp: null, ciLowBp: null, ciHighBp: null,
      reason: `The change never ran: it was stopped by the "${mechanical.status}" check${mechanical.detail ? ` (${mechanical.detail.split('\n')[0]!.slice(0, 160)})` : ''}.`,
    });
  }

  // 2. Filter.
  const sealedCommitment = context.sealedCommitment ?? null;
  const kept: AttestationInput[] = [];
  for (const a of attestations) {
    const b = a.body;
    if (b.signer === change.body.signer) ignore(a, 'self');
    else if (b.change !== change.id || b.tree !== change.body.tree || b.parentBuild !== change.body.parentBuild || b.build !== change.body.build || b.suite !== change.body.suite) ignore(a, 'mismatch');
    else if (b.runs < 3 || b.runs % 2 === 0) ignore(a, 'runs');
    else if (policy.allowedVerifiers.length > 0 && !policy.allowedVerifiers.includes(b.signer)) ignore(a, 'not-allowed');
    else if (b.sealed !== null && b.sealed.suite !== sealedCommitment) ignore(a, 'sealed-mismatch');
    else kept.push(a);
  }

  // 3. Equivocation: one key may not say two things. Several agreeing attestations count once.
  const bySigner = new Map<string, AttestationInput[]>();
  for (const a of kept) bySigner.set(a.body.signer, [...(bySigner.get(a.body.signer) ?? []), a]);
  const counted: AttestationInput[] = [];
  for (const [, group] of bySigner) {
    if (new Set(group.map((a) => a.body.call)).size > 1) {
      for (const a of group) ignore(a, 'equivocation');
      continue;
    }
    const [keep, ...rest] = [...group].sort((x, y) => x.body.effectBp - y.body.effectBp || (x.id < y.id ? -1 : 1));
    counted.push(keep!);
    for (const a of rest) ignore(a, 'duplicate');
  }
  counted.sort((x, y) => (x.body.signer < y.body.signer ? -1 : 1));
  const keys = counted.map((a) => a.body.signer);

  const numbers = (pick: (values: readonly number[]) => number) => ({
    effectBp: counted.length ? pick(counted.map((a) => a.body.effectBp)) : null,
    ciLowBp: counted.length ? pick(counted.map((a) => a.body.ciLowBp)) : null,
    ciHighBp: counted.length ? pick(counted.map((a) => a.body.ciHighBp)) : null,
  });
  const median = () => numbers(lowerMedian);
  const decided = (status: Status, code: Code, reason: string, figures = median()): Verdict => finish({ status, code, reason, ...figures, counted: keys });

  // 4. Unclean.
  if (counted.some((a) => !a.body.clean)) {
    return decided('rejected', 'NOT_CLEAN', 'A verifier reported that a run was tampered with, so none of this evidence can be accepted.');
  }

  // 5. Reproducibility.
  const comparable = counted.filter((a) => a.body.mode === 'replay' || context.domain === 'ml');
  const digests = new Map<string, number>();
  for (const a of comparable) digests.set(a.body.resultsDigest, (digests.get(a.body.resultsDigest) ?? 0) + 1);
  if (digests.size > 1) {
    return decided('contested', 'RESULTS_MISMATCH', 'Verifiers produced different results from the same runs, so at least one of them did not run it as recorded.');
  }
  const [shared, sharedBy] = [...digests][0] ?? [null, 0];
  if (shared !== null && sharedBy >= policy.minVerifiers && shared !== change.body.claimed!.resultsDigest) {
    return decided('rejected', 'UNREPRODUCIBLE', 'Verifiers agree with each other but not with the author: the author\'s claimed results do not reproduce.');
  }
  const failedSpotChecks = counted.filter((a) => a.body.spotCheck !== null && !a.body.spotCheck.ok).length;
  if (failedSpotChecks >= 2) {
    return decided('rejected', 'UNREPRODUCIBLE', 'Two or more live spot-checks disagreed with the recording: it does not describe what the agent really does.');
  }
  if (failedSpotChecks === 1) {
    return decided('contested', 'SPOT_CHECK_FAILED', 'One live spot-check disagreed with the recording. Another verifier is needed to settle it.');
  }

  // 6. Quorum.
  if (counted.length < policy.minVerifiers) {
    return decided('pending', 'NEEDS_VERIFIERS', `${counted.length} of ${policy.minVerifiers} distinct verifier keys have re-measured this change.`);
  }

  const calls = counted.map((a) => a.body.call);
  const effects = counted.map((a) => a.body.effectBp);

  // 7. Conflict.
  if (calls.includes('gain') && calls.includes('loss')) {
    return decided('contested', 'CONFLICT', 'Some verifiers measured a gain and others a loss.');
  }

  // 8. Spread.
  const spread = Math.max(...effects) - Math.min(...effects);
  if (spread > policy.maxVerifierSpanBp) {
    return decided('pending', 'VERIFIERS_DISAGREE', `The verifiers' effects are ${points(spread)} points apart, more than the allowed ${points(policy.maxVerifierSpanBp)}. Another verifier is needed.`);
  }

  // 9. Gain.
  if (calls.every((c) => c === 'gain')) {
    const figures = numbers((v) => Math.min(...v));
    if (counted.some((a) => a.body.sealed?.call === 'loss')) {
      return decided('rejected', 'OVERFIT', 'The change gained on the public tasks but lost on the sealed ones.', figures);
    }
    return decided('accepted', 'GAIN', `${counted.length} distinct verifier keys re-measured a gain of at least ${points(figures.effectBp!)} points, with the 95% interval above zero.`, figures);
  }

  // 10. Loss.
  if (calls.every((c) => c === 'loss')) {
    const figures = numbers((v) => Math.max(...v));
    return decided('rejected', 'REGRESSION', `${counted.length} distinct verifier keys re-measured a loss of ${points(figures.effectBp!)} points or more, with the 95% interval below zero.`, figures);
  }

  // 11. Otherwise.
  return decided('rejected', 'NO_EFFECT', 'The verifiers could not separate the change from noise: the interval includes zero or the effect is below the minimum.');
}

