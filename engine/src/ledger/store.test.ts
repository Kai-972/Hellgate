import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../core/canonical.ts';
import { generateIdentity } from '../identity/keys.ts';
import { EMPTY_BUILD_ID, type StoredRecord } from './records.ts';
import { Ledger, referenceProblems } from './store.ts';
import { hex, sampleBuild, sampleReceipt, sampleRecording, signedAttestation, signedChange } from './testkit.ts';

const fresh = (): Ledger => new Ledger(mkdtempSync(join(tmpdir(), 'hg-ledger-')));
const author = generateIdentity();

test('put and get round-trip, with a canonical file in the sharded layout', () => {
  const l = fresh();
  const r = signedChange(author);
  assert.deepEqual(l.put(r), { id: r.id, created: true });
  assert.deepEqual(l.get(r.id), r);
  const bytes = readFileSync(l.pathOf(r.id), 'utf8');
  assert.equal(l.pathOf(r.id).endsWith(`${r.id.slice(0, 2)}/${r.id.slice(2)}.json`), true);
  assert.equal(bytes, `${canonicalJson({ body: r.body, sig: 'sig' in r ? r.sig : undefined })}\n`);
});

test('put is idempotent and never overwrites', () => {
  const l = fresh();
  const r = sampleBuild();
  assert.equal(l.put(r).created, true);
  assert.equal(l.put(r).created, false);
  assert.deepEqual(l.ids(), [r.id]);
});

test('ids are sorted, and the empty build is present without being stored', () => {
  const l = fresh();
  const ids = [sampleBuild('a'), sampleBuild('b'), sampleBuild('c')].map((r) => (l.put(r), r.id)).sort();
  assert.deepEqual(l.ids(), ids);
  assert.equal(l.has(EMPTY_BUILD_ID), true);
  assert.equal(l.get(EMPTY_BUILD_ID).type, 'build');
  assert.equal(l.ids().includes(EMPTY_BUILD_ID), false);
});

test('get reports missing, malformed and wrongly typed ids', () => {
  const l = fresh();
  assert.throws(() => l.get(hex('missing')), /no record/);
  assert.throws(() => l.get('xyz'), /not a record id/);
  const b = sampleBuild();
  l.put(b);
  assert.throws(() => l.getTyped(b.id, 'change'), /not a change/);
  assert.equal(l.getTyped(b.id, 'build').id, b.id);
});

test('scan returns good records and reports every kind of bad file without trusting it', () => {
  const l = fresh();
  const good = signedChange(author);
  l.put(good);

  const put = (name: string, text: string): string => {
    const dir = join(l.recordsDir, name.slice(0, 2));
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${name.slice(2)}.json`);
    writeFileSync(file, text);
    return `${name.slice(0, 2)}/${name.slice(2)}.json`;
  };

  const junk = put(hex('junk'), 'not json at all');
  const wrongName = put(hex('wrong-name'), readFileSync(l.pathOf(good.id), 'utf8'));
  const tampered = JSON.parse(readFileSync(l.pathOf(good.id), 'utf8')) as { body: { createdAt: string }; sig: string };
  tampered.body.createdAt = '2026-03-03T00:00:00Z';
  const tamperedFile = put(hex('tampered'), JSON.stringify(tampered));
  const unknown = put(hex('unknown'), JSON.stringify({ body: { type: 'mystery' } }));
  mkdirSync(join(l.recordsDir, 'ab'), { recursive: true });
  writeFileSync(join(l.recordsDir, 'ab', 'README.txt'), 'hi');

  const { records, problems } = l.scan();
  assert.deepEqual([...records.keys()], [good.id]);
  const by = new Map(problems.map((p) => [p.file, p.stage]));
  assert.equal(by.get(junk), 'json');
  assert.equal(by.get(wrongName), 'id');
  assert.equal(by.get(unknown), 'shape');
  assert.ok(['signature', 'id'].includes(by.get(tamperedFile)!), 'a tampered body is caught');
  assert.equal(by.get('ab/README.txt'), 'shape');
});

test('merge is a union, idempotent and independent of direction', () => {
  const a = fresh();
  const b = fresh();
  const c = signedChange(author);
  [sampleBuild('a'), c].forEach((r) => a.put(r));
  [sampleBuild('b'), sampleBuild('a'), signedAttestation(generateIdentity(), c)].forEach((r) => b.put(r));

  const ab = fresh();
  ab.merge(a);
  const first = ab.merge(b);
  assert.equal(first.rejected.length, 0);
  const ba = fresh();
  ba.merge(b);
  ba.merge(a);
  assert.deepEqual(ab.ids(), ba.ids());
  assert.equal(ab.ids().length, 4);

  const again = ab.merge(b);
  assert.equal(again.added, 0);
  assert.equal(again.alreadyPresent, 3);
});

test('merge rejects a bad file from the source and still copies the good ones', () => {
  const a = fresh();
  const dest = fresh();
  const good = sampleBuild('good');
  a.put(good);
  const dir = join(a.recordsDir, 'ff');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${'e'.repeat(62)}.json`), '{"body":{"type":"build"}}');
  const r = dest.merge(a);
  assert.equal(r.added, 1);
  assert.equal(r.rejected.length, 1);
  assert.deepEqual(dest.ids(), [good.id]);
  assert.equal(readdirSync(join(dest.recordsDir, good.id.slice(0, 2))).filter((f) => f.endsWith('.tmp')).length, 0);
});

