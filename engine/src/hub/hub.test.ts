/**
 * The hub (the Stage 10 gate): records move over HTTP between two separate homes, a verify job streams
 * its events as they happen, and nothing invalid or unauthorised gets in.
 */
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { initTree, verifyChange } from '../app/actions.ts';
import { Tree } from '../app/tree.ts';
import { buildExport } from '../export/build.ts';
import { generateIdentity } from '../identity/keys.ts';
import { toRecord } from '../ledger/records.ts';
import { envelopeOf } from '../ledger/records.ts';
import { Hub } from './server.ts';
import { pull, push } from './sync.ts';

const REAL_REPO = new URL('../../../', import.meta.url).pathname;

function miniRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'hg-repo-'));
  for (const t of ['moons', 'scaled-regression']) cpSync(join(REAL_REPO, 'suites', 'ml', 'public', t), join(repo, 'suites', 'ml', 'public', t), { recursive: true });
  cpSync(join(REAL_REPO, 'learner'), join(repo, 'learner'), { recursive: true });
  return repo;
}

/** An empty tree directory with the same config as `from`: a second machine joining the same tree. */
function joinTree(from: Tree, repo: string): Tree {
  const root = mkdtempSync(join(tmpdir(), 'hg-peer-'));
  mkdirSync(join(root, '.hellgate'), { recursive: true });
  cpSync(join(from.root, '.hellgate', 'config.json'), join(root, '.hellgate', 'config.json'));
  return new Tree(root, repo);
}

async function events(url: string): Promise<{ event: string; data: any }[]> {
  const res = await fetch(url);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const text = await res.text(); // the stream ends when the job does
  return text.split('\n\n').filter(Boolean).map((block) => {
    const event = block.match(/^event: (.+)$/m)![1]!;
    return { event, data: JSON.parse(block.match(/^data: (.+)$/m)![1]!) };
  });
}

