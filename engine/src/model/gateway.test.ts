/**
 * The model gateway: the request key, both providers' mappings (against a fake HTTP server), the budget,
 * rate limiting, retries, and record-then-replay.
 */
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import test from 'node:test';

import { HellgateError } from '../core/errors.ts';
import { parseRecord, toRecord } from '../ledger/records.ts';
import { seedHex } from '../suite/seeds.ts';
import { Gateway, ReplayMiss } from './gateway.ts';
import { requestKey, splitModelRef } from './key.ts';
import { RateLimiter, TokenLimiter } from './limiter.ts';
import { GeminiProvider, GroqProvider, ProviderError } from './providers.ts';
import { ModelCallRefused, parseModelRequest, type ModelRequest } from './types.ts';

const SEED = seedHex('f'.repeat(64), 0);
const REQ: ModelRequest = { tag: 'draft', messages: [{ role: 'user', text: 'Write slugify.' }], system: 'You write JavaScript.', maxOutputTokens: 400, temperature: 0.2 };

/* ------------------------------------------------------------------ a fake provider server */

interface Seen {
  url: string;
  headers: IncomingMessage['headers'];
  body: any;
}
interface Fake {
  server: Server;
  url: string;
  seen: Seen[];
  /** What to answer, per call. A function gets the 0-based call number. */
  respond: (n: number, seen: Seen) => { status?: number; body: unknown; headers?: Record<string, string> };
  close: () => Promise<void>;
}

async function fake(respond: Fake['respond']): Promise<Fake> {
  const seen: Seen[] = [];
  const f = { seen, respond } as Fake;
  f.server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const entry: Seen = { url: req.url ?? '', headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') };
    seen.push(entry);
    const out = f.respond(seen.length - 1, entry);
    res.writeHead(out.status ?? 200, { 'content-type': 'application/json', ...(out.headers ?? {}) });
    res.end(typeof out.body === 'string' ? out.body : JSON.stringify(out.body));
  });
  await new Promise<void>((resolve) => f.server.listen(0, '127.0.0.1', resolve));
  f.url = `http://127.0.0.1:${(f.server.address() as { port: number }).port}`;
  f.close = () => new Promise((resolve) => (f.server.closeAllConnections(), f.server.close(() => resolve())));
  return f;
}

const geminiAnswer = (text: string, finish = 'STOP') => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: finish }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 } });
const groqAnswer = (text: string, finish = 'stop') => ({ choices: [{ message: { content: text }, finish_reason: finish }], usage: { prompt_tokens: 13, completion_tokens: 5 } });
const noSleep = async () => undefined;
const signal = new AbortController().signal;

/* ------------------------------------------------------------------ the request key */

test('the request key is stable, ignores the slot and the tag, and changes with anything that changes the answer', () => {
  const key = requestKey('gemini', 'm', REQ, 7);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(requestKey('gemini', 'm', REQ, 7), key);
  assert.equal(requestKey('gemini', 'm', { ...REQ, tag: 'renamed', slot: 'secondary' }, 7), key, 'slot and tag are not part of the key');
  assert.equal(requestKey('gemini', 'm', { ...REQ, temperature: 0.2000001 }, 7), key, 'temperature is rounded to a hundredth');
  for (const [label, other] of [
    ['provider', requestKey('groq', 'm', REQ, 7)], ['model', requestKey('gemini', 'm2', REQ, 7)], ['seed', requestKey('gemini', 'm', REQ, 8)],
    ['system', requestKey('gemini', 'm', { ...REQ, system: 'other' }, 7)], ['message', requestKey('gemini', 'm', { ...REQ, messages: [{ role: 'user', text: 'x' }] }, 7)],
    ['role', requestKey('gemini', 'm', { ...REQ, messages: [{ role: 'assistant', text: 'Write slugify.' }] }, 7)],
    ['max tokens', requestKey('gemini', 'm', { ...REQ, maxOutputTokens: 401 }, 7)], ['temperature', requestKey('gemini', 'm', { ...REQ, temperature: 0.3 }, 7)],
    ['stop', requestKey('gemini', 'm', { ...REQ, stop: ['\n\n'] }, 7)],
  ] as const) assert.notEqual(other, key, label);
  assert.notEqual(requestKey('gemini', 'm', { tag: 'a', messages: REQ.messages }, 7), requestKey('gemini', 'm', { tag: 'a', messages: REQ.messages, temperature: 0 }, 7), 'absent is not zero');
  assert.deepEqual(splitModelRef('groq:openai/gpt-oss-20b'), { provider: 'groq', model: 'openai/gpt-oss-20b' });
});

