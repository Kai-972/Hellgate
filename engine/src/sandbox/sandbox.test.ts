/**
 * The sandbox, including the five canaries of Stage 4 (docs/STAGES.md). Each canary is a test whose
 * name starts with "CANARY".
 *
 * These tests run real jails: real child processes under Node's permission model. A jail that
 * silently stopped jailing would show up here, not in production.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import test from 'node:test';

import { mulberry32 } from '../core/rng.ts';
import { ModelCallRefused, type ModelReply, type ModelRequest } from '../model/types.ts';
import { codeBrief, loadSuite } from '../suite/loader.ts';
import { learnSeed, seedHex } from '../suite/seeds.ts';
import type { MlTaskView } from '../suite/tasks.ts';
import { runAgent } from './agent.ts';
import { runCaseTests } from './cases.ts';
import { runCodeTask } from './codetask.ts';
import { jailFlags } from './jail.ts';
import { lanesFromEnv, mapLanes } from './lanes.ts';
import { runLearner, runMlTask } from './learner.ts';
import { checkAnswerFiles, type JailFile } from './workdir.ts';

const SUITES = new URL('../../../suites/', import.meta.url).pathname;
const code = loadSuite(join(SUITES, 'code', 'public'), 'code');
const ml = loadSuite(join(SUITES, 'ml', 'public'), 'ml');
const codeTask = (id: string) => code.tasks.find((t) => t.id === id)!;
const mlTask = (id: string) => ml.tasks.find((t) => t.id === id)!;
const reference = (id: string): string => readFileSync(join(SUITES, 'code', 'reference', `${id}.mjs`), 'utf8');

const agent = (source: string): JailFile[] => [{ path: 'agent/index.ts', contents: source }];
const learner = (source: string): JailFile[] => [{ path: 'learner/index.ts', contents: source }];
const solution = (source: string): JailFile[] => [{ path: 'solution.mjs', contents: source }];
const cases = (...bodies: string[]): string =>
  `export default [${bodies.map((b, i) => `{ name: 'case ${i}', run: (m, a) => { ${b} } }`).join(',\n')}];\n`;

/** An agent that answers every task with the same files. */
const answering = (files: JailFile[]): JailFile[] =>
  agent(`export async function solve() { return { files: ${JSON.stringify(files)} }; }\n`);

const noModel = async (): Promise<ModelReply> => {
  throw new Error('this agent should not call the model');
};
const budget = () => ({ calls: 6, tokens: 20_000, ms: 60_000 });
const SEED = seedHex(code.id, 0);

const PROBE = `
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const probe = (f) => { try { f(); return 'ALLOWED'; } catch (e) { return (e && e.code) || String(e); } };
`;

/* ================================================================== CANARIES */

test('CANARY 1: an empty agent scores 0, through the real tests', async () => {
  const task = codeTask('slugify');
  const empty = await runCodeTask({ agentFiles: answering([]), task, runSeed: SEED, serve: noModel, remaining: budget });
  assert.equal(empty.cases.length, 12);
  assert.equal(empty.cases.filter(Boolean).length, 0);
  assert.equal(empty.status, 'load-error');
  assert.equal(empty.clean, true);

  const noSolve = await runCodeTask({ agentFiles: agent('export const x = 1;\n'), task, runSeed: SEED, serve: noModel, remaining: budget });
  assert.equal(noSolve.status, 'load-error');
  assert.equal(noSolve.cases.filter(Boolean).length, 0);

  // The same chain, given the right answer, scores everything: the zero above is the tests' doing.
  const right = await runCodeTask({
    agentFiles: answering(solution(reference('slugify'))),
    task, runSeed: SEED, serve: noModel, remaining: budget,
  });
  assert.equal(right.status, 'ok');
  assert.equal(right.cases.every(Boolean), true);
});