/* ------------------------------------------------------------------ references */

function world() {
  const l = fresh();
  const build = sampleBuild('x');
  const suite = hex('suite');
  const recording = sampleRecording(build.id, suite);
  const genesis = signedChange(author, { build: build.id, suite, recording: recording.id });
  [build, recording, genesis].forEach((r) => l.put(r));
  const get = (id: string): StoredRecord | null => (l.has(id) ? l.get(id) : null);
  return { l, build, suite, recording, genesis, get };
}

test('a consistent set of records has no reference problems', () => {
  const w = world();
  assert.deepEqual(referenceProblems(w.genesis, w.get), []);
  const child = signedChange(author, { parent: w.genesis.id, parentBuild: w.build.id, build: sampleBuild('y').id, suite: w.suite, recording: null });
  w.l.put(sampleBuild('y'));
  assert.deepEqual(referenceProblems(child, w.get), []);
  const att = signedAttestation(generateIdentity(), w.genesis);
  assert.deepEqual(referenceProblems(att, w.get), []);
  assert.deepEqual(referenceProblems(sampleReceipt(att.id, author.address), (id) => (id === att.id ? att : null)), []);
});

test('missing and mismatched references are named', () => {
  const w = world();
  const orphan = signedChange(author, { build: hex('nobody-has-this'), recording: hex('nor-this') });
  const problems = referenceProblems(orphan, w.get);
  assert.ok(problems.some((p) => p.includes('the build')), problems.join('|'));
  assert.ok(problems.some((p) => p.includes('the recording')));

  const wrongParentBuild = signedChange(author, { parent: w.genesis.id, parentBuild: hex('somewhere-else'), build: w.build.id, suite: w.suite });
  assert.ok(referenceProblems(wrongParentBuild, w.get).some((p) => p.includes('parentBuild is not')));

  const otherSuiteRecording = signedChange(author, { build: w.build.id, suite: hex('different'), recording: w.recording.id });
  assert.ok(referenceProblems(otherSuiteRecording, w.get).some((p) => p.includes('different suite')));

  const att = signedAttestation(generateIdentity(), w.genesis, { suite: hex('not-the-suite') });
  assert.ok(referenceProblems(att, w.get).some((p) => p.includes('different suite')));

  const noChange = signedAttestation(generateIdentity(), orphan);
  assert.ok(referenceProblems(noChange, w.get).some((p) => p.includes('the change')));
});
