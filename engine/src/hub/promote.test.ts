/**
 * The promotion pipeline on the real committed trees (copied, so nothing is changed): production starts at the
 * baseline and lags behind non-production, the consistency check flags what a person should look at, an
 * unapproved flagged promotion waits, an approved one goes through and is recorded, and a change the gate
 * did not accept is refused.
 */
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { Tree } from '../app/tree.ts';
import { generateIdentity } from '../identity/keys.ts';
import { Hub } from './server.ts';

const REAL = new URL('../../../', import.meta.url).pathname;

test('production lags non-production, flags go to a person, and only accepted changes are promoted', { timeout: 120_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'hg-promote-'));
  cpSync(join(REAL, 'trees', 'ml'), root, { recursive: true });
  const tree = new Tree(root, REAL);
  const hub = new Hub({ trees: [tree], token: 'sesame', bots: { 'bot-1': generateIdentity().secret, 'bot-2': generateIdentity().secret } });
  const url = `http://127.0.0.1:${await hub.listen(0)}`;
  const jobs = (body: unknown, token: string | null = 'sesame') => fetch(`${url}/v1/trees/ml/jobs`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const finish = async (res: Response): Promise<{ events: { event: string; data: any }[]; result: any }> => {
    assert.equal(res.status, 202);
    const text = await (await fetch(`${url}/v1/jobs/${((await res.json()) as any).job}/events`)).text();
    const events = text.split('\n\n').filter(Boolean).map((b) => ({ event: b.match(/^event: (.+)$/m)![1]!, data: JSON.parse(b.match(/^data: (.+)$/m)![1]!) }));
    return { events, result: events.at(-1)!.data.result };
  };
  try {
    // production starts at the baseline, behind the best version that passed the gate
    await fetch(`${url}/v1/trees/ml/production`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer sesame' }, body: JSON.stringify({ action: 'reset' }) });
    const before = (await (await fetch(`${url}/v1/trees/ml/pipeline`)).json()) as any;
    assert.equal(before.inSync, false);
    assert.equal(before.behindBy, 2, 'standardise and Adam are not in production yet');
    assert.ok(before.gapBp > 2000, `non-production is ahead (${before.gapBp} bp)`);
    assert.ok(before.flags.length >= 1 && /thin/.test(before.flags[0]), 'Adam\'s interval starts below the minimum effect, so a person must look');

    // the same flag stops an unapproved promotion; nothing moved
    assert.equal((await jobs({ kind: 'promote' }, null)).status, 401);
    const waiting = await finish(await jobs({ kind: 'promote' }));
    assert.equal(waiting.result.status, 'needs-human');
    assert.ok(waiting.events.some((e) => e.event === 'hitl'));
    assert.deepEqual(waiting.events.filter((e) => e.event === 'stage').map((e) => e.data.stage), ['bots', 'gate', 'consistency', 'human']);
    assert.equal(((await (await fetch(`${url}/v1/trees/ml/pipeline`)).json()) as any).inSync, false, 'production did not move');

    // a bad approval is refused before a job starts
    assert.equal((await jobs({ kind: 'promote', approval: { by: '' } })).status, 400);

    // a person approves by name; it is promoted, recorded, and the benchmark change is shown
    const approved = await finish(await jobs({ kind: 'promote', approval: { by: 'Kai', note: 'The interval is thin but every group improved.' } }));
    assert.deepEqual([approved.result.status, approved.result.mode, approved.result.by], ['promoted', 'human', 'Kai']);
    assert.deepEqual(approved.events.filter((e) => e.event === 'stage').map((e) => e.data.stage), ['bots', 'gate', 'consistency', 'human', 'promote', 'benchmark']);
    const bench = approved.events.find((e) => e.event === 'benchmark')!.data;
    assert.ok(bench.toScoreBp > bench.fromScoreBp && bench.perTask.length === 12 && bench.perGroup.length === 4);
    const after = (await (await fetch(`${url}/v1/trees/ml/pipeline`)).json()) as any;
    assert.deepEqual([after.inSync, after.gapBp, after.history.at(-1).by], [true, 0, 'Kai']);
    assert.equal(((await (await fetch(`${url}/v1/trees/ml/production`)).json()) as any).change, approved.result.change);
    assert.equal((await finish(await jobs({ kind: 'promote' }))).result.status, 'in-sync');

    // a change the gate rejected is refused, and production stays where it is
    const momentum = tree.snapshot().changes.find((c) => c.body.claim.motif === 'momentum')!;
    const refused = await finish(await jobs({ kind: 'promote', change: momentum.id }));
    assert.deepEqual([refused.result.status, refused.result.code], ['refused', 'NO_EFFECT']);
    assert.equal(((await (await fetch(`${url}/v1/trees/ml/pipeline`)).json()) as any).inSync, true);
  } finally {
    await hub.close();
  }
});
