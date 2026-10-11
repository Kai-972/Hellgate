/**
 * The offline loop through the real CLI (the Stage 9 gate): three keys, one tree, no network.
 * The tree uses a small repository (two ml tasks and the real genesis learner) so that the whole
 * loop takes seconds; the full twelve-task suite is exercised by the demo scenarios.
 */
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { signBody, loadIdentity } from '../identity/keys.ts';
import { toRecord } from '../ledger/records.ts';
import { Tree } from '../app/tree.ts';
import { run } from './main.ts';

const REAL_REPO = new URL('../../../', import.meta.url).pathname;

/** A repository with two ml tasks and the genesis learner. */
function miniRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'hg-repo-'));
  for (const t of ['moons', 'scaled-regression']) cpSync(join(REAL_REPO, 'suites', 'ml', 'public', t), join(repo, 'suites', 'ml', 'public', t), { recursive: true });
  cpSync(join(REAL_REPO, 'learner'), join(repo, 'learner'), { recursive: true });
  return repo;
}

interface Person {
  env: NodeJS.ProcessEnv;
  address: string;
}

async function cli(person: Person | NodeJS.ProcessEnv, args: string[], cwd = process.cwd()): Promise<{ code: number; out: string; err: string }> {
  const env: NodeJS.ProcessEnv = typeof (person as Person).address === 'string' ? (person as Person).env : (person as NodeJS.ProcessEnv);
  let out = '';
  let err = '';
  const code = await run(args, { out: (t) => (out += t + '\n'), err: (t) => (err += t + '\n'), env, cwd, tty: false });
  return { code, out, err };
}

async function person(repo: string): Promise<Person> {
  const home = mkdtempSync(join(tmpdir(), 'hg-home-'));
  const env = { HELLGATE_HOME: home, HELLGATE_REPO: repo, PATH: process.env.PATH } as NodeJS.ProcessEnv;
  assert.equal((await cli(env, ['id', 'create'])).code, 0);
  return { env, address: loadIdentity(join(home, 'identity.json')).address };
}

const CLAIM = (motif: string, over: Record<string, string> = {}): string[] => Object.entries({
  hypothesis: 'Rescaling every feature to zero mean and unit variance will let one learning rate suit all of them.',
  'falsified-if': 'Both verifiers measure under +3 points.', area: 'preprocessing', motif, predict: '10', ...over,
}).flatMap(([k, v]) => [`--${k}`, v]);

const write = (dir: string, file: string, text: string): void => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), text);
};