test('an untrusted request is checked before it is acted on', () => {
  assert.equal(parseModelRequest(REQ).ok, true);
  for (const bad of [{ ...REQ, slot: 'proposer' }, { ...REQ, model: 'gpt-9' }, { ...REQ, messages: [] }, { ...REQ, maxOutputTokens: 10 ** 7 }, { ...REQ, temperature: 5 }, { tag: '', messages: REQ.messages }]) {
    assert.equal(parseModelRequest(bad).ok, false, JSON.stringify(bad).slice(0, 60));
  }
});

/* ------------------------------------------------------------------ providers */

test('Gemini: the request is mapped as documented and the reply is read back', async () => {
  const f = await fake(() => ({ body: geminiAnswer('const x = 1;') }));
  try {
    const gemini = new GeminiProvider('KEY', { baseUrl: f.url });
    const reply = await gemini.generate({ model: 'gemini-test', seed: 99, request: { ...REQ, stop: ['END'], messages: [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }, { role: 'user', text: 'c' }] } }, signal);
    assert.deepEqual(reply, { text: 'const x = 1;', finish: 'stop', inputTokens: 11, outputTokens: 7 });
    const sent = f.seen[0]!;
    assert.equal(sent.url, '/v1beta/models/gemini-test:generateContent');
    assert.equal(sent.headers['x-goog-api-key'], 'KEY');
    assert.deepEqual(sent.body.systemInstruction, { parts: [{ text: 'You write JavaScript.' }] });
    assert.deepEqual(sent.body.contents.map((c: any) => [c.role, c.parts[0].text]), [['user', 'a'], ['model', 'b'], ['user', 'c']]);
    assert.deepEqual(sent.body.generationConfig, { maxOutputTokens: 400, temperature: 0.2, stopSequences: ['END'], seed: 99, thinkingConfig: { thinkingBudget: 0 } });

    f.respond = () => ({ body: geminiAnswer('cut off', 'MAX_TOKENS') });
    assert.equal((await gemini.generate({ model: 'm', seed: 1, request: REQ }, signal)).finish, 'length');
    f.respond = () => ({ body: geminiAnswer('x', 'SAFETY') });
    assert.equal((await gemini.generate({ model: 'm', seed: 1, request: REQ }, signal)).finish, 'other');
    f.respond = () => ({ body: { promptFeedback: { blockReason: 'SAFETY' } } });
    await assert.rejects(gemini.generate({ model: 'm', seed: 1, request: REQ }, signal), (e: unknown) => e instanceof ProviderError && !e.retryable && /SAFETY/.test(e.message));
  } finally {
    await f.close();
  }
});

