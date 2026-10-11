/**
 * The way out of the gate: what is allowed to move from non-production to production.
 *
 * "Production" is the tip of the gate path: the latest change that was accepted, on a chain of accepted
 * changes that starts at the baseline. Nothing is promoted because somebody says so. A change that is
 * pending, contested, rejected or void cannot be released, and the release carries the evidence with it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { HellgateError } from '../core/errors.ts';
import { figuresOf } from './scores.ts';
import type { Snapshot, Tree } from './tree.ts';

export interface Release {
  tree: string;
  domain: 'code' | 'ml';
  change: string;
  build: string;
  suite: string;
  scoreBp: number | null;
  /** Points above the baseline, in basis points. */
  vsBaseBp: number | null;
  /** The verifier keys whose measurements decided it. */
  verifiers: string[];
  claim: { hypothesis: string; area: string; motif: string };
  /** The build's files, `{ "agent/index.ts": … }`. */
  files: Record<string, string>;
}

/** The release for `ref`, or for the tip of the gate path. Refuses anything that did not pass the gate. */
export function releaseOf(tree: Tree, ref?: string, snap: Snapshot = tree.snapshot()): Release {
  const path = tree.gatePath(snap);
  const row = ref === undefined ? path[path.length - 1] : tree.find(snap, ref);
  if (row === undefined) throw new HellgateError('refused', 'this tree has nothing to release yet: no change has passed the gate');
  if (row.verdict.status !== 'accepted') {
    throw new HellgateError('refused', `${row.id.slice(0, 8)} is ${row.verdict.status} (${row.verdict.code}), so it cannot be released. Only accepted changes can.`);
  }
  if (!path.some((p) => p.id === row.id)) {
    throw new HellgateError('refused', `${row.id.slice(0, 8)} was accepted but is not on the gate path: one of its ancestors did not pass.`);
  }
  const suite = tree.suite();
  const base = snap.genesis === null ? null : figuresOf(suite, snap.genesis).scoreBp;
  const score = figuresOf(suite, row).scoreBp;
  return {
    tree: tree.config.tree, domain: tree.domain, change: row.id, build: row.body.build, suite: row.body.suite,
    scoreBp: score, vsBaseBp: score === null || base === null ? null : score - base,
    verifiers: [...row.verdict.counted],
    claim: { hypothesis: row.body.claim.hypothesis, area: row.body.claim.area, motif: row.body.claim.motif },
    files: tree.buildFiles(row.body.build),
  };
}

/** Write the release into `outDir`: the build's files, and `RELEASE.json` saying exactly what they are and who vouched for them. */
export function writeRelease(release: Release, outDir: string): string[] {
  const written: string[] = [];
  for (const [path, text] of Object.entries(release.files)) {
    const target = join(outDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    written.push(path);
  }
  const { files: _files, ...manifest } = release;
  writeFileSync(join(outDir, 'RELEASE.json'), `${JSON.stringify({ ...manifest, files: written }, null, 2)}\n`);
  return written;
}
