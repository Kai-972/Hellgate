/**
 * Measuring the two sides of a comparison, the way each domain does it.
 *
 *   ml    both builds are really run, every time (cached on the author's machine only).
 *   code  an AUTHOR records the candidate: the agent runs against the live models and every request and
 *         reply is kept. A VERIFIER replays that recording through the real tests, with no key and no
 *         network. The parent is always replayed from the recording of the change that introduced it,
 *         so both sides share seeds and the same model answers wherever they overlap.
 */
import { HellgateError } from '../core/errors.ts';
import { buildBody, toRecord, type RecordingBody } from '../ledger/records.ts';
import { runBatch, type Batch, type BatchEvent } from '../measure/batch.ts';
import { codeRunner } from '../measure/domains.ts';
import { lanesFromEnv } from '../sandbox/lanes.ts';
import type { Suite } from '../suite/loader.ts';
import type { CodeTaskMeta } from '../suite/tasks.ts';
import { gatewayFor } from './gateways.ts';
import { measureBuild } from './measure.ts';
import type { ChangeRow, Tree } from './tree.ts';

type Files = Readonly<Record<string, string>>;
type Env = Readonly<Record<string, string | undefined>>;

export interface SidesInput {
  tree: Tree;
  /** The change whose build is the parent build; `null` when the parent is the empty build (genesis). */
  parent: ChangeRow | null;
  parentFiles: Files;
  childFiles: Files;
  runs: number;
  role: 'author' | 'verifier';
  /** A verifier replays this (the change's own recording). An author produces one instead. */
  childRecording?: RecordingBody | undefined;
  env: Env;
  onEvent?: ((event: BatchEvent) => void) | undefined;
}

export interface Sides {
  parent: Batch;
  child: Batch;
  /** The new recording, when an author measured a `code` build. */
  recording: RecordingBody | null;
}

export async function measureSides(input: SidesInput): Promise<Sides> {
  const { tree } = input;
  const ev = input.onEvent ? { onEvent: input.onEvent } : {};
  if (tree.domain === 'ml') {
    const cache = input.role === 'author';
    const parent = await measureBuild(tree, input.parentFiles, { runs: input.runs, cache, ...ev });
    const child = await measureBuild(tree, input.childFiles, { runs: input.runs, cache, ...ev });
    return { parent, child, recording: null };
  }

  const suite = tree.suite() as Suite<CodeTaskMeta>;
  const batch = (files: Files, gateway: ReturnType<typeof gatewayFor>): Promise<Batch> =>
    runBatch({ suiteId: suite.id, taskIds: suite.tasks.map((t) => t.id), runs: input.runs, lanes: lanesFromEnv(), runTask: codeRunner(suite, files, gateway), ...ev });

  // The parent side: always a replay of the recording that introduced it. The empty build asks no model.
  let parentRecording: RecordingBody;
  if (Object.keys(input.parentFiles).length === 0) {
    parentRecording = { type: 'recording', v: 1, build: toRecord(buildBody({})).id, suite: suite.id, runs: input.runs, models: { primary: tree.config.models!.primary, secondary: tree.config.models!.secondary }, entries: [] };
  } else {
    const id = input.parent?.body.recording;
    if (id === null || id === undefined) throw new HellgateError('integrity', 'the parent change has no recording to replay');
    parentRecording = tree.ledger.getTyped(id, 'recording').body;
  }
  if (parentRecording.runs !== input.runs) throw new HellgateError('integrity', `the parent was recorded with ${parentRecording.runs} runs, not ${input.runs}`);
  const parent = await batch(input.parentFiles, gatewayFor(tree.config, 'replay', input.env, parentRecording));

  if (input.role === 'verifier') {
    if (input.childRecording === undefined) throw new HellgateError('integrity', 'a verifier needs the change\'s recording');
    if (input.childRecording.runs !== input.runs) throw new HellgateError('integrity', `the change was recorded with ${input.childRecording.runs} runs, not ${input.runs}`);
    return { parent, child: await batch(input.childFiles, gatewayFor(tree.config, 'replay', input.env, input.childRecording)), recording: null };
  }
  const gateway = gatewayFor(tree.config, 'record', input.env);
  const child = await batch(input.childFiles, gateway);
  const recording = gateway.recordingBody(toRecord(buildBody({ ...input.childFiles })).id, suite.id, input.runs);
  return { parent, child, recording };
}