test('Groq: the request is mapped in the OpenAI format and the reply is read back', async () => {
  const f = await fake(() => ({ body: groqAnswer('hello') }));
  try {
    const groq = new GroqProvider('GKEY', { baseUrl: f.url });
    const reply = await groq.generate({ model: 'openai/gpt-oss-20b', seed: 5, request: { ...REQ, stop: ['END'] } }, signal);
    assert.deepEqual(reply, { text: 'hello', finish: 'stop', inputTokens: 13, outputTokens: 5 });
    const sent = f.seen[0]!;
    assert.equal(sent.url, '/openai/v1/chat/completions');
    assert.equal(sent.headers.authorization, 'Bearer GKEY');
    assert.deepEqual(sent.body.messages, [{ role: 'system', content: 'You write JavaScript.' }, { role: 'user', content: 'Write slugify.' }]);
    assert.deepEqual([sent.body.max_completion_tokens, sent.body.temperature, sent.body.stop, sent.body.seed], [400, 0.2, ['END'], 5]);
    assert.equal(sent.body.reasoning_effort, 'low', 'a reasoning model is kept from spending its whole budget thinking');
    await groq.generate({ model: 'llama-x', seed: 5, request: { tag: 't', messages: REQ.messages } }, signal);
    assert.equal('reasoning_effort' in f.seen[1]!.body, false);
    assert.equal('system' in f.seen[1]!.body, false);
    f.respond = () => ({ body: groqAnswer('t', 'length') });
    assert.equal((await groq.generate({ model: 'm', seed: 1, request: REQ }, signal)).finish, 'length');
  } finally {
    await f.close();
  }
});

test('provider failures say whether they are worth retrying', async () => {
  const f = await fake((n) => (n === 0 ? { status: 429, body: 'slow down', headers: { 'retry-after': '2' } } : n === 1 ? { status: 503, body: 'down' } : n === 2 ? { status: 400, body: 'bad request' } : { body: 'not json' }));
  try {
    const g = new GroqProvider('k', { baseUrl: f.url });
    const attempt = () => g.generate({ model: 'm', seed: 1, request: REQ }, signal).catch((e: ProviderError) => e);
    const [limited, down, bad, junk] = [await attempt(), await attempt(), await attempt(), await attempt()] as ProviderError[];
    assert.deepEqual([limited!.status, limited!.retryable, limited!.retryAfterMs], [429, true, 2000]);
    assert.deepEqual([down!.status, down!.retryable], [503, true]);
    assert.deepEqual([bad!.status, bad!.retryable], [400, false]);
    assert.equal(junk!.retryable, true);
    const unreachable = await new GroqProvider('k', { baseUrl: 'http://127.0.0.1:1' }).generate({ model: 'm', seed: 1, request: REQ }, signal).catch((e: ProviderError) => e);
    assert.equal((unreachable as ProviderError).retryable, true, 'a network failure is retryable');
  } finally {
    await f.close();
  }
});

/* ------------------------------------------------------------------ the gateway */

const FAST = { gemini: 6000, groq: 6000 };
const models = { primary: 'gemini:gem-1', secondary: 'groq:grq-1' };

async function twoProviders() {
  const g = await fake((n) => ({ body: geminiAnswer(`gemini says ${n}`) }));
  const q = await fake((n) => ({ body: groqAnswer(`groq says ${n}`) }));
  return {
    g, q,
    providers: { gemini: new GeminiProvider('k', { baseUrl: g.url }), groq: new GroqProvider('k', { baseUrl: q.url }) },
    close: async () => { await g.close(); await q.close(); },
  };
}

test('slots resolve to providers through the tree config, and the agent cannot name anything else', async () => {
  const p = await twoProviders();
  try {
    const gw = new Gateway({ mode: 'live', models, providers: p.providers, rpm: FAST });
    const session = gw.session(SEED);
    assert.equal((await session.serve(REQ)).text, 'gemini says 0');
    assert.equal((await session.serve({ ...REQ, slot: 'primary' })).text, 'gemini says 1');
    assert.equal((await session.serve({ ...REQ, slot: 'secondary', tag: 'review' })).text, 'groq says 0');
    assert.equal(p.g.seen[0]!.url, '/v1beta/models/gem-1:generateContent');
    assert.equal(p.q.seen[0]!.body.model, 'grq-1');
    assert.equal(p.g.seen[0]!.body.generationConfig.seed, parseInt(SEED.slice(0, 8), 16) % 2 ** 31, 'the run seed is sent, not anything the agent chose');
    assert.deepEqual([gw.usage.primary.calls, gw.usage.secondary.calls, gw.usage.secondary.inputTokens, gw.usage.primary.outputTokens], [2, 1, 13, 14], 'cost is counted per slot');
    const noSecond = new Gateway({ mode: 'live', models: { primary: models.primary, secondary: null }, providers: p.providers, rpm: FAST }).session(SEED);
    await assert.rejects(noSecond.serve({ ...REQ, slot: 'secondary' }), ModelCallRefused);
  } finally {
    await p.close();
  }
});