test('CANARY 2: an agent that reads outside its jail is denied, and sees no secrets', async () => {
  process.env.HELLGATE_TEST_SECRET = 'top-secret-value';
  const outside = join(SUITES, 'code', 'public', 'slugify', 'cases.mjs');
  const run = await runAgent({
    files: agent(`${PROBE}
      export async function solve(task, kit) {
        kit.trace('passwd', { r: probe(() => readFileSync('/etc/passwd')) });
        kit.trace('hidden-cases', { r: probe(() => readFileSync(${JSON.stringify(outside)})) });
        kit.trace('list-root', { r: probe(() => readdirSync('/')) });
        kit.trace('climb', { r: probe(() => readFileSync('../../../../../etc/passwd')) });
        kit.trace('write-jail', { r: probe(() => writeFileSync('x.txt', 'x')) });
        kit.trace('write-tmp', { r: probe(() => writeFileSync('/tmp/hellgate-canary.txt', 'x')) });
        kit.trace('read-own', { r: probe(() => readFileSync('agent/index.ts')) });
        kit.trace('where', { dir: process.cwd() });
        kit.trace('env', { keys: Object.keys(process.env).filter((k) => /SECRET|KEY|TOKEN/.test(k)), leaked: Object.values(process.env).some((v) => String(v).includes('top-secret')) });
        return { files: [] };
      }`),
    brief: codeBrief(codeTask('slugify')), seed: 1, serve: noModel, remaining: budget,
  });
  assert.equal(run.status, 'ok', run.detail);
  const seen = Object.fromEntries(run.trace.map((e) => [e.event, e.data as Record<string, unknown>]));
  for (const probeName of ['passwd', 'hidden-cases', 'list-root', 'climb', 'write-jail', 'write-tmp']) {
    assert.equal(seen[probeName]!.r, 'ERR_ACCESS_DENIED', probeName);
  }
  assert.equal(seen['read-own']!.r, 'ALLOWED', 'reading its own folder works');
  assert.deepEqual(seen.env, { keys: [], leaked: false });
  assert.equal(existsSync((seen.where as { dir: string }).dir), false, 'the jail directory is removed afterwards');
});

test('CANARY 3: a solution that opens a test file gets ENOENT or is denied, and finds no tests anywhere', async () => {
  const marker = 'MARKER-5f2c9d-hidden-test-text';
  const hidden = join(SUITES, 'code', 'public', 'slugify', 'cases.mjs');
  const source = `
    import { readFileSync, readdirSync } from 'node:fs';
    import { fileURLToPath } from 'node:url';
    const here = fileURLToPath(new URL('.', import.meta.url));
    const probe = (f) => { try { f(); return 'ALLOWED'; } catch (e) { return (e && e.code) || String(e); } };
    export const sibling = probe(() => readFileSync(here + 'cases.mjs'));
    export const relative = probe(() => readFileSync('cases.mjs'));
    export const outside = probe(() => readFileSync(${JSON.stringify(hidden)}));
    export const proc = probe(() => readFileSync('/proc/self/cmdline'));
    export const stdinFd = probe(() => readFileSync('/proc/self/fd/0'));
    export const listing = readdirSync(here).sort().join(',');
    export const inArgv = [...process.argv, ...process.execArgv].join(' ').includes(${JSON.stringify(marker)});
  `;
  const run = await runCaseTests({
    entry: 'solution.mjs',
    files: solution(source),
    casesSource: `// ${marker}\n` + cases(
      `a.equal(m.sibling, 'ENOENT')`,
      `a.equal(m.relative, 'ENOENT')`,
      `a.equal(m.outside, 'ERR_ACCESS_DENIED')`,
      `a.equal(m.proc, 'ERR_ACCESS_DENIED')`,
      `a.equal(m.stdinFd, 'ERR_ACCESS_DENIED')`,
      `a.equal(m.listing, 'package.json,solution.mjs')`,
      `a.equal(m.inArgv, false)`,
    ),
    timeoutMs: 2000,
  });
  assert.deepEqual(run.errors.filter(Boolean), []);
  assert.deepEqual(run.passed, [true, true, true, true, true, true, true]);
  assert.equal(run.status, 'ok');
});

