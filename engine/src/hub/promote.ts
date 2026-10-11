/**
 * The promotion pipeline, as one job a client can watch:
 *
 *   bots verify → the gate decides → consistency check (production against non-production) →
 *   human review, only if something was flagged → promote → what really changed in the benchmark
 *
 * Nothing in the middle is optional and nothing is skipped silently. A change the gate has not accepted is refused.
 * A change with a flag stops and waits for a person, who approves it by name; the approval is written into the
 * production history. Otherwise the bots promote it themselves.
 */
import { verifyChange } from '../app/actions.ts';
import { applyPromotion, planPromotion, productionRow, readProd, type Approval, type Plan } from '../app/production.ts';
import { figuresOf } from '../app/scores.ts';
import type { Tree } from '../app/tree.ts';
import { HellgateError } from '../core/errors.ts';
import type { Identity } from '../identity/keys.ts';
import type { Job } from './jobs.ts';

export interface PromoteOptions {
  tree: Tree;
  bots: { name: string; identity: Identity }[];
  /** A change on the gate path. Default: the tip of the gate path. */
  change?: string | undefined;
  approval?: { by?: unknown; note?: unknown } | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

export function cleanApproval(raw: { by?: unknown; note?: unknown } | undefined): Approval | undefined {
  if (raw === undefined || raw === null) return undefined;
  const by = typeof raw.by === 'string' ? raw.by.replace(/\s+/g, ' ').trim() : '';
  if (by.length < 2 || by.length > 60) throw new HellgateError('usage', 'an approval needs the approver\'s name (2 to 60 characters)');
  const note = typeof raw.note === 'string' ? raw.note.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  return { by, note: note === '' ? null : note };
}

const summary = (p: Plan) => ({
  from: p.from === null ? null : { id: p.from.id, motif: p.from.body.claim.motif, area: p.from.body.claim.area, scoreBp: p.fromScoreBp },
  to: { id: p.to.id, motif: p.to.body.claim.motif, area: p.to.body.claim.area, scoreBp: p.toScoreBp },
  carries: p.carries.map((c) => ({ id: c.id, motif: c.body.claim.motif, area: c.body.claim.area, effectBp: c.verdict.effectBp })),
  flags: p.flags,
  inSync: p.inSync,
});

export async function promoteJob(job: Job, options: PromoteOptions): Promise<unknown> {
  const { tree, bots } = options;
  const approval = cleanApproval(options.approval);
  let snap = tree.snapshot();
  const target = options.change === undefined ? tree.defaultParent(snap) : tree.find(snap, options.change);
  job.emit('log', { line: `promoting ${target.id.slice(0, 8)} (${target.body.claim.area}/${target.body.claim.motif}) from non-production` });

  // 1. The bots. A pending change is measured by every bot key that has not, and did not author it.
  job.emit('stage', { stage: 'bots' });
  if (target.verdict.status === 'pending') {
    const total = 2 * tree.config.policy.runs * tree.suite().tasks.length;
    for (const { name, identity } of bots) {
      if (tree.snapshot().byId.get(target.id)!.verdict.status !== 'pending') break;
      if (target.body.signer === identity.address || target.attestations.some((a) => a.body.signer === identity.address)) continue;
      let done = 0;
      job.emit('log', { line: `${name} is verifying it` });
      const { attestation, body } = await verifyChange({
        tree, identity, ref: target.id, env: options.env,
        onEvent: (e) => {
          done++;
          job.emit('progress', { side: done <= total / 2 ? 'parent' : 'candidate', run: e.run, runs: tree.config.policy.runs, task: e.task, done, of: total, passedCases: e.passed, cases: e.total });
        },
      });
      job.emit('attestation', { id: attestation, signer: body.signer, call: body.call, effectBp: body.effectBp, ciLowBp: body.ciLowBp, ciHighBp: body.ciHighBp });
    }
  } else {
    job.emit('log', { line: `${target.verdict.counted.length} verifier keys have already measured it` });
  }

  // 2. The gate.
  job.emit('stage', { stage: 'gate' });
  snap = tree.snapshot();
  const row = snap.byId.get(target.id)!;
  job.emit('change', { id: row.id, status: row.verdict.status, code: row.verdict.code });
  if (row.verdict.status !== 'accepted') {
    job.emit('log', { line: `refused: ${row.verdict.reason}` });
    return { status: 'refused', change: row.id, code: row.verdict.code, reason: row.verdict.reason };
  }

  // 3. Production against non-production.
  job.emit('stage', { stage: 'consistency' });
  const plan = planPromotion(tree, row, snap);
  job.emit('log', { line: plan.from === null ? 'nothing runs in production yet' : `production runs ${plan.from.id.slice(0, 8)} (${plan.from.body.claim.motif}); the candidate carries ${plan.carries.length} change(s)` });
  if (plan.inSync) return { status: 'in-sync', change: row.id, plan: summary(plan), reason: 'production already runs this change' };

  // 4. A person, only if something was flagged.
  if (plan.flags.length > 0) {
    job.emit('stage', { stage: 'human' });
    job.emit('hitl', { reasons: plan.flags });
    if (approval === undefined) return { status: 'needs-human', change: row.id, plan: summary(plan), reasons: plan.flags };
    job.emit('log', { line: `approved by ${approval.by}${approval.note ? `: ${approval.note}` : ''}` });
  }

  // 5. Promote.
  job.emit('stage', { stage: 'promote' });
  const entry = applyPromotion(tree, plan, plan.flags.length > 0 ? approval : undefined);
  job.emit('log', { line: `production now runs ${row.id.slice(0, 8)} (${entry.mode})` });

  // 6. What really changed in the benchmark.
  job.emit('stage', { stage: 'benchmark' });
  job.emit('benchmark', { fromScoreBp: plan.fromScoreBp, toScoreBp: plan.toScoreBp, perGroup: plan.compared.perGroup, perTask: plan.compared.perTask });
  return { status: 'promoted', change: row.id, mode: entry.mode, by: entry.by, plan: summary(plan), fromScoreBp: plan.fromScoreBp, toScoreBp: plan.toScoreBp };
}

/** The state of both environments, for the page: where production is, where non-production is, and the gap. */
export function pipelineView(tree: Tree) {
  const snap = tree.snapshot();
  const tip = tree.defaultParent(snap);
  const prod = productionRow(tree, snap);
  const plan = tip.verdict.status === 'accepted' ? planPromotion(tree, tip, snap) : null;
  const path = tree.gatePath(snap);
  return {
    tree: tree.config.tree,
    domain: tree.domain,
    production: prod === null ? null : { id: prod.id, motif: prod.body.claim.motif, area: prod.body.claim.area, scoreBp: plan?.fromScoreBp ?? null },
    nonProd: { id: tip.id, motif: tip.body.claim.motif, area: tip.body.claim.area, scoreBp: plan?.toScoreBp ?? null },
    inSync: plan?.inSync ?? true,
    gapBp: plan === null || plan.fromScoreBp === null || plan.toScoreBp === null ? 0 : plan.toScoreBp - plan.fromScoreBp,
    behindBy: plan?.carries.length ?? 0,
    carries: plan === null ? [] : summary(plan).carries,
    flags: plan?.flags ?? [],
    gatePath: path.map((c) => ({ id: c.id, motif: c.body.claim.motif, scoreBp: figuresOf(tree.suite(), c).scoreBp })),
    history: readProd(tree).history,
  };
}