test('the per-task budget refuses the seventh call, tokens beyond the limit, and reports what is left', async () => {
  const p = await twoProviders();
  try {
    const gw = new Gateway({ mode: 'live', models, providers: p.providers, rpm: FAST });
    const s = gw.session(SEED);
    assert.deepEqual(s.remaining().calls, 6);
    for (let i = 0; i < 6; i++) await s.serve({ ...REQ, tag: `c${i}` });
    assert.deepEqual([s.remaining().calls, s.remaining().tokens], [0, 60_000 - 6 * 18]);
    await assert.rejects(s.serve(REQ), (e: unknown) => e instanceof ModelCallRefused && /6 model calls/.test(e.message));
    assert.equal(p.g.seen.length, 6, 'the refused call never reached the provider');
    assert.equal((await gw.session(SEED).serve(REQ)).text.startsWith('gemini'), true, 'another task has its own budget');

    const tight = new Gateway({ mode: 'live', models, providers: p.providers, rpm: FAST, budget: { calls: 6, tokens: 20, ms: 90_000 } }).session(SEED);
    await tight.serve(REQ);
    await tight.serve(REQ);
    await assert.rejects(tight.serve(REQ), /20 tokens/);
    const slow = new Gateway({ mode: 'live', models, providers: p.providers, rpm: FAST, budget: { calls: 6, tokens: 100, ms: 0 } }).session(SEED);
    await assert.rejects(slow.serve(REQ), /time budget/);
  } finally {
    await p.close();
  }
});

test('transient failures are retried with backoff, permanent ones and exhausted retries are errors, never scores', async () => {
  const waits: number[] = [];
  const f = await fake((n) => (n === 0 ? { status: 429, body: 'x', headers: { 'retry-after': '3' } } : n === 1 ? { status: 503, body: 'x' } : { body: geminiAnswer('finally') }));
  try {
    const providers = { gemini: new GeminiProvider('k', { baseUrl: f.url }) };
    const gw = new Gateway({ mode: 'live', models, providers, rpm: FAST, retries: { baseMs: 100, sleep: async (ms) => void waits.push(ms) } });
    assert.equal((await gw.session(SEED).serve(REQ)).text, 'finally');
    assert.deepEqual(waits, [3000, 200], 'Retry-After is honoured, then exponential backoff');
    assert.equal(f.seen.length, 3);

    f.respond = () => ({ status: 400, body: 'nope' });
    await assert.rejects(gw.session(SEED).serve(REQ), (e: unknown) => e instanceof HellgateError && e.kind === 'environment' && /400/.test(e.message));
    f.respond = () => ({ status: 500, body: 'down' });
    const before = f.seen.length;
    await assert.rejects(gw.session(SEED).serve(REQ), (e: unknown) => e instanceof HellgateError && /kept failing after 5 attempts/.test(e.message));
    assert.equal(f.seen.length - before, 5);
    const none = new Gateway({ mode: 'live', models, providers: {}, retries: { sleep: noSleep } });
    await assert.rejects(none.session(SEED).serve(REQ), /no gemini client/);
  } finally {
    await f.close();
  }
});

