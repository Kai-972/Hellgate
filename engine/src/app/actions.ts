/**
 * The things a person does to a tree: create it, propose a change, submit it, verify somebody else's.
 * Each one reads the ledger, does its work, and writes signed records. None of them decides
 * anything: the verdict is always `decide()` over what the ledger holds.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { HellgateError } from '../core/errors.ts';
import { signBody, type Identity } from '../identity/keys.ts';
import { defaultPolicy, saveConfig, type Config, type Policy } from '../ledger/config.ts';
import { EMPTY_BUILD_ID, buildBody, toRecord, type AttestationBody, type ChangeBody } from '../ledger/records.ts';
import { STATE_DIR } from '../ledger/store.ts';
import type { Batch, BatchEvent } from '../measure/batch.ts';
import { compareBatches } from '../measure/compare.ts';
import { checkBuild, checkFalsifiable, checkGraveyard, typecheck, type Files, type GuardResult } from '../propose/guards.ts';
import { loadSuite } from '../suite/loader.ts';
import { measureBuild } from './measure.ts';
import { Tree, readBuildDir, repoDir, type ChangeRow } from './tree.ts';

const now = (): string => new Date().toISOString();
const BUILD_DIR = { ml: 'learner', code: 'agent' } as const;
type Progress = ((event: BatchEvent) => void) | undefined;

/* ------------------------------------------------------------------ init */

export interface InitOptions {
  root: string;
  domain: 'code' | 'ml';
  name: string;
  identity: Identity;
  runs?: number;
  repo?: string;
  policy?: Partial<Policy>;
  onEvent?: Progress;
}

/** Create a tree: pin the suite, store the genesis build, and sign the genesis change. */
export async function initTree(options: InitOptions): Promise<{ tree: Tree; genesis: string }> {
  const root = resolve(options.root);
  const repo = options.repo ?? repoDir();
  if (existsSync(join(root, STATE_DIR, 'config.json'))) throw new HellgateError('usage', `${root} already holds a tree`);
  if (options.domain !== 'ml') throw new HellgateError('environment', 'the code domain needs the model gateway, which is not built yet');

  const suite = loadSuite(join(repo, 'suites', 'ml', 'public'), 'ml');
  const config: Config = saveConfig(root, {
    v: 1, tree: options.name, domain: 'ml', buildDir: 'learner', suite: suite.id, models: null,
    policy: { ...defaultPolicy(), spotCheckTasks: 0, ...(options.runs ? { runs: options.runs } : {}), ...options.policy },
  });
  const files = readBuildDir(join(repo, 'learner'), 'learner');
  const tree = new Tree(root, repo);
  const runs = options.runs ?? config.policy.runs;

  // The genesis change claims what the baseline scores against nothing at all: the empty build, which
  // must score 0 everywhere. Verifiers re-measure exactly this.
  const parent = await measureBuild(tree, {}, { runs, cache: true, ...(options.onEvent ? { onEvent: options.onEvent } : {}) });
  const child = await measureBuild(tree, files, { runs, cache: true, ...(options.onEvent ? { onEvent: options.onEvent } : {}) });
  const measured = compareBatches(parent, child, { changeId: EMPTY_BUILD_ID, signer: options.identity.address, resamples: config.policy.bootstrap, minEffectBp: config.policy.minEffectBp });

  const build = toRecord(buildBody(files));
  tree.ledger.put(build);
  const body: ChangeBody = {
    type: 'change', v: 1, tree: options.name, parent: 'genesis', build: build.id, parentBuild: EMPTY_BUILD_ID, suite: suite.id,
    claim: {
      hypothesis: 'The baseline: a small network trained by plain SGD, with no preprocessing and a constant step size.',
      falsifiedIf: 'The empty build scores above 0 on any task, or the baseline scores 0.',
      area: 'other', motif: 'baseline', predictedEffectBp: Math.max(1, measured.effectBp), contradicts: [], whyThisTime: null,
    },
    origin: { by: 'human', model: null, promptHash: null, instruction: null },
    mechanical: { status: 'ok', detail: '' },
    recording: null,
    claimed: { runs, effectBp: measured.effectBp, resultsDigest: measured.resultsDigest },
    signer: options.identity.address,
    createdAt: now(),
  };
  const signed = signBody(options.identity, body);
  const record = toRecord(signed.body, signed.sig);
  tree.ledger.put(record);
  return { tree, genesis: record.id };
}

