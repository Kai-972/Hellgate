/**
 * A tree: a folder holding `.hellgate/` (its config and its ledger), plus the suite it is measured
 * on. Everything the commands show is derived from the ledger here, never stored: a change's depth,
 * its verdict, the gate path. The ledger is the only truth.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareCodePoints } from '../core/canonical.ts';
import { HellgateError } from '../core/errors.ts';
import { loadConfig, type Config } from '../ledger/config.ts';
import type { ChangeBody } from '../ledger/records.ts';
import { Ledger, type Problem } from '../ledger/store.ts';
import { loadSuite, type Suite } from '../suite/loader.ts';
import type { CodeTaskMeta, MlTaskMeta } from '../suite/tasks.ts';
import { decide, type AttestationInput, type Verdict } from '../verdict/decide.ts';

/** The repository the engine lives in: where `suites/`, `learner/` and `agent/` are. */
export const repoDir = (env: NodeJS.ProcessEnv = process.env): string =>
  env.HELLGATE_REPO ?? fileURLToPath(new URL('../../../', import.meta.url));

export interface ChangeRow {
  id: string;
  body: ChangeBody;
  depth: number;
  verdict: Verdict;
  attestations: AttestationInput[];
}

export interface Snapshot {
  /** Every change, ordered by depth, then creation time, then id. */
  changes: ChangeRow[];
  byId: Map<string, ChangeRow>;
  genesis: ChangeRow | null;
  problems: Problem[];
}

export class Tree {
  readonly root: string;
  readonly config: Config;
  readonly ledger: Ledger;
  readonly repo: string;
  private loadedSuite: Suite<CodeTaskMeta | MlTaskMeta> | null = null;

  constructor(root: string, repo = repoDir()) {
    this.root = resolve(root);
    this.config = loadConfig(this.root);
    this.ledger = new Ledger(this.root);
    this.repo = repo;
  }

  get domain(): 'code' | 'ml' {
    return this.config.domain;
  }

  suite(): Suite<CodeTaskMeta | MlTaskMeta> {
    if (this.loadedSuite === null) {
      const dir = join(this.repo, 'suites', this.domain, 'public');
      const suite = (this.domain === 'ml' ? loadSuite(dir, 'ml') : loadSuite(dir, 'code')) as Suite<CodeTaskMeta | MlTaskMeta>;
      if (suite.id !== this.config.suite) {
        throw new HellgateError('integrity', `the suite on disk (${suite.id.slice(0, 12)}) is not the one this tree was created with (${this.config.suite.slice(0, 12)}). A task changed, so earlier evidence does not apply to it.`);
      }
      this.loadedSuite = suite;
    }
    return this.loadedSuite;
  }

  /** A build's files, `{ "learner/index.ts": … }`. */
  buildFiles(id: string): Record<string, string> {
    return { ...this.ledger.getTyped(id, 'build').body.files };
  }

  /** Read the whole ledger and derive every verdict. */
  snapshot(): Snapshot {
    const { records, problems } = this.ledger.scan();
    const attestations = new Map<string, AttestationInput[]>();
    const raw = new Map<string, ChangeBody>();
    for (const r of records.values()) {
      if (r.type === 'change') raw.set(r.id, r.body);
      else if (r.type === 'attestation') attestations.set(r.body.change, [...(attestations.get(r.body.change) ?? []), { id: r.id, body: r.body }]);
    }
    const depthOf = (id: string, seen = new Set<string>()): number => {
      const body = raw.get(id);
      if (body === undefined || body.parent === 'genesis' || seen.has(id)) return 0;
      seen.add(id);
      return 1 + depthOf(body.parent, seen);
    };
    const changes: ChangeRow[] = [...raw].map(([id, body]) => ({
      id, body, depth: depthOf(id), attestations: attestations.get(id) ?? [],
      verdict: decide({ id, body }, attestations.get(id) ?? [], this.config.policy, { domain: this.domain }),
    }));
    changes.sort((a, b) => a.depth - b.depth || compareCodePoints(a.body.createdAt, b.body.createdAt) || compareCodePoints(a.id, b.id));
    return { changes, byId: new Map(changes.map((c) => [c.id, c])), genesis: changes.find((c) => c.body.parent === 'genesis') ?? null, problems };
  }

  /** Resolve an id or a unique prefix of at least 6 characters to a change. */
  find(snapshot: Snapshot, ref: string): ChangeRow {
    if (snapshot.byId.has(ref)) return snapshot.byId.get(ref)!;
    const hits = ref.length >= 6 ? snapshot.changes.filter((c) => c.id.startsWith(ref)) : [];
    if (hits.length === 1) return hits[0]!;
    throw new HellgateError(hits.length > 1 ? 'usage' : 'not-found', hits.length > 1 ? `"${ref}" matches ${hits.length} changes; use more characters` : `no change "${ref}" in this tree`);
  }

  /** The chain of accepted changes from genesis: the tree's current best path. */
  gatePath(snapshot: Snapshot): ChangeRow[] {
    const path: ChangeRow[] = [];
    let tip = snapshot.genesis;
    while (tip !== null && tip.verdict.status === 'accepted') {
      path.push(tip);
      const children = snapshot.changes.filter((c) => c.body.parent === tip!.id && c.verdict.status === 'accepted');
      tip = children[children.length - 1] ?? null;
    }
    return path;
  }

  /** The change new proposals build on by default: the end of the gate path, or genesis. */
  defaultParent(snapshot: Snapshot): ChangeRow {
    const path = this.gatePath(snapshot);
    const tip = path[path.length - 1] ?? snapshot.genesis;
    if (tip === null) throw new HellgateError('usage', 'this tree has no genesis change yet; run `hellgate init`');
    return tip;
  }
}

/** The `.ts` files of a build folder, as `{ "learner/index.ts": … }`. */
export function readBuildDir(dir: string, buildDir: 'agent' | 'learner'): Record<string, string> {
  const files: Record<string, string> = {};
  let names: string[];
  try {
    names = readdirSync(dir).sort(compareCodePoints);
  } catch (err) {
    throw new HellgateError('not-found', `cannot read the build folder ${dir}`, { cause: err });
  }
  for (const name of names) {
    if (name.startsWith('.')) continue;
    if (!name.endsWith('.ts')) throw new HellgateError('usage', `${join(dir, name)}: a build folder holds only .ts files`);
    files[`${buildDir}/${name}`] = readFileSync(join(dir, name), 'utf8').replace(/\r\n?/g, '\n');
  }
  return files;
}
