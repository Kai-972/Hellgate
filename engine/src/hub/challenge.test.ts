/**
 * Beat the gate (the Stage 14 gate): one typed instruction becomes a real change, recorded against the
 * provider by a house author key and replayed by two other keys, streamed to the visitor as it happens.
 * The fake provider answers every task with its reference solution, so the instruction cannot help
 * and the honest verdict is a rejection, with numbers.
 */
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { initTree } from '../app/actions.ts';
import { generateIdentity } from '../identity/keys.ts';
import { cleanInstruction, MAX_INSTRUCTION, withInstruction } from './challenge.ts';
import { Hub } from './server.ts';

const REAL = new URL('../../../', import.meta.url).pathname;
const TASKS = ['slugify', 'parse-duration'];

test('cleanInstruction and withInstruction', () => {
  assert.equal(cleanInstruction('  Handle   empty\n input  first. '), 'Handle empty input first.');
  assert.throws(() => cleanInstruction('short'), /at least/);
  assert.throws(() => cleanInstruction('x'.repeat(MAX_INSTRUCTION + 1)), /under/);
  assert.throws(() => cleanInstruction(42), /string/);
  assert.throws(() => cleanInstruction('has a \u0007 bell inside it'), /control/);

  const rules = "export const RULES: string[] = [\n  'a',\n];\n";
  const out = withInstruction(rules, 'Say "hi" \\ and `ticks` ${x}');
  assert.equal(out, `export const RULES: string[] = [\n  'a',\n  "Say \\"hi\\" \\\\ and \`ticks\` \${x}",\n];\n`);
  const loaded = new Function(`${out.replace('export const RULES: string[]', 'const RULES')}; return RULES;`)() as string[];
  assert.deepEqual(loaded, ['a', 'Say "hi" \\ and `ticks` ${x}'], 'the instruction survives as exactly one string');
  assert.throws(() => withInstruction('nothing here', 'hello there friend'), /RULES/);
});

test('a challenge streams through the hub and is judged like any other change', { timeout: 300_000 }, async () => {
  const repo = mkdtempSync(join(tmpdir(), 'hg-challenge-'));
  for (const t of TASKS) cpSync(join(REAL, 'suites', 'code', 'public', t), join(repo, 'suites', 'code', 'public', t), { recursive: true });
  cpSync(join(REAL, 'agent'), join(repo, 'agent'), { recursive: true });

  let calls = 0;
  const fake = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const prompt: string = JSON.parse(Buffer.concat(chunks).toString('utf8')).contents[0].parts[0].text;
    const id = TASKS.find((t) => prompt.toLowerCase().includes(t === 'slugify' ? 'slug' : 'duration'))!;
    calls++;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: '```js\n' + readFileSync(join(REAL, 'suites', 'code', 'reference', `${id}.mjs`), 'utf8') + '```' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 80 } }));
  });
  await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve));
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, GEMINI_API_KEY: 'k', GROQ_API_KEY: 'k', HELLGATE_GEMINI_URL: `http://127.0.0.1:${(fake.address() as { port: number }).port}`, HELLGATE_GROQ_URL: 'http://127.0.0.1:1', HELLGATE_RPM_GEMINI: '6000' };

  const owner = generateIdentity();
  Object.assign(process.env, env); // the hub's own jobs read the process environment
  const { tree } = await initTree({ root: mkdtempSync(join(tmpdir(), 'hg-codetree-')), domain: 'code', name: 'demo', identity: owner, runs: 3, repo, env });
  const afterInit = calls;

  const hub = new Hub({
    trees: [tree], token: 'sesame',
    bots: { 'bot-1': generateIdentity().secret, 'bot-2': generateIdentity().secret },
    challenger: generateIdentity().secret,
  });
  const url = `http://127.0.0.1:${await hub.listen(0)}`;
  const start = (body: unknown, token: string | null = 'sesame') => fetch(`${url}/v1/jobs`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await start({ kind: 'challenge', instruction: 'Check empty input first.' }, null)).status, 401);
    const bad = await start({ kind: 'challenge', instruction: 'tiny' });
    assert.equal(bad.status, 400);
    assert.match(((await bad.json()) as any).error, /at least/);
    assert.equal(calls, afterInit, 'nothing ran for a refused request');

    const instruction = 'Always return the empty string for empty input before doing anything else.';
    const accepted = await start({ kind: 'challenge', instruction });
    assert.equal(accepted.status, 202);
    const { job } = (await accepted.json()) as { job: string };
    assert.equal((await start({ kind: 'challenge', instruction: 'Another instruction that is long enough.' })).status, 409);

    const text = await (await fetch(`${url}/v1/jobs/${job}/events`)).text();
    const stream = text.split('\n\n').filter(Boolean).map((b) => ({ event: b.match(/^event: (.+)$/m)![1]!, data: JSON.parse(b.match(/^data: (.+)$/m)![1]!) }));
    const stages = stream.filter((e) => e.event === 'stage').map((e) => `${e.data.stage}${e.data.as ? `:${e.data.as}` : ''}`);
    assert.deepEqual(stages, ['build', 'record:author', 'verify:bot-1', 'sign:bot-1', 'verify:bot-2', 'sign:bot-2']);
    assert.equal(stream.filter((e) => e.event === 'attestation').length, 2);
    assert.equal(stream.filter((e) => e.event === 'progress').length, 3 * (2 * 3 * TASKS.length), 'author, bot-1 and bot-2 each measured both sides');
    assert.equal(calls - afterInit, 3 * TASKS.length, 'only the candidate was recorded live; every verification replayed');

    const done = stream[stream.length - 1]!;
    assert.equal(done.event, 'done');
    assert.deepEqual([done.data.result.status, done.data.result.code], ['rejected', 'NO_EFFECT']);

    const row = tree.snapshot().byId.get(done.data.result.change)!;
    assert.deepEqual([row.body.origin.by, row.body.origin.instruction], ['challenge', instruction]);
    assert.match(tree.buildFiles(row.body.build)['agent/instructions.ts']!, /Always return the empty string/);
    assert.equal(row.attestations.length, 2);

    // the same instruction again is answered from the ledger and spends nothing
    const before = calls;
    const again = await start({ kind: 'challenge', instruction: `  ${instruction}  ` });
    assert.equal(again.status, 202);
    const replay = (await (await fetch(`${url}/v1/jobs/${((await again.json()) as any).job}/events`)).text()).split('\n\n').filter(Boolean);
    const last = JSON.parse(replay[replay.length - 1]!.match(/^data: (.+)$/m)![1]!);
    assert.deepEqual([last.result.change, last.result.repeated, calls], [done.data.result.change, true, before]);
  } finally {
    await hub.close();
    fake.closeAllConnections();
    fake.close();
  }
});
