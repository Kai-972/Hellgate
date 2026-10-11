/**
 * The offline loop for the `code` domain, through the real CLI, against fake model providers: an author
 * records, and verifiers replay with no key and no network. The fake answers every task with its
 * reference solution, so what is being tested is the machinery, not the model.
 */
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadIdentity } from '../identity/keys.ts';
import { Tree } from '../app/tree.ts';
import { buildExport } from '../export/build.ts';
import { run } from './main.ts';

const REAL = new URL('../../../', import.meta.url).pathname;
const TASKS = ['slugify', 'parse-duration'];

function miniRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'hg-coderepo-'));
  for (const t of TASKS) cpSync(join(REAL, 'suites', 'code', 'public', t), join(repo, 'suites', 'code', 'public', t), { recursive: true });
  cpSync(join(REAL, 'agent'), join(repo, 'agent'), { recursive: true });
  return repo;
}

/** A fake Gemini that answers with the reference solution of whichever task the prompt is about. */
async function fakeGemini(): Promise<{ server: Server; url: string; requests: { tag: string }[] }> {
  const requests: { tag: string }[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const prompt: string = body.contents[0].parts[0].text;
    const id = TASKS.find((t) => prompt.toLowerCase().includes(t === 'slugify' ? 'slug' : 'duration'))!;
    requests.push({ tag: id });
    const code = readFileSync(join(REAL, 'suites', 'code', 'reference', `${id}.mjs`), 'utf8');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: '```js\n' + code + '```' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 80 } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, requests };
}

async function cli(env: NodeJS.ProcessEnv, args: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const code = await run(args, { out: (t) => (out += t + '\n'), err: (t) => (err += t + '\n'), env, cwd: process.cwd(), tty: false });
  return { code, out, err };
}

test('the code domain: an author records against the provider, verifiers replay with no key and no network', { timeout: 300_000 }, async () => {
  const repo = miniRepo();
  const fake = await fakeGemini();
  const person = async (withKeys: boolean) => {
    const home = mkdtempSync(join(tmpdir(), 'hg-home-'));
    const env: NodeJS.ProcessEnv = { HELLGATE_HOME: home, HELLGATE_REPO: repo, PATH: process.env.PATH, ...(withKeys ? { GEMINI_API_KEY: 'k', GROQ_API_KEY: 'k', HELLGATE_GEMINI_URL: fake.url, HELLGATE_GROQ_URL: 'http://127.0.0.1:1', HELLGATE_RPM_GEMINI: '6000' } : {}) };
    assert.equal((await cli(env, ['id', 'create'])).code, 0);
    return { env, address: loadIdentity(join(home, 'identity.json')).address };
  };
  const [alice, bob, carol] = [await person(true), await person(false), await person(false)];
  const root = mkdtempSync(join(tmpdir(), 'hg-codetree-'));
  const at = (args: string[]) => [...args, '--root', root];
  try {
    const init = await cli(alice.env, at(['init', '--domain', 'code', '--name', 'demo', '--runs', '3']));
    assert.equal(init.code, 0, init.err);
    const genesis = init.out.match(/genesis change ([0-9a-f]{64})/)![1]!;
    assert.equal(fake.requests.length, 3 * TASKS.length, 'the author made one real call per task per run');

    const tree = new Tree(root, repo);
    const g = tree.snapshot().byId.get(genesis)!;
    assert.ok(g.body.recording !== null, 'the genesis change carries its recording');
    const recording = tree.ledger.getTyped(g.body.recording!, 'recording').body;
    assert.equal(recording.entries.length, 3 * TASKS.length);
    assert.deepEqual(recording.models.secondary, 'groq:openai/gpt-oss-120b');

    // Verifiers have no keys and no network: they replay.
    const before = fake.requests.length;
    for (const v of [bob, carol]) assert.equal((await cli(v.env, at(['verify', genesis]))).code, 0);
    assert.equal(fake.requests.length, before, 'verifying made no model call at all');
    const verdict = JSON.parse((await cli(bob.env, at(['check', genesis, '--json']))).out);
    assert.deepEqual([verdict.status, verdict.code], ['accepted', 'GAIN']);
    const att = tree.snapshot().byId.get(genesis)!.attestations;
    assert.ok(att.every((a) => a.body.mode === 'replay' && a.body.clean));
    assert.equal(new Set(att.map((a) => a.body.resultsDigest)).size, 1, 'two replays produce the same digest');
    assert.equal(att[0]!.body.env.model, 'gemini:gemini-3.1-flash-lite');

    const exported = buildExport(tree) as { suite: { tasks: number; cases: number }; models: { primary: string }; changes: { perGroup: unknown[] }[] };
    assert.deepEqual([exported.suite.tasks, exported.suite.cases > 10, exported.models.primary], [2, true, 'gemini:gemini-3.1-flash-lite'], 'the export counts the hidden cases of a coding suite');

    // A child: the parent is replayed from ITS recording, the candidate is recorded live.
    const ws = (await cli(alice.env, at(['propose']))).out.match(/workspace (\S+)/)![1]!;
    writeFileSync(join(ws, 'instructions.ts'), readFileSync(join(ws, 'instructions.ts'), 'utf8').replace('You are a JavaScript programmer.', 'You are an expert JavaScript programmer.'));
    const calls = fake.requests.length;
    const sub = await cli(alice.env, at(['submit', '--from', ws, '--hypothesis', 'Calling the model an expert will make it write slightly more careful code.', '--falsified-if', 'Both verifiers measure under +3 points.', '--area', 'prompt', '--motif', 'expert', '--predict', '2']));
    assert.equal(sub.code, 0, sub.err);
    const child = sub.out.match(/^([0-9a-f]{64})/m)![1]!;
    assert.equal(fake.requests.length - calls, 3 * TASKS.length, 'only the candidate was recorded; the parent was replayed');
    for (const v of [bob, carol]) assert.equal((await cli(v.env, at(['verify', child]))).code, 0);
    assert.equal(fake.requests.length - calls, 3 * TASKS.length, 'verifying the child made no model call either');
    const childVerdict = JSON.parse((await cli(bob.env, at(['check', child, '--json']))).out);
    assert.deepEqual([childVerdict.status, childVerdict.code], ['rejected', 'NO_EFFECT'], 'the same code answers either way, so there is no effect');

    // Without its keys an author cannot record.
    const keyless = await person(false);
    const ws2 = (await cli(keyless.env, at(['propose']))).out.match(/workspace (\S+)/)![1]!;
    writeFileSync(join(ws2, 'instructions.ts'), readFileSync(join(ws2, 'instructions.ts'), 'utf8').replace('You are a JavaScript programmer.', 'You are a JavaScript person.'));
    const noKey = await cli(keyless.env, at(['submit', '--from', ws2, '--hypothesis', 'Calling the model a person will make it write friendlier code.', '--falsified-if', 'Both verifiers measure under +3 points.', '--area', 'prompt', '--motif', 'person', '--predict', '1']));
    assert.equal(noKey.code, 6);
    assert.match(noKey.err, /GEMINI_API_KEY/);
  } finally {
    fake.server.closeAllConnections();
    fake.server.close();
  }
});