test('CANARY 4: network access is denied to both the agent and the solution', async () => {
  let connections = 0;
  const server = net.createServer((socket) => {
    connections++;
    socket.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  const attempt = `
    import net from 'node:net';
    export const tryConnect = () => new Promise((resolve) => {
      const s = net.connect(${port}, '127.0.0.1');
      s.on('connect', () => resolve('CONNECTED'));
      s.on('error', (e) => resolve(e.code || String(e)));
    });
    export const tryFetch = async () => { try { await fetch('http://127.0.0.1:${port}/'); return 'FETCHED'; } catch (e) { return (e.cause && e.cause.code) || e.name; } };
  `;
  try {
    const agentRun = await runAgent({
      files: agent(`${attempt}
        export async function solve(task, kit) {
          kit.trace('net', { r: await tryConnect() });
          kit.trace('fetch', { r: await tryFetch() });
          return { files: [] };
        }`),
      brief: codeBrief(codeTask('slugify')), seed: 1, serve: noModel, remaining: budget,
    });
    const seen = Object.fromEntries(agentRun.trace.map((e) => [e.event, (e.data as { r: string }).r]));
    assert.equal(seen.net, 'ERR_ACCESS_DENIED');
    assert.notEqual(seen.fetch, 'FETCHED');

    const solutionRun = await runCaseTests({
      entry: 'solution.mjs',
      files: solution(`${attempt}\nexport const net1 = await tryConnect();\nexport const fetch1 = await tryFetch();\n`),
      casesSource: cases(`a.equal(m.net1, 'ERR_ACCESS_DENIED')`, `a.notEqual(m.fetch1, 'FETCHED')`),
      timeoutMs: 3000,
    });
    assert.deepEqual(solutionRun.passed, [true, true], solutionRun.errors.join('|'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(connections, 0, 'the local server never saw a connection');
  } finally {
    server.close();
  }
});

test('CANARY 5: a solution that forges a result is marked tampered', async () => {
  const fiveCases = cases('a.equal(m.one(), 1)', 'a.equal(m.one(), 2)', 'a.equal(m.one(), 3)');
  const forge = (body: string) => runCaseTests({ entry: 'solution.mjs', files: solution(body), casesSource: fiveCases, timeoutMs: 2000 });

  // Claims every case passed, with a guessed nonce, and exits cleanly.
  const forged = await forge(`
    import { writeSync } from 'node:fs';
    for (let i = 0; i < 3; i++) writeSync(3, JSON.stringify({ n: 'guess', t: 'case', i, ok: true }) + '\\n');
    writeSync(3, JSON.stringify({ n: 'guess', t: 'end' }) + '\\n');
    process.exit(0);
    export const one = () => 1;
  `);
  assert.equal(forged.status, 'tampered');
  assert.deepEqual(forged.passed, [false, false, false], 'even the case it would honestly pass scores 0');

  // Quits with success before the tests finish.
  const quit = await forge('export const one = () => 1;\nprocess.exit(0);\n');
  assert.equal(quit.status, 'tampered');
  assert.deepEqual(quit.passed, [false, false, false]);

  // Writes junk to the report channel and carries on.
  const junk = await forge(`
    import { writeSync } from 'node:fs';
    writeSync(3, 'not a record\\n');
    export const one = () => 1;
  `);
  assert.equal(junk.status, 'tampered');

  // Registers an exit handler that changes the exit code after the report was closed.
  const lateExit = await forge(`
    process.on('exit', () => { process.exitCode = 3; });
    export const one = () => 1;
  `);
  assert.equal(lateExit.status, 'tampered');

  // An honest solution next to all that is not tampered with, and scores what it earns.
  const honest = await forge('export const one = () => 1;\n');
  assert.equal(honest.status, 'ok');
  assert.deepEqual(honest.passed, [true, false, false]);
});

/* ================================================================== the test runner */

test('a hung case fails, and the cases after it still run in a fresh process', async () => {
  const run = await runCaseTests({
    entry: 'solution.mjs',
    files: solution('export const ok = () => 1;\nexport const hang = () => { for (;;) {} };\n'),
    casesSource: cases('a.equal(m.ok(), 1)', 'a.equal(m.hang(), 1)', 'a.equal(m.ok(), 1)', 'a.equal(m.ok(), 2)'),
    timeoutMs: 400,
  });
  assert.deepEqual(run.passed, [true, false, true, false]);
  assert.equal(run.hangs, 1);
  assert.equal(run.status, 'ok');
  assert.match(run.errors[1] ?? '', /did not finish in time/);
});

test('a case that never settles times out inside the process, with no restart', async () => {
  const run = await runCaseTests({
    entry: 'solution.mjs',
    files: solution('export const ok = () => 1;\nexport const never = () => new Promise(() => {});\n'),
    casesSource: cases('return m.never()', 'a.equal(m.ok(), 1)'),
    timeoutMs: 300,
  });
  assert.deepEqual(run.passed, [false, true]);
  assert.equal(run.hangs, 0);
  assert.match(run.errors[0] ?? '', /timed out/);
});

test('a crash in one case fails it and the rest run on; a solution that hangs while loading fails them all', async () => {
  const crash = await runCaseTests({
    entry: 'solution.mjs',
    files: solution('export const ok = () => 1;\nexport const boom = () => { setTimeout(() => { throw new Error("late"); }, 0); return new Promise(() => {}); };\n'),
    casesSource: cases('return m.boom()', 'a.equal(m.ok(), 1)'),
    timeoutMs: 2000,
  });
  assert.deepEqual(crash.passed, [false, true]);
  assert.equal(crash.hangs, 1);

  const loadHang = await runCaseTests({ entry: 'solution.mjs', files: solution('for (;;) {}\n'), casesSource: cases('a.ok(true)', 'a.ok(true)'), timeoutMs: 300 });
  assert.equal(loadHang.status, 'load-error');
  assert.deepEqual(loadHang.passed, [false, false]);
});

test('after too many hangs the rest fail and the run gives up', async () => {
  const run = await runCaseTests({
    entry: 'solution.mjs',
    files: solution('export const hang = () => { for (;;) {} };\nexport const ok = () => 1;\n'),
    casesSource: cases('m.hang()', 'm.hang()', 'm.hang()', 'm.hang()', 'm.hang()', 'a.equal(m.ok(), 1)'),
    timeoutMs: 200,
  });
  assert.equal(run.status, 'gave-up');
  assert.equal(run.passed.some(Boolean), false);
  assert.equal(run.passed.length, 6);
});

test('a solution cannot weaken assert or the error constructors the cases rely on', async () => {
  const run = await runCaseTests({
    entry: 'solution.mjs',
    files: solution(`
      import assert from 'node:assert/strict';
      assert.equal = () => {};
      assert.deepEqual = () => {};
      export const swapped = (() => { try { globalThis.RangeError = Error; return 'SWAPPED'; } catch { return 'blocked'; } })();
      export const wrong = () => 1;
      export const throwsPlain = () => { throw new Error('plain'); };
    `),
    casesSource: cases(
      'a.equal(m.wrong(), 2)',
      'a.deepEqual([m.wrong()], [2])',
      'a.throws(() => m.throwsPlain(), RangeError)',
      "a.equal(m.swapped, 'blocked')",
    ),
    timeoutMs: 2000,
  });
  assert.deepEqual(run.passed, [false, false, false, true]);
});

test('a flood on the report channel is cut off and counted as tampering', async () => {
  const run = await runCaseTests({
    entry: 'solution.mjs',
    files: solution(`
      import { writeSync } from 'node:fs';
      const line = 'x'.repeat(65535) + '\\n';
      for (let i = 0; i < 400; i++) { try { writeSync(3, line); } catch {} }
      export const one = () => 1;
    `),
    casesSource: cases('a.equal(m.one(), 1)'),
    timeoutMs: 2000,
  });
  assert.equal(run.status, 'tampered');
  assert.deepEqual(run.passed, [false]);
});

test('child processes, worker threads and native addons are denied to a solution', async () => {
  const run = await runCaseTests({
    entry: 'solution.mjs',
    files: solution(`
      import { execSync } from 'node:child_process';
      import { Worker } from 'node:worker_threads';
      const probe = (f) => { try { f(); return 'ALLOWED'; } catch (e) { return (e && e.code) || String(e); } };
      export const spawned = probe(() => execSync('echo hi'));
      export const worker = probe(() => new Worker('1', { eval: true }));
      export const addon = probe(() => process.dlopen({ exports: {} }, '/lib/x86_64-linux-gnu/libc.so.6'));
    `),
    casesSource: cases(`a.equal(m.spawned, 'ERR_ACCESS_DENIED')`, `a.equal(m.worker, 'ERR_ACCESS_DENIED')`, `a.notEqual(m.addon, 'ALLOWED')`),
    timeoutMs: 2000,
  });
  assert.deepEqual(run.passed, [true, true, true], run.errors.join('|'));
});

test('the cases run against every pilot reference solution inside the sandbox', async () => {
  for (const task of code.tasks) {
    const run = await runCaseTests({
      entry: task.meta.entry,
      files: [{ path: task.meta.entry, contents: reference(task.id) }],
      casesSource: task.files['cases.mjs']!,
      timeoutMs: task.meta.timeoutMs,
    });
    assert.equal(run.status, 'ok', `${task.id}: ${run.detail}`);
    assert.equal(run.passed.every(Boolean), true, `${task.id}: ${run.errors.filter(Boolean).join(' | ')}`);
    assert.ok(run.passed.length >= 8, task.id);
  }
});

/* ================================================================== the agent jail */

test('the agent talks to the model only through the parent, which sees and budgets every request', async () => {
  const seen: ModelRequest[] = [];
  let left = 3;
  const run = await runAgent({
    files: agent(`
      export async function solve(task, kit) {
        kit.trace('sendType', { send: typeof process.send });
        kit.trace('before', kit.budget.remaining());
        const reply = await kit.model.generate({ tag: 'draft', messages: [{ role: 'user', text: task.title }] });
        kit.trace('after', kit.budget.remaining());
        return { files: [{ path: 'solution.mjs', contents: 'export const said = ' + JSON.stringify(reply.text) + ';\\n' }] };
      }`),
    brief: codeBrief(codeTask('slugify')),
    seed: 1,
    serve: async (request) => {
      seen.push(request);
      left--;
      return { text: 'hello from the parent', finish: 'stop', inputTokens: 5, outputTokens: 4 };
    },
    remaining: () => ({ calls: left, tokens: 100, ms: 1000 }),
  });
  assert.equal(run.status, 'ok', run.detail);
  assert.equal(run.modelCalls, 1);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.tag, 'draft');
  assert.match(seen[0]!.messages[0]!.text, /slug/i);
  assert.equal(run.answer![0]!.contents, 'export const said = "hello from the parent";\n');
  const trace = Object.fromEntries(run.trace.map((e) => [e.event, e.data]));
  assert.deepEqual(trace.sendType, { send: 'undefined' }, 'the IPC send function was removed before the agent loaded');
  assert.deepEqual(trace.before, { calls: 3, tokens: 100, ms: 1000 });
  assert.deepEqual(trace.after, { calls: 2, tokens: 100, ms: 1000 });
});

test('a malformed request, a refused call and a request flood are rejected inside the agent, not served', async () => {
  let served = 0;
  const run = await runAgent({
    files: agent(`
      const attempt = async (kit, request) => { try { await kit.model.generate(request); return 'ok'; } catch (e) { return e.message; } };
      export async function solve(task, kit) {
        kit.trace('bad', { r: await attempt(kit, { tag: 'x', messages: [] }) });
        kit.trace('extra', { r: await attempt(kit, { tag: 'x', messages: [{ role: 'user', text: 'a' }], model: 'gpt-9' }) });
        kit.trace('refused', { r: await attempt(kit, { tag: 'x', messages: [{ role: 'user', text: 'a' }] }) });
        kit.trace('fine', { r: await attempt(kit, { tag: 'y', messages: [{ role: 'user', text: 'b' }] }) });
        kit.trace('over', { r: await attempt(kit, { tag: 'z', messages: [{ role: 'user', text: 'c' }] }) });
        return { files: [] };
      }`),
    brief: codeBrief(codeTask('slugify')),
    seed: 1,
    maxRequests: 2,
    serve: async (request) => {
      served++;
      if (request.tag === 'x') throw new ModelCallRefused('the budget is spent');
      return { text: 'ok', finish: 'stop', inputTokens: 1, outputTokens: 1 };
    },
    remaining: budget,
  });
  const trace = Object.fromEntries(run.trace.map((e) => [e.event, (e.data as { r: string }).r]));
  assert.match(trace.bad!, /invalid model request/);
  assert.match(trace.extra!, /invalid model request/);
  assert.equal(trace.refused, 'the budget is spent');
  assert.equal(trace.fine, 'ok');
  assert.match(trace.over!, /at most 2 model requests/);
  assert.equal(served, 2, 'invalid requests never reach the model');
});

test('an infrastructure failure while serving a request ends the run and is thrown, never scored', async () => {
  await assert.rejects(
    runAgent({
      files: agent(`export async function solve(task, kit) { await kit.model.generate({ tag: 'a', messages: [{ role: 'user', text: 'x' }] }); return { files: [] }; }`),
      brief: codeBrief(codeTask('slugify')), seed: 1,
      serve: async () => { throw new Error('provider unreachable'); },
      remaining: budget,
    }),
    /provider unreachable/,
  );
});

test('agent time is the agent\'s own: waiting for a slow model is free, spinning is not', async () => {
  const slow = await runAgent({
    files: agent(`export async function solve(task, kit) { await kit.model.generate({ tag: 'a', messages: [{ role: 'user', text: 'x' }] }); return { files: [] }; }`),
    brief: codeBrief(codeTask('slugify')), seed: 1, computeMs: 400,
    serve: async () => { await new Promise((r) => setTimeout(r, 1200)); return { text: 't', finish: 'stop', inputTokens: 1, outputTokens: 1 }; },
    remaining: budget,
  });
  assert.equal(slow.status, 'ok');

  const spin = await runAgent({
    files: agent('export async function solve() { for (;;) {} }\n'),
    brief: codeBrief(codeTask('slugify')), seed: 1, computeMs: 400, serve: noModel, remaining: budget,
  });
  assert.equal(spin.status, 'timeout');
  assert.equal(spin.answer, null);
});

test('an agent that throws, will not parse, or returns a bad answer is a scored failure, not an error', async () => {
  const brief = codeBrief(codeTask('slugify'));
  const run = (source: string) => runAgent({ files: agent(source), brief, seed: 1, serve: noModel, remaining: budget });
  assert.equal((await run('export async function solve() { throw new Error("nope"); }')).status, 'run-error');
  assert.equal((await run('export async function solve( {')).status, 'load-error');
  assert.equal((await run('export async function solve() { return 5; }')).status, 'bad-output');
  const unsafe = await run(`export async function solve() { return { files: [{ path: '../evil.mjs', contents: 'x' }] }; }`);
  assert.equal(unsafe.status, 'bad-output');
  assert.match(unsafe.detail, /unsafe segment/);
  const crash = await run(`export async function solve() { setTimeout(() => { throw new Error('async'); }, 0); await new Promise(() => {}); }`);
  assert.equal(crash.status, 'crashed');
});

test('an agent that forges its report is tampered, and its text is passed on only as data', async () => {
  const forged = await runAgent({
    files: agent(`
      import { writeSync } from 'node:fs';
      export async function solve() { writeSync(3, JSON.stringify({ n: 'guess', t: 'answer', files: [] }) + '\\n'); return { files: [] }; }`),
    brief: codeBrief(codeTask('slugify')), seed: 1, serve: noModel, remaining: budget,
  });
  assert.equal(forged.status, 'tampered');
  assert.equal(forged.clean, false);

  // Awkward text in a brief survives the trip into the jail intact.
  const brief = { ...codeBrief(codeTask('slugify')), brief: 'sep arator "quotes" ${x} `tick` </script> __proto__' };
  const echoed = await runAgent({
    files: agent(`export async function solve(task) { return { files: [{ path: 'echo.txt', contents: task.brief }] }; }`),
    brief, seed: 1, serve: noModel, remaining: budget,
  });
  assert.equal(echoed.answer![0]!.contents, brief.brief);
});

test('answer files are checked before anything is written', () => {
  const ok = (files: unknown) => checkAnswerFiles(files).ok;
  assert.equal(ok([{ path: 'solution.mjs', contents: 'x' }, { path: 'lib/util.mjs', contents: 'y' }]), true);
  for (const bad of [
    [{ path: '../x.mjs', contents: 'x' }],
    [{ path: '/etc/x.mjs', contents: 'x' }],
    [{ path: 'a//b.mjs', contents: 'x' }],
    [{ path: 'a\\b.mjs', contents: 'x' }],
    [{ path: '.hidden.mjs', contents: 'x' }],
    [{ path: 'x.sh', contents: 'x' }],
    [{ path: 'package.json', contents: '{}' }],
    [{ path: 'a.mjs', contents: 'x' }, { path: 'A.mjs', contents: 'y' }],
    [{ path: 'a.mjs', contents: 1 }],
    [{ path: 'big.mjs', contents: 'x'.repeat(200_000) }],
    Array.from({ length: 13 }, (_, i) => ({ path: `f${i}.mjs`, contents: 'x' })),
    'files', null,
  ]) assert.equal(ok(bad), false, JSON.stringify(bad)?.slice(0, 60));
});

/* ================================================================== determinism */

test('Math.random and kit.random are one seeded stream equal to the engine\'s, and the clock is frozen', async () => {
  const seed = learnSeed(SEED, 'slugify');
  const probe = (source: string) => agent(`export async function solve(task, kit) { ${source} return { files: [] }; }`);
  const run = await runAgent({
    files: probe(`
      kit.trace('first', { a: kit.random(), b: Math.random(), c: kit.random() });
      kit.trace('clock', { now: Date.now(), made: new Date().getTime(), explicit: new Date(86400000).getTime(), isDate: new Date() instanceof Date });
    `),
    brief: codeBrief(codeTask('slugify')), seed, serve: noModel, remaining: budget,
  });
  const expected = mulberry32(seed);
  const [a, b, c] = [expected(), expected(), expected()];
  assert.deepEqual(run.trace[0]!.data, { a, b, c });
  assert.deepEqual(run.trace[1]!.data, { now: 1767225600000, made: 1767225600000, explicit: 86400000, isDate: true });
});

/* ================================================================== the ml runner */

const NEAREST = `
  export async function fit(task, kit) {
    const k = 5;
    const predict = (q) => {
      const near = task.train.x
        .map((p, i) => [p.reduce((s, v, j) => s + (v - q[j]) ** 2, 0), i])
        .sort((a, b) => a[0] - b[0]).slice(0, k).map(([, i]) => task.train.y[i]);
      if (task.kind === 'regression') return near.reduce((s, v) => s + v, 0) / near.length;
      const votes = new Map();
      for (const v of near) votes.set(v, (votes.get(v) ?? 0) + 1);
      return [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    };
    return { y: task.testX.map(predict) };
  }
`;

const view = (over: Partial<MlTaskView> = {}): MlTaskView => ({
  id: 't', title: 'tiny', kind: 'regression', features: 1, tolerance: 0.5,
  train: { x: [[0], [1]], y: [0, 1] }, testX: [[0], [1], [2]], budgetMs: 1500, ...over,
});

test('the ml runner scores a real learner on a real task, against labels it never saw', async () => {
  const moons = mlTask('moons');
  const good = await runMlTask(learner(NEAREST), moons, seedHex(ml.id, 0));
  assert.equal(good.status, 'ok', good.detail);
  assert.equal(good.cases.length, moons.meta.testSize);
  assert.ok(good.cases.filter(Boolean).length / good.cases.length > 0.8);

  const constant = await runMlTask(learner('export async function fit(task) { return { y: task.testX.map(() => 0) }; }'), moons, seedHex(ml.id, 0));
  const accuracy = constant.cases.filter(Boolean).length / constant.cases.length;
  assert.ok(accuracy > 0.3 && accuracy < 0.7, `a constant guess is near chance, got ${accuracy}`);
});

test('CANARY (ml): a learner cannot reach the hidden data, the labels, or the network, and its first reading is its own folder', async () => {
  const run = await runLearner({
    files: learner(`${PROBE}
      export async function fit(task, kit) {
        kit.trace('data-file', { r: probe(() => readFileSync(${JSON.stringify(join(SUITES, 'ml', 'public', 'moons', 'data.mjs'))})) });
        kit.trace('keys', { task: Object.keys(task).sort(), hasLabels: 'testY' in task || 'testLabels' in task });
        return { y: task.testX.map(() => 0) };
      }`),
    view: view(), seed: 1,
  });
  assert.equal(run.status, 'ok', run.detail);
  const seen = Object.fromEntries(run.trace.map((e) => [e.event, e.data as Record<string, unknown>]));
  assert.equal(seen['data-file']!.r, 'ERR_ACCESS_DENIED');
  assert.equal(seen.keys!.hasLabels, false);
});

test('a learner that returns the wrong thing scores 0 for the task, whatever it returns', async () => {
  const run = (body: string, v = view()) => runLearner({ files: learner(`export async function fit(task, kit) { ${body} }`), view: v, seed: 1 });
  assert.equal((await run('return { y: [1, 2] };')).status, 'bad-output');
  assert.equal((await run('return { y: [0, NaN, 1] };')).status, 'bad-output');
  assert.equal((await run('return { y: [0, Infinity, 1] };')).status, 'bad-output');
  assert.equal((await run("return { y: [0, '1', 1] };")).status, 'bad-output');
  assert.equal((await run('return { y: 5 };')).status, 'bad-output');
  assert.equal((await run('return {};')).status, 'run-error');
  assert.equal((await run('throw new Error("bang");')).status, 'run-error');
  const accepted = await run('return { y: new Float64Array([0, 1, 2]) };');
  assert.equal(accepted.status, 'ok', 'a typed array of the right length is accepted');
  assert.deepEqual(accepted.y, [0, 1, 2]);
});

test('a learner over its time budget scores 0, and one that never returns is stopped', async () => {
  const slow = await runLearner({
    files: learner('export async function fit(task) { const t = performance.now(); while (performance.now() - t < 500); return { y: task.testX.map(() => 0) }; }'),
    view: view({ budgetMs: 200 }), seed: 1,
  });
  assert.equal(slow.status, 'over-budget');
  assert.equal(slow.y, null);

  const stuck = await runLearner({ files: learner('export async function fit() { for (;;) {} }'), view: view({ budgetMs: 200 }), seed: 1 });
  assert.equal(stuck.status, 'timeout');
});

test('a learner that forges its report is tampered, and one that will not load is a load error', async () => {
  const forged = await runLearner({
    files: learner(`
      import { writeSync } from 'node:fs';
      export async function fit(task) { writeSync(3, JSON.stringify({ n: 'guess', t: 'result', y: [0, 1, 2] }) + '\\n'); return { y: [0, 1, 2] }; }`),
    view: view(), seed: 1,
  });
  assert.equal(forged.status, 'tampered');
  assert.equal(forged.clean, false);
  assert.equal(forged.y, null);

  const broken = await runLearner({ files: learner('export const nothing = 1;\n'), view: view(), seed: 1 });
  assert.equal(broken.status, 'load-error');
  const syntax = await runLearner({ files: learner('export async function fit( {'), view: view(), seed: 1 });
  assert.equal(syntax.status, 'load-error');
});

test('the same seed gives the same predictions, and a different seed gives different ones', async () => {
  const files = learner('export async function fit(task, kit) { return { y: task.testX.map(() => Math.round(kit.random() * 1000)) }; }');
  const run = (seed: number) => runLearner({ files, view: view(), seed });
  const [a, b, other] = [await run(7), await run(7), await run(8)];
  assert.deepEqual(a.y, b.y);
  assert.notDeepEqual(a.y, other.y);
});

test('learner files can import their siblings, and TypeScript types are stripped', async () => {
  const run = await runLearner({
    files: [
      { path: 'learner/index.ts', contents: "import { double } from './math.ts';\nexport async function fit(task: { testX: number[][] }): Promise<{ y: number[] }> { return { y: task.testX.map((r) => double(r[0]!)) }; }\n" },
      { path: 'learner/math.ts', contents: 'export const double = (x: number): number => x * 2;\n' },
    ],
    view: view(), seed: 1,
  });
  assert.equal(run.status, 'ok', run.detail);
  assert.deepEqual(run.y, [0, 2, 4]);
});

test('every pilot ml task runs end to end in the sandbox', async () => {
  for (const task of ml.tasks) {
    const outcome = await runMlTask(learner(NEAREST), task, seedHex(ml.id, 1));
    assert.equal(outcome.status, 'ok', `${task.id}: ${outcome.detail}`);
    assert.equal(outcome.cases.length, task.meta.testSize);
  }
});

/* ================================================================== plumbing */

test('the jail flags grant read access to one directory and nothing else', () => {
  const flags = jailFlags('/some/jail');
  assert.ok(flags.includes('--permission'));
  assert.deepEqual(flags.filter((f) => f.startsWith('--allow')), ['--allow-fs-read=/some/jail']);
});

test('lanes bound concurrency, keep order and stop at the first failure', async () => {
  let active = 0;
  let peak = 0;
  const out = await mapLanes([30, 10, 20, 5, 15], 2, async (ms, i) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, ms));
    active--;
    return i * 10;
  });
  assert.deepEqual(out, [0, 10, 20, 30, 40]);
  assert.equal(peak, 2);

  const started: number[] = [];
  await assert.rejects(
    mapLanes([1, 2, 3, 4, 5, 6], 2, async (n) => {
      started.push(n);
      if (n === 2) throw new Error('infra');
      await new Promise((r) => setTimeout(r, 20));
    }),
    /infra/,
  );
  assert.ok(started.length < 6, 'no new work starts once a job has failed');

  assert.equal(lanesFromEnv({}), 2);
  assert.equal(lanesFromEnv({ HELLGATE_LANES: '4' }), 4);
  for (const bad of ['0', '17', 'two', '1.5', '-1']) assert.throws(() => lanesFromEnv({ HELLGATE_LANES: bad }), /HELLGATE_LANES/);
});