/* ------------------------------------------------------------------ propose */

/** Copy a change's build into a fresh workspace folder, ready to edit. Returns the folder holding the files. */
export function proposeWorkspace(tree: Tree, parentRef: string | undefined, into?: string): { dir: string; parent: ChangeRow } {
  const snap = tree.snapshot();
  const parent = parentRef === undefined ? tree.defaultParent(snap) : tree.find(snap, parentRef);
  if (parent.verdict.status === 'void') throw new HellgateError('usage', 'a void change has no build to build on');
  const dir = resolve(into ?? join(tree.root, STATE_DIR, 'scratch', `workspace-${parent.id.slice(0, 8)}`));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const buildDir = tree.config.buildDir;
  for (const [path, contents] of Object.entries(tree.buildFiles(parent.body.build))) {
    const target = join(dir, path.slice(buildDir.length + 1));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  return { dir, parent };
}

/* ------------------------------------------------------------------ submit */

export interface ClaimInput {
  hypothesis: string;
  falsifiedIf: string;
  area: string;
  motif: string;
  predictedEffectBp: number;
  contradicts?: { change: string; why: string }[];
  whyThisTime?: string | null;
}

export interface SubmitOptions {
  tree: Tree;
  identity: Identity;
  /** The candidate build's files, `{ "learner/optim.ts": … }`. */
  files: Files;
  claim: ClaimInput;
  parent?: string;
  origin?: ChangeBody['origin'];
  runs?: number;
  onEvent?: Progress;
}

export interface SubmitResult {
  change: ChangeRow | null;
  id: string;
  /** Present when a guard stopped the change: it is stored as a `void` change with this reason. */
  stopped: GuardResult | null;
}

const AREAS = {
  ml: ['optimizer', 'schedule', 'preprocessing', 'architecture', 'regularization', 'initialization', 'loss', 'other'],
  code: ['prompt', 'context', 'parsing', 'repair', 'decoding', 'planning', 'self-check', 'budget', 'other'],
} as const;

export async function submitChange(options: SubmitOptions): Promise<SubmitResult> {
  const { tree, identity, claim } = options;
  const snap = tree.snapshot();
  const parent = options.parent === undefined ? tree.defaultParent(snap) : tree.find(snap, options.parent);
  if (parent.verdict.status === 'void') throw new HellgateError('usage', 'a void change cannot be built on');
  if (!(AREAS[tree.domain] as readonly string[]).includes(claim.area)) {
    throw new HellgateError('usage', `area "${claim.area}" is not one of: ${AREAS[tree.domain].join(', ')}`);
  }
  const dir = tree.config.buildDir;
  const parentFiles = tree.buildFiles(parent.body.build);
  const runs = options.runs ?? tree.config.policy.runs;

  const normalised: ClaimInput = { ...claim, contradicts: claim.contradicts ?? [], whyThisTime: claim.whyThisTime ?? null };
  const history = snap.changes.filter((c) => c.verdict.status !== 'void').map((c) => ({
    motif: c.body.claim.motif, area: c.body.claim.area, rejected: c.verdict.status === 'rejected', accepted: c.verdict.status === 'accepted',
  }));

  let stopped: GuardResult = checkBuild(parentFiles, options.files, dir);
  if (stopped.status === 'ok') stopped = checkFalsifiable(normalised);
  if (stopped.status === 'ok') stopped = checkGraveyard({ falsifiedIf: claim.falsifiedIf, motif: claim.motif, area: claim.area, contradicts: normalised.contradicts!, whyThisTime: normalised.whyThisTime ?? null }, history);
  if (stopped.status === 'ok') stopped = await typecheck(options.files);

  const build = toRecord(buildBody({ ...options.files }));
  tree.ledger.put(build);
  const base = {
    type: 'change' as const, v: 1 as const, tree: tree.config.tree, parent: parent.id, build: build.id, parentBuild: parent.body.build,
    suite: tree.config.suite,
    claim: {
      hypothesis: claim.hypothesis, falsifiedIf: claim.falsifiedIf, area: claim.area, motif: claim.motif,
      predictedEffectBp: claim.predictedEffectBp, contradicts: normalised.contradicts!, whyThisTime: normalised.whyThisTime ?? null,
    },
    origin: options.origin ?? { by: 'human' as const, model: null, promptHash: null, instruction: null },
    signer: identity.address,
    createdAt: now(),
  };

  let body: ChangeBody;
  if (stopped.status !== 'ok') {
    body = { ...base, mechanical: { status: stopped.status, detail: stopped.detail }, recording: null, claimed: null };
  } else {
    const [parentBatch, childBatch] = await measurePair(tree, parentFiles, options.files, { runs, cache: true, onEvent: options.onEvent });
    const measured = compareBatches(parentBatch, childBatch, { changeId: EMPTY_BUILD_ID, signer: identity.address, resamples: tree.config.policy.bootstrap, minEffectBp: tree.config.policy.minEffectBp });
    body = { ...base, mechanical: { status: 'ok', detail: '' }, recording: null, claimed: { runs, effectBp: measured.effectBp, resultsDigest: measured.resultsDigest } };
  }
  const signed = signBody(identity, body);
  const record = toRecord(signed.body, signed.sig);
  tree.ledger.put(record);
  const row = tree.snapshot().byId.get(record.id) ?? null;
  return { change: row, id: record.id, stopped: stopped.status === 'ok' ? null : stopped };
}

async function measurePair(tree: Tree, parentFiles: Files, childFiles: Files, o: { runs: number; cache: boolean; onEvent: Progress }): Promise<[Batch, Batch]> {
  const opts = { runs: o.runs, cache: o.cache, ...(o.onEvent ? { onEvent: o.onEvent } : {}) };
  const parent = await measureBuild(tree, parentFiles, opts);
  const child = await measureBuild(tree, childFiles, opts);
  return [parent, child];
}

/* ------------------------------------------------------------------ verify */

export interface VerifyOptions {
  tree: Tree;
  identity: Identity;
  ref: string;
  onEvent?: Progress;
}

/** Re-measure somebody else's change from scratch, then sign what was found. */
export async function verifyChange(options: VerifyOptions): Promise<{ attestation: string; body: AttestationBody; row: ChangeRow }> {
  const { tree, identity } = options;
  const row = tree.find(tree.snapshot(), options.ref);
  if (row.verdict.status === 'void') throw new HellgateError('refused', 'this change never ran (a guard stopped it), so there is nothing to verify');
  if (row.body.signer === identity.address) throw new HellgateError('refused', 'you cannot verify your own change: an attestation from its author is not evidence');
  if (row.body.suite !== tree.config.suite) throw new HellgateError('refused', 'this change was measured on a different suite than the tree now uses');
  for (const needed of [row.body.build, row.body.parentBuild]) {
    if (!tree.ledger.has(needed)) throw new HellgateError('integrity', `the ledger does not hold build ${needed.slice(0, 12)}; pull it first`);
  }
  const runs = tree.config.policy.runs;
  const [parentBatch, childBatch] = await measurePair(tree, tree.buildFiles(row.body.parentBuild), tree.buildFiles(row.body.build), { runs, cache: false, onEvent: options.onEvent });
  const m = compareBatches(parentBatch, childBatch, { changeId: row.id, signer: identity.address, resamples: tree.config.policy.bootstrap, minEffectBp: tree.config.policy.minEffectBp });
  const body: AttestationBody = {
    type: 'attestation', v: 1, tree: tree.config.tree, change: row.id, parentBuild: row.body.parentBuild, build: row.body.build, suite: row.body.suite,
    mode: 'live', runs, parent: m.parent, candidate: m.candidate,
    effectBp: m.effectBp, ciLowBp: m.ciLowBp, ciHighBp: m.ciHighBp, call: m.call,
    resultsDigest: m.resultsDigest, clean: m.clean, notes: [], spotCheck: null, sealed: null,
    env: { model: 'none', engine: 'hellgate 0.1.0', node: process.version, platform: process.platform },
    signer: identity.address, createdAt: now(),
  };
  const signed = signBody(identity, body);
  const record = toRecord(signed.body, signed.sig);
  tree.ledger.put(record);
  return { attestation: record.id, body, row };
}