test('records move between homes over HTTP, jobs stream live, and bad input is refused', { timeout: 240_000 }, async () => {
  const repo = miniRepo();
  const alice = generateIdentity();
  const { tree, genesis } = await initTree({ root: mkdtempSync(join(tmpdir(), 'hg-tree-')), domain: 'ml', name: 'demo', identity: alice, runs: 3, repo });
  const bots = { 'bot-1': generateIdentity().secret, 'bot-2': generateIdentity().secret };
  const hub = new Hub({ trees: [tree], token: 'sesame', bots });
  const port = await hub.listen(0);
  const url = `http://127.0.0.1:${port}`;
  try {
    // reads
    const trees = (await (await fetch(`${url}/v1/trees`)).json()) as any[];
    assert.deepEqual(trees.map((t) => [t.name, t.domain, t.totals.changes]), [['demo', 'ml', 1]]);
    const before = ((await (await fetch(`${url}/v1/version`)).json()) as { version: string }).version;
    assert.match(before, /^[0-9a-f]{64}$/);
    assert.deepEqual(await (await fetch(`${url}/v1/export`)).json(), JSON.parse(JSON.stringify(buildExport(tree))));
    assert.equal((await fetch(`${url}/v1/trees/demo/export`)).status, 200);
    assert.equal((await fetch(`${url}/v1/trees/nope/export`)).status, 404);
    assert.equal((await fetch(`${url}/v1/records/${'0'.repeat(64)}`)).status, 404);

    // pull: a second home copies everything, and a second pull copies nothing.
    const bobTree = joinTree(tree, repo);
    const first = await pull(url, 'demo', bobTree.ledger, bobTree.config);
    assert.equal(first.rejected.length, 0);
    assert.equal(first.added, tree.ledger.ids().length);
    assert.deepEqual(bobTree.ledger.ids(), tree.ledger.ids());
    assert.equal((await pull(url, 'demo', bobTree.ledger, bobTree.config)).added, 0);

    // Bob verifies on his own machine, pushes his attestation, and the hub's verdict moves.
    const bob = generateIdentity();
    await verifyChange({ tree: bobTree, identity: bob, ref: genesis });
    const pushed = await push(url, 'demo', bobTree.ledger);
    assert.deepEqual([pushed.added, pushed.rejected.length], [1, 0]);
    assert.equal((await push(url, 'demo', bobTree.ledger)).added, 0);
    const afterPush = ((await (await fetch(`${url}/v1/version`)).json()) as { version: string }).version;
    assert.notEqual(afterPush, before, 'the version changes when a record arrives');
    const exp = (await (await fetch(`${url}/v1/export`)).json()) as any;
    assert.equal(exp.changes[0].attestations.length, 1);
    assert.equal(exp.changes[0].code, 'NEEDS_VERIFIERS');

    // intake refuses what does not check out
    const post = (body: unknown) => fetch(`${url}/v1/records`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    const att = bobTree.snapshot().byId.get(genesis)!.attestations[0]!;
    const stored = envelopeOf(toRecord(att.body, (bobTree.ledger.get(att.id) as any).sig)) as { body: any; sig: string };
    assert.equal((await post(stored)).status, 200, 'already present');
    assert.equal((await post({ ...stored, body: { ...stored.body, effectBp: stored.body.effectBp + 1 } })).status, 400, 'tampered body fails its signature');
    assert.equal((await post('not json')).status, 400);
    const dangling = generateIdentity();
    const orphan = { ...stored.body, change: 'a'.repeat(64), signer: dangling.address };
    const { signBody } = await import('../identity/keys.ts');
    const signed = signBody(dangling, orphan);
    const refused = await post({ body: signed.body, sig: signed.sig });
    assert.equal(refused.status, 400);
    assert.match(((await refused.json()) as any).error, /not held/);
    const elsewhere = signBody(dangling, { ...stored.body, change: genesis, tree: 'another', signer: dangling.address });
    assert.equal((await post({ body: elsewhere.body, sig: elsewhere.sig })).status, 403, 'a record for another tree');

    // jobs need the token, one at a time, and stream every event
    const start = (body: unknown, token: string | null = 'sesame') => fetch(`${url}/v1/jobs`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    assert.equal((await start({ kind: 'verify', change: genesis }, null)).status, 401);
    assert.equal((await start({ kind: 'verify', change: genesis }, 'wrong')).status, 401);
    assert.equal((await start({ kind: 'verify', change: genesis, as: 'bot-9' })).status, 400);
    assert.equal((await start({ kind: 'challenge', instruction: 'x', parent: null })).status, 501);
    assert.equal((await fetch(`${url}/v1/jobs/current`)).status, 204);

    const accepted = await start({ kind: 'verify', change: genesis.slice(0, 10), as: 'bot-1' });
    assert.equal(accepted.status, 202);
    const { job } = (await accepted.json()) as { job: string };
    const busy = await start({ kind: 'verify', change: genesis, as: 'bot-2' });
    assert.equal(busy.status, 409);
    assert.equal(((await busy.json()) as any).job, job);

    const stream = await events(`${url}/v1/jobs/${job}/events`);
    const names = stream.map((e) => e.event);
    assert.deepEqual([names[0], names[1], names[names.length - 1]], ['log', 'stage', 'done']);
    for (const needed of ['progress', 'attestation', 'change']) assert.ok(names.includes(needed), needed);
    const progress = stream.filter((e) => e.event === 'progress').map((e) => e.data);
    assert.equal(progress.length, 12, '2 sides × 3 runs × 2 tasks');
    assert.deepEqual([progress[0].side, progress[11].side, progress[11].done, progress[11].of], ['parent', 'candidate', 12, 12]);
    assert.ok(progress.every((p: any) => p.cases > 0 && p.passedCases <= p.cases));
    const doneEvent = stream[stream.length - 1]!.data.result;
    assert.equal(doneEvent.change, genesis);
    assert.equal(doneEvent.status, 'accepted', 'bot-1 and Bob make two distinct keys');

    // finished jobs can be read and replayed, and the hub is free again
    const status = (await (await fetch(`${url}/v1/jobs/${job}`)).json()) as any;
    assert.deepEqual([status.state, status.result.code], ['done', 'GAIN']);
    assert.deepEqual((await events(`${url}/v1/jobs/${job}/events`)).map((e) => e.event), names, 'a late client sees the same stream');
    assert.equal((await fetch(`${url}/v1/jobs/current`)).status, 204);
    assert.equal((await fetch(`${url}/v1/jobs/nope`)).status, 404);

    // events really arrive while the job runs: the first one is read before the job has finished.
    const second = (await (await start({ kind: 'verify', change: genesis, as: 'bot-2' })).json()) as { job: string };
    const reader = (await fetch(`${url}/v1/jobs/${second.job}/events`)).body!.getReader();
    const firstChunk = await reader.read();
    assert.match(new TextDecoder().decode(firstChunk.value), /^event: log/);
    assert.equal(((await (await fetch(`${url}/v1/jobs/${second.job}`)).json()) as any).state, 'running');
    assert.equal(((await (await fetch(`${url}/v1/jobs/current`)).json()) as any).job, second.job);
    await reader.cancel();
    for (let i = 0; i < 100 && ((await (await fetch(`${url}/v1/jobs/${second.job}`)).json()) as any).state === 'running'; i++) await new Promise((r) => setTimeout(r, 100));
  } finally {
    await hub.close();
  }
});

test('a hub serves several trees, and without a token it refuses jobs outright', { timeout: 120_000 }, async () => {
  const repo = miniRepo();
  const [a, b] = await Promise.all([
    initTree({ root: mkdtempSync(join(tmpdir(), 'hg-a-')), domain: 'ml', name: 'first', identity: generateIdentity(), runs: 3, repo }),
    initTree({ root: mkdtempSync(join(tmpdir(), 'hg-b-')), domain: 'ml', name: 'second', identity: generateIdentity(), runs: 3, repo }),
  ]);
  const hub = new Hub({ trees: [a.tree, b.tree] });
  const url = `http://127.0.0.1:${await hub.listen(0)}`;
  try {
    assert.deepEqual(((await (await fetch(`${url}/v1/trees`)).json()) as any[]).map((t) => t.name), ['first', 'second']);
    assert.equal(((await (await fetch(`${url}/v1/export`)).json()) as any).tree, 'first', 'the plain routes serve the first tree');
    assert.equal(((await (await fetch(`${url}/v1/trees/second/export`)).json()) as any).tree, 'second');
    const job = await fetch(`${url}/v1/jobs`, { method: 'POST', headers: { authorization: 'Bearer anything' }, body: '{}' });
    assert.equal(job.status, 401);
  } finally {
    await hub.close();
  }
});