test('record then replay: the replay serves exactly what was recorded, with no network, and a miss is loud', async () => {
  const p = await twoProviders();
  try {
    const recorder = new Gateway({ mode: 'record', models, providers: p.providers, rpm: FAST });
    const s = recorder.session(SEED);
    const first = await s.serve(REQ);
    const second = await s.serve({ ...REQ, slot: 'secondary' });
    await s.serve(REQ); // the same request again, answered by the provider a second time
    assert.equal(recorder.recorded.size, 2, 'an identical request is recorded once');

    const body = recorder.recordingBody('a'.repeat(64), 'b'.repeat(64), 5);
    assert.equal(parseRecord({ body }).ok, true, 'the recording is a valid record');
    assert.deepEqual(body.entries.map((e) => e.key), [...body.entries.map((e) => e.key)].sort());
    assert.deepEqual(body.entries.map((e) => e.slot).sort(), ['primary', 'secondary']);
    assert.equal(toRecord(body).id.length, 64);

    const callsBefore = p.g.seen.length + p.q.seen.length;
    const replay = Gateway.fromRecording(body, { providers: {} });
    const rs = replay.session(SEED);
    assert.deepEqual(await rs.serve(REQ), first);
    assert.deepEqual(await rs.serve({ ...REQ, slot: 'secondary', tag: 'renamed' }), second, 'the tag is not part of the key');
    assert.equal(p.g.seen.length + p.q.seen.length, callsBefore, 'a replay makes no network call');
    assert.deepEqual([rs.remaining().calls, rs.missed], [4, 0]);

    await assert.rejects(rs.serve({ ...REQ, messages: [{ role: 'user', text: 'something else' }] }), (e: unknown) => e instanceof ModelCallRefused && /not in the recording/.test(e.message));
    assert.equal(rs.missed, 1, 'the miss is counted, so the batch can be marked unclean');
    await assert.rejects(replay.session(SEED.replace(/^./, '0')).serve(REQ), ModelCallRefused, 'a different seed is a different request');
    assert.ok(new ReplayMiss('k') instanceof Error);
  } finally {
    await p.close();
  }
});

/* ------------------------------------------------------------------ the rate limiter */

test('the limiter lets a burst through, then spaces requests to the allowed rate', async () => {
  let clock = 0;
  const waits: number[] = [];
  const limiter = new RateLimiter(60, { burst: 2, now: () => clock, sleep: async (ms) => { waits.push(ms); clock += ms; } });
  for (let i = 0; i < 5; i++) await limiter.acquire();
  assert.deepEqual(waits, [1000, 1000, 1000], 'two instantly, then one a second (60 a minute)');
  clock += 10_000;
  await limiter.acquire();
  assert.equal(waits.length, 3, 'an idle limiter refills');
  const order: number[] = [];
  const slow = new RateLimiter(60, { burst: 1, now: () => clock, sleep: async (ms) => { clock += ms; } });
  await Promise.all([1, 2, 3].map((n) => slow.acquire().then(() => order.push(n))));
  assert.deepEqual(order, [1, 2, 3], 'served in the order requested');
});

test('the token limiter keeps a sliding minute under its limit, in order, and learns what was really used', async () => {
  let clock = 0;
  const waits: number[] = [];
  const limiter = new TokenLimiter(1000, { now: () => clock, sleep: async (ms) => { waits.push(ms); clock += ms; } });
  const a = await limiter.reserve(600);
  await limiter.reserve(300);
  assert.deepEqual(waits, [], 'room for both');
  a(100); // the first call used far less than it reserved
  await limiter.reserve(600); // 100 + 300 + 600 fits
  assert.deepEqual(waits, []);
  await limiter.reserve(500); // 1000 used; it has to wait for the first spend to leave the minute
  assert.ok(waits.length > 0 && clock >= 60_000 && clock < 61_000, `waited about a minute, not ${clock} ms`);
  const big = new TokenLimiter(100, { now: () => clock, sleep: async (ms) => { clock += ms; } });
  await big.reserve(5000); // an empty minute takes any single request
  const before = clock;
  await big.reserve(5);
  assert.ok(clock - before >= 59_000, 'but the next one waits for it to leave');
  const order: number[] = [];
  const queue = new TokenLimiter(10, { now: () => clock, sleep: async (ms) => { clock += ms; } });
  await Promise.all([1, 2, 3].map((n) => queue.reserve(8).then(() => order.push(n))));
  assert.deepEqual(order, [1, 2, 3]);
});