test('the offline loop: three keys init, submit, verify and check, and every verdict follows the evidence', { timeout: 300_000 }, async () => {
  const repo = miniRepo();
  const [alice, bob, carol, dave] = [await person(repo), await person(repo), await person(repo), await person(repo)];
  const root = mkdtempSync(join(tmpdir(), 'hg-tree-'));
  const at = (args: string[]) => [...args, '--root', root];

  // init: the genesis change is pending until two other keys verify it.
  const init = await cli(alice, at(['init', '--domain', 'ml', '--name', 'demo', '--runs', '3']));
  assert.equal(init.code, 0, init.err);
  const genesis = init.out.match(/genesis change ([0-9a-f]{64})/)![1]!;
  assert.equal((await cli(bob, at(['check', genesis]))).code, 2, 'one change with no verifiers is pending');
  assert.equal((await cli(alice, at(['verify', genesis]))).code, 4, 'you cannot verify your own change');

  assert.equal((await cli(bob, at(['verify', genesis.slice(0, 8)]))).code, 0);
  assert.equal((await cli(bob, at(['check', genesis]))).code, 2, 'one verifier is not enough');
  assert.equal((await cli(carol, at(['verify', genesis]))).code, 0);
  const accepted = await cli(carol, at(['check', genesis, '--json']));
  assert.equal(accepted.code, 0);
  assert.equal(JSON.parse(accepted.out).code, 'GAIN');

  // propose + submit a real improvement: standardise the features.
  const ws = await cli(alice, at(['propose']));
  assert.equal(ws.code, 0, ws.err);
  const dir = ws.out.match(/workspace (\S+)/)![1]!;
  cpSync(join(REAL_REPO, 'scenarios', 'ml', 'standardise', 'learner', 'prep.ts'), join(dir, 'prep.ts'));
  const sub = await cli(alice, at(['submit', '--from', dir, ...CLAIM('standardise')]));
  assert.equal(sub.code, 0, sub.err);
  const good = sub.out.match(/^([0-9a-f]{64})/m)![1]!;
  assert.match(sub.out, /This is a claim, not evidence/);
  assert.equal((await cli(alice, at(['check', good]))).code, 2);
  for (const v of [bob, carol]) assert.equal((await cli(v, at(['verify', good]))).code, 0);
  const goodStatus = JSON.parse((await cli(dave, at(['check', good, '--json']))).out);
  assert.deepEqual([goodStatus.status, goodStatus.code], ['accepted', 'GAIN']);
  assert.ok(goodStatus.effectBp >= 300);

  // a change with no effect is rejected: the code differs but behaviour does not.
  const ws2 = await cli(alice, at(['propose']));
  const dir2 = ws2.out.match(/workspace (\S+)/)![1]!;
  write(dir2, 'schedule.ts', readFileSync(join(dir2, 'schedule.ts'), 'utf8').replace('does not change', 'stays flat'));
  const trap = (await cli(alice, at(['submit', '--from', dir2, ...CLAIM('reword', { area: 'schedule', hypothesis: 'Rewording the schedule comment will make the learning rate feel more stable.' })]))).out.match(/^([0-9a-f]{64})/m)![1]!;
  for (const v of [bob, carol]) await cli(v, at(['verify', trap]));
  const trapStatus = await cli(dave, at(['check', trap, '--json']));
  assert.equal(trapStatus.code, 1);
  assert.deepEqual([JSON.parse(trapStatus.out).status, JSON.parse(trapStatus.out).code], ['rejected', 'NO_EFFECT']);

  // the read commands agree with the ledger.
  const treeText = (await cli(alice, at(['tree']))).out;
  assert.match(treeText, /standardise/);
  assert.match((await cli(alice, at(['graveyard']))).out, /NO_EFFECT/);
  assert.match((await cli(alice, at(['digest']))).out, /## GATE PATH[\s\S]*## GRAVEYARD[\s\S]*## NEVER TRIED/);
  assert.match((await cli(alice, at(['show', good.slice(0, 8)]))).out, /rescal|Rescal|zero mean/);

  // the export has exactly the fields of the mock the web app is built against, and its numbers agree
  // with the ledger.
  const exp = JSON.parse((await cli(alice, at(['export']))).out) as Record<string, any>;
  const mock = JSON.parse(readFileSync(join(REAL_REPO, 'web', 'mock', 'export.ml.sample.json'), 'utf8')) as Record<string, any>;
  const keys = (o: object): string[] => Object.keys(o).sort();
  assert.deepEqual(keys(exp), keys(mock));
  assert.deepEqual(keys(exp.changes[0]), keys(mock.changes[0]));
  assert.deepEqual(keys(exp.changes.find((c: any) => c.attestations.length > 0).attestations[0]), keys(mock.changes[1].attestations[0]));
  assert.deepEqual(keys(exp.verifiers[0]), keys(mock.verifiers[0]));
  assert.deepEqual(keys(exp.suite), keys(mock.suite));
  assert.deepEqual(keys(exp.policy), keys(mock.policy));
  assert.deepEqual(keys(exp.changes[0].perTask[0]), keys(mock.changes[1].perTask[0]));
  assert.equal(exp.protocol, 'hellgate/export/1');
  assert.deepEqual(exp.totals, { changes: 3, accepted: 2, rejected: 1, pending: 0, contested: 0, void: 0 });
  assert.deepEqual(exp.gatePath, [genesis, good]);
  const goodChange = exp.changes.find((c: any) => c.id === good);
  assert.equal(goodChange.vsBaseBp, goodChange.scoreBp - exp.base.scoreBp);
  assert.ok(goodChange.vsBaseBp > 0, 'the standardised build scores above the base');
  assert.match(goodChange.diff, /^--- learner\/prep\.ts\n\+\+\+ learner\/prep\.ts\n@@/);
  assert.deepEqual(exp.curve.map((p: any) => p.change), exp.gatePath);
  assert.equal(exp.curve[0].vsBaseBp, 0);
  assert.ok(exp.verifiers.every((v: any) => /^G[A-Z2-7]{55}$/.test(v.address)));

  // a lazy verifier signs copied numbers: a different digest contests the change.
  const tree = new Tree(root, repo);
  const bobsAttestation = tree.snapshot().byId.get(good)!.attestations.find((a) => a.body.signer === bob.address)!;
  const dedicated = loadIdentity(join(dave.env.HELLGATE_HOME!, 'identity.json'));
  const forged = signBody(dedicated, { ...bobsAttestation.body, signer: dedicated.address, resultsDigest: 'f'.repeat(64) });
  tree.ledger.put(toRecord(forged.body, forged.sig));
  const lazy = JSON.parse((await cli(alice, at(['check', good, '--json']))).out);
  assert.deepEqual([lazy.status, lazy.code], ['contested', 'RESULTS_MISMATCH']);
});

test('guards stop a bad proposal and store it as a void change with the verbatim reason', { timeout: 300_000 }, async () => {
  const repo = miniRepo();
  const [alice] = [await person(repo)];
  const root = mkdtempSync(join(tmpdir(), 'hg-tree-'));
  const at = (args: string[]) => [...args, '--root', root];
  assert.equal((await cli(alice, at(['init', '--domain', 'ml', '--name', 'demo', '--runs', '3']))).code, 0);

  const attempt = async (edit: (dir: string) => void, claim = CLAIM('probe')) => {
    const dir = (await cli(alice, at(['propose']))).out.match(/workspace (\S+)/)![1]!;
    edit(dir);
    return cli(alice, at(['submit', '--from', dir, ...claim]));
  };
  const original = (dir: string, f: string) => readFileSync(join(dir, f), 'utf8');

  const reads = await attempt((d) => write(d, 'prep.ts', original(d, 'prep.ts') + "import { readFileSync } from 'node:fs';\nexport const stolen = readFileSync('/etc/passwd');\n"));
  assert.match(reads.out, /VOID\s+bad-import/);
  assert.match(reads.out, /node:fs/);

  const broken = await attempt((d) => write(d, 'prep.ts', original(d, 'prep.ts').replace('[...row]', '[...row].length')));
  assert.match(broken.out, /VOID\s+typecheck/);
  assert.match(broken.out, /prep\.ts\(\d+,\d+\): error TS/);

  const frozen = await attempt((d) => write(d, 'contract.ts', original(d, 'contract.ts') + '// edited\n'));
  assert.match(frozen.out, /VOID\s+frozen-file/);

  const wide = await attempt((d) => ['a', 'b', 'c'].forEach((n) => write(d, `${n}.ts`, `export const ${n} = 1;\n`)));
  assert.match(wide.out, /VOID\s+too-large/);

  const same = await attempt(() => undefined);
  assert.match(same.out, /identical to its parent/);

  const vague = await attempt((d) => write(d, 'prep.ts', original(d, 'prep.ts') + '// extra\n'), CLAIM('probe', { 'falsified-if': 'It turns out not to help in the end.' }));
  assert.match(vague.out, /VOID\s+unfalsifiable/);

  const graveyard = (await cli(alice, at(['graveyard']))).out;
  for (const code of ['bad-import', 'typecheck', 'frozen-file', 'too-large', 'unfalsifiable']) assert.match(graveyard, new RegExp(code));
  assert.equal((await cli(alice, at(['verify', reads.out.slice(0, 8)]))).code, 4, 'a void change cannot be verified');
});

test('usage mistakes exit 3 with a message, and help works', async () => {
  const env = { HELLGATE_HOME: mkdtempSync(join(tmpdir(), 'hg-home-')), PATH: process.env.PATH } as NodeJS.ProcessEnv;
  assert.equal((await cli(env, ['help'])).code, 0);
  assert.equal((await cli(env, ['frobnicate'])).code, 3);
  assert.equal((await cli(env, ['status', '--root', mkdtempSync(join(tmpdir(), 'hg-empty-'))])).code, 3);
  assert.equal((await cli(env, ['init', '--runs', '4', '--root', mkdtempSync(join(tmpdir(), 'hg-x-'))])).code, 3);
  assert.equal((await cli(env, ['id', 'show'])).code, 6, 'no key yet is an environment problem');
});
