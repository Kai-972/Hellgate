/**
 * Measuring a build on a tree's suite, for whichever domain the tree is in. Batches are cached on the
 * author's machine (they are deterministic in the `ml` domain), but a verifier never reads the cache:
 * verifying means running it again.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { canonicalJson } from '../core/canonical.ts';
import { HellgateError } from '../core/errors.ts';
import { runBatch, type Batch, type BatchEvent } from '../measure/batch.ts';
import { mlRunner } from '../measure/domains.ts';
import { lanesFromEnv } from '../sandbox/lanes.ts';
import { STATE_DIR } from '../ledger/store.ts';
import type { MlTaskMeta } from '../suite/tasks.ts';
import type { Suite } from '../suite/loader.ts';
import type { Tree } from './tree.ts';

export interface MeasureOptions {
  runs: number;
  /** Read and write the author-side cache. A verifier passes false. */
  cache: boolean;
  onEvent?: (event: BatchEvent) => void;
}

const cachePath = (tree: Tree, key: string): string => join(tree.root, STATE_DIR, 'scratch', `batch-${key}.json`);

export async function measureBuild(tree: Tree, files: Readonly<Record<string, string>>, options: MeasureOptions): Promise<Batch> {
  if (tree.domain !== 'ml') {
    throw new HellgateError('environment', 'measuring the code domain needs the model gateway, which is not built yet');
  }
  const suite = tree.suite() as Suite<MlTaskMeta>;
  const key = createHash('sha256').update(canonicalJson({ files, suite: suite.id, runs: options.runs })).digest('hex').slice(0, 24);
  const file = cachePath(tree, key);
  if (options.cache && existsSync(file)) {
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as Batch;
    } catch {
      // a damaged cache entry is just a miss
    }
  }
  const batch = await runBatch({
    suiteId: suite.id,
    taskIds: suite.tasks.map((t) => t.id),
    runs: options.runs,
    lanes: lanesFromEnv(),
    runTask: mlRunner(suite, files),
    ...(options.onEvent ? { onEvent: options.onEvent } : {}),
  });
  if (options.cache) {
    mkdirSync(join(tree.root, STATE_DIR, 'scratch'), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(batch));
    renameSync(tmp, file);
  }
  return batch;
}
