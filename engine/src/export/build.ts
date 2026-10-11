/**
 * The export document `hellgate/export/1` (PROTOCOL §11): the web app's only input. It is display
 * output derived entirely from the ledger, so it is never signed or hashed, and the web app never
 * has to compute a verdict, an interval or a score of its own.
 */
import { digestText } from '../app/report.ts';
import { figuresOf } from '../app/scores.ts';
import type { ChangeRow, Snapshot, Tree } from '../app/tree.ts';
import { casesIn } from '../suite/count.ts';
import type { MlTaskMeta } from '../suite/tasks.ts';
import { buildDiff } from './diff.ts';

const title = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1).replaceAll('-', ' ');
const account = (address: string): string => `https://stellar.expert/explorer/testnet/account/${address}`;

export function buildExport(tree: Tree, snap: Snapshot = tree.snapshot()): Record<string, unknown> {
  const suite = tree.suite();
  const groupOf = new Map(suite.tasks.map((t) => [t.id, t.meta.group]));
  const cases = casesIn(suite);

  const byChange = new Map(snap.changes.map((c) => [c.id, figuresOf(suite, c)]));
  const baseScore = snap.genesis === null ? null : byChange.get(snap.genesis.id)!.scoreBp;
  const vsBase = (score: number | null): number | null => (score === null || baseScore === null ? null : score - baseScore);
  const path = tree.gatePath(snap);

  const changes = snap.changes.map((c) => {
    const f = byChange.get(c.id)!;
    const parentFiles = c.body.parentBuild && tree.ledger.has(c.body.parentBuild) ? tree.buildFiles(c.body.parentBuild) : {};
    const childFiles = tree.ledger.has(c.body.build) ? tree.buildFiles(c.body.build) : {};
    return {
      id: c.id, parent: c.body.parent, depth: c.depth,
      status: c.verdict.status, code: c.verdict.code, reason: c.verdict.reason,
      effectBp: c.verdict.effectBp, ciLowBp: c.verdict.ciLowBp, ciHighBp: c.verdict.ciHighBp,
      scoreBp: c.verdict.status === 'void' ? null : f.scoreBp, vsBaseBp: c.verdict.status === 'void' ? null : vsBase(f.scoreBp),
      slots: [] as string[],
      claim: c.body.claim, origin: c.body.origin, mechanical: c.body.mechanical, claimed: c.body.claimed,
      author: c.body.signer, createdAt: c.body.createdAt,
      diff: buildDiff(parentFiles, childFiles),
      perTask: f.perTask, perGroup: f.perGroup,
      attestations: c.attestations.map((a) => {
        const ignored = c.verdict.ignored.find((i) => i.attestation === a.id);
        const counted = c.verdict.counted.includes(a.body.signer) && ignored === undefined;
        return {
          id: a.id, signer: a.body.signer, counted, why: ignored?.why ?? (counted ? null : 'not counted'),
          mode: a.body.mode, call: a.body.call, effectBp: a.body.effectBp, ciLowBp: a.body.ciLowBp, ciHighBp: a.body.ciHighBp,
          parentRunsBp: a.body.parent.runScoresBp, candidateRunsBp: a.body.candidate.runScoresBp,
          resultsDigest: a.body.resultsDigest, spotCheck: a.body.spotCheck, sealed: a.body.sealed, receipt: null,
        };
      }),
      receipt: null,
      tokens: { candidateMedian: 0, parentMedian: 0 },
    };
  });

  const totals = { changes: changes.length, accepted: 0, rejected: 0, pending: 0, contested: 0, void: 0 };
  for (const c of changes) totals[c.status] += 1;

  const signers = new Map<string, { attestations: number; counted: number; flags: Set<string> }>();
  for (const c of changes) {
    for (const a of c.attestations) {
      const s = signers.get(a.signer) ?? { attestations: 0, counted: 0, flags: new Set<string>() };
      s.attestations += 1;
      if (a.counted) s.counted += 1;
      if (a.why === 'equivocation') s.flags.add('equivocation');
      if (a.why === 'self') s.flags.add('self');
      signers.set(a.signer, s);
    }
  }

  return {
    protocol: 'hellgate/export/1',
    tree: tree.config.tree,
    domain: tree.domain,
    suite: { id: suite.id, tasks: suite.tasks.length, cases, groups: suite.groups.map((g) => ({ id: g.id, name: title(g.id), tasks: g.tasks })) },
    sealed: null,
    models: tree.config.models,
    base: snap.genesis === null ? null : { change: snap.genesis.id, scoreBp: baseScore },
    policy: tree.config.policy,
    totals,
    gatePath: path.map((c) => c.id),
    curve: path.map((c) => ({ change: c.id, depth: c.depth, scoreBp: byChange.get(c.id)!.scoreBp, vsBaseBp: vsBase(byChange.get(c.id)!.scoreBp) })),
    changes,
    verifiers: [...signers].sort(([a], [b]) => (a < b ? -1 : 1)).map(([address, s]) => ({
      address, label: `${address.slice(0, 4)}…${address.slice(-4)}`, attestations: s.attestations, counted: s.counted, flags: [...s.flags].sort(), account: account(address),
    })),
    digest: digestText(tree, snap),
  };
}
