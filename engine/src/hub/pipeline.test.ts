/**
 * The way from non-production to production, with nobody clicking: a change is submitted, the hub's bots
 * pick it up and verify it on their own, and only once the gate has accepted it can it be released.
 */
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { initTree } from '../app/actions.ts';
import { run } from '../cli/main.ts';
import { generateIdentity } from '../identity/keys.ts';
import { Hub } from './server.ts';

const REAL = new URL('../../../', import.meta.url).pathname;

test('bots verify a pending change by themselves, and only an accepted change can be promoted', { timeout: 240_000 }, async () => {
  const repo = mkdtempSync(join(tmpdir(), 'hg-pipe-'));
  for (const t of ['moons', 'scaled-regression']) cpSync(join(REAL, 'suites', 'ml', 'public', t), join(repo, 'suites', 'ml', 'public', t), { recursive: true });
  cpSync(join(REAL, 'learner'), join(repo, 'learner'), { recursive: true });
  const { tree, genesis } = await initTree({ root: mkdtempSync(join(tmpdir(), 'hg-pipe-tree-')), domain: 'ml', name: 'demo', identity: generateIdentity(), runs: 3, repo });

  const cli = async (args: string[]) => {
    let out = '';
    let err = '';
    const code = await run([...args, '--root', tree.root], { out: (t) => (out += t + '\n'), err: (t) => (err += t + '\n'), env: { HELLGATE_REPO: repo, HELLGATE_HOME: mkdtempSync(join(tmpdir(), 'hg-home-')), PATH: process.env.PATH }, cwd: process.cwd(), tty: false });
    return { code, out, err };
  };

  // Nothing has passed the gate yet: there is nothing to release.
  const early = await cli(['promote', '--out', join(tmpdir(), 'hg-early')]);
  assert.equal(early.code, 1);
  assert.match(early.err, /pending|nothing to release|cannot be released/);

  const hub = new Hub({ trees: [tree], bots: { 'bot-1': generateIdentity().secret, 'bot-2': generateIdentity().secret }, autoVerifyMs: 200 });
  const url = `http://127.0.0.1:${await hub.listen(0)}`;
  try {
    assert.equal((await fetch(`${url}/v1/production`)).status, 404, 'no production yet');
    for (let i = 0; i < 1200 && tree.snapshot().byId.get(genesis)!.verdict.status !== 'accepted'; i++) await new Promise((r) => setTimeout(r, 200));
    const row = tree.snapshot().byId.get(genesis)!;
    assert.deepEqual([row.verdict.status, row.verdict.code, row.attestations.length], ['accepted', 'GAIN', 2], 'two bot keys verified it with no request from anybody');

    const prod = (await (await fetch(`${url}/v1/production`)).json()) as any;
    assert.equal(prod.change, genesis);
    assert.equal(prod.verifiers.length, 2);
    assert.ok(prod.files['learner/index.ts'].includes('export'), 'the release carries the build');

    const out = join(tmpdir(), `hg-release-${Date.now()}`);
    const promoted = await cli(['promote', '--out', out]);
    assert.equal(promoted.code, 0, promoted.err);
    assert.equal(readFileSync(join(out, 'learner', 'index.ts'), 'utf8'), prod.files['learner/index.ts']);
    const manifest = JSON.parse(readFileSync(join(out, 'RELEASE.json'), 'utf8'));
    assert.deepEqual([manifest.change, manifest.verifiers.length, existsSync(join(out, 'learner', 'optim.ts'))], [genesis, 2, true]);
    const refused = await cli(['promote', 'ffffffff']);
    assert.notEqual(refused.code, 0, 'an unknown change cannot be released');
  } finally {
    await hub.close();
  }
});
