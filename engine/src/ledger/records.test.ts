import assert from 'node:assert/strict';
import test from 'node:test';

import { idOf } from '../core/canonical.ts';
import { generateIdentity, signBody } from '../identity/keys.ts';
import { EMPTY_BUILD_ID, buildBody, envelopeOf, parseRecord, toRecord } from './records.ts';
import { AT, attestationBody, changeBody, hex, sampleBuild, sampleReceipt, sampleRecording, signedAttestation, signedChange } from './testkit.ts';

const signer = generateIdentity();

test('the empty build id is a frozen vector', () => {
  assert.equal(EMPTY_BUILD_ID, '8cd25a794ad8ff09d6e1cf99a3b375fa308a4b06c3fd76b5b3761feeceb75741');
});

test('every record type round-trips through its own file envelope', () => {
  const change = signedChange(signer);
  const records = [
    sampleBuild(),
    sampleRecording(hex('build'), hex('suite')),
    change,
    signedAttestation(generateIdentity(), change),
    sampleReceipt(change.id, signer.address),
  ];
  for (const record of records) {
    const again = parseRecord(JSON.parse(JSON.stringify(envelopeOf(record))));
    assert.equal(again.ok, true, record.type);
    assert.equal(again.ok && again.record.id, record.id);
  }
});

test('the id depends on the body and not on key order or on the signature', () => {
  const a = signedChange(signer);
  const reordered = Object.fromEntries(Object.entries(a.body).reverse());
  assert.equal(idOf(reordered), a.id);
  assert.equal(a.type === 'change' && a.id, idOf(a.body));
});

/* ------------------------------------------------------------------ builds */

test('a build accepts erasable TypeScript files under one build directory', () => {
  assert.equal(parseRecord({ body: buildBody({ 'learner/optim.ts': 'x\n', 'learner/index.ts': 'y\n' }) }).ok, true);
  assert.equal(parseRecord({ body: buildBody({}) }).ok, true);
});

test('a build refuses bad paths, line endings, missing final newlines and mixed roots', () => {
  const bad: Record<string, string>[] = [
    { 'agent/../x.ts': 'x\n' },
    { 'agent/sub/x.ts': 'x\n' },
    { 'src/x.ts': 'x\n' },
    { 'agent/X.ts': 'x\n' },
    { 'agent/x.ts': 'x\r\n' },
    { 'agent/x.ts': 'no newline' },
    { 'agent/x.ts': '' },
    { 'agent/x.ts': 'x\n', 'learner/y.ts': 'y\n' },
  ];
  for (const files of bad) assert.equal(parseRecord({ body: buildBody(files) }).ok, false, JSON.stringify(Object.keys(files)));
});

/* ------------------------------------------------------------------ changes */

function change(over: object): ReturnType<typeof parseRecord> {
  const body = { ...changeBody(signer.address), ...over };
  try {
    return parseRecord({ body, sig: signBody(signer, body as never).sig });
  } catch (err) {
    // A value canonical JSON cannot encode (a float, say) cannot even be signed. That is a refusal too.
    return { ok: false, stage: 'schema', reason: err instanceof Error ? err.message : 'cannot be signed' };
  }
}

test('a change refuses what the protocol forbids', () => {
  const reasons: [string, object][] = [
    ['unknown key', { extra: 1 }],
    ['float', { claimed: { runs: 5, effectBp: 1.5, resultsDigest: hex('d') } }],
    ['short hypothesis', { claim: { ...changeBody(signer.address).claim, hypothesis: 'too short' } }],
    ['zero predicted effect', { claim: { ...changeBody(signer.address).claim, predictedEffectBp: 0 } }],
    ['even run count', { claimed: { runs: 4, effectBp: 1, resultsDigest: hex('d') } }],
    ['genesis with a non-empty parent build', { parentBuild: hex('other') }],
    ['instruction without a challenge', { origin: { by: 'human', model: null, promptHash: null, instruction: 'hi' } }],
    ['challenge without an instruction', { origin: { by: 'challenge', model: null, promptHash: null, instruction: null } }],
    ['void change that carries a recording', { mechanical: { status: 'typecheck', detail: 'x' }, recording: hex('r'), claimed: null }],
    ['void change that carries a claimed result', { mechanical: { status: 'typecheck', detail: 'x' } }],
    ['a change that ran but has no claimed result', { claimed: null }],
    ['bad address', { signer: 'GNOTANADDRESS' }],
    ['bad time', { createdAt: 'yesterday' }],
  ];
  for (const [label, over] of reasons) assert.equal(change(over).ok, false, label);
});

test('a void change and a challenge change are valid when complete', () => {
  assert.equal(change({ mechanical: { status: 'bad-import', detail: 'node:fs' }, claimed: null }).ok, true);
  assert.equal(change({ origin: { by: 'challenge', model: null, promptHash: null, instruction: 'Validate inputs.' } }).ok, true);
});

/* ------------------------------------------------------------------ signatures */

test('a signed record needs a valid signature and an unsigned one must not carry one', () => {
  const c = signedChange(signer);
  if (c.type !== 'change') throw new Error('unreachable');
  assert.equal(parseRecord({ body: c.body }).ok, false);
  assert.equal(parseRecord({ body: c.body, sig: 'ab' }).ok, false);
  const tampered = { body: { ...c.body, createdAt: '2026-02-02T00:00:00Z' }, sig: c.sig };
  const r = parseRecord(tampered);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.stage, 'signature');
  assert.equal(parseRecord({ body: sampleBuild().body, sig: 'a'.repeat(128) }).ok, false);
});

test('a record signed by somebody other than its named signer is refused', () => {
  const other = generateIdentity();
  const body = changeBody(signer.address);
  assert.equal(parseRecord({ body, sig: other.signBytes(Buffer.from('anything')) }).ok, false);
});

test('shape errors are reported, never thrown', () => {
  for (const v of [null, 5, 'x', [], {}, { body: null }, { body: {} }, { body: { type: 'nope' } }, { body: sampleBuild().body, extra: 1 }]) {
    const r = parseRecord(v);
    assert.equal(r.ok, false);
  }
});

/* ------------------------------------------------------------------ attestations and others */

test('an attestation is checked for its internal consistency', () => {
  const c = signedChange(signer);
  const verifier = generateIdentity();
  const mk = (over: object) => {
    const body = { ...attestationBody(verifier.address, c), ...over };
    return parseRecord({ body, sig: signBody(verifier, body as never).sig });
  };
  assert.equal(mk({}).ok, true);
  assert.equal(mk({ runs: 3 }).ok, false, 'runs differs from the score arrays');
  assert.equal(mk({ ciLowBp: 2000, ciHighBp: 1000 }).ok, false, 'inverted interval');
  assert.equal(mk({ candidate: { runScoresBp: [1, 2, 3, 4, 5], taskMeansBp: { gamma: 1 } } }).ok, false, 'different tasks on the two sides');
  assert.equal(mk({ effectBp: 99999 }).ok, false, 'effect out of range');
  assert.equal(mk({ mode: 'fast' }).ok, false);
  assert.equal(mk({ spotCheck: { tasks: ['alpha'], recordedBp: 5000, liveBp: 4800, ok: true } }).ok, true);
});

test('a recording must be sorted by key, without duplicates, and honest about its slots', () => {
  const entry = (key: string, slot: 'primary' | 'secondary' = 'primary') => ({
    key, slot, response: { text: 't', finish: 'stop' as const, inputTokens: 1, outputTokens: 1 },
  });
  const [a, b] = [hex('1'), hex('2')].sort() as [string, string];
  const base = { type: 'recording', v: 1, build: hex('b'), suite: hex('s'), runs: 5, models: { primary: 'gemini:g', secondary: null } };
  assert.equal(parseRecord({ body: { ...base, entries: [entry(a), entry(b)] } }).ok, true);
  assert.equal(parseRecord({ body: { ...base, entries: [entry(b), entry(a)] } }).ok, false, 'unsorted');
  assert.equal(parseRecord({ body: { ...base, entries: [entry(a), entry(a)] } }).ok, false, 'duplicate');
  assert.equal(parseRecord({ body: { ...base, entries: [entry(a, 'secondary')] } }).ok, false, 'secondary slot but no secondary model');
  assert.equal(parseRecord({ body: { ...base, models: { primary: 'openai:gpt', secondary: null }, entries: [] } }).ok, false, 'unknown provider');
});

test('toRecord throws a readable error for an invalid body', () => {
  assert.throws(() => toRecord({ type: 'receipt', v: 1 }), /invalid receipt/);
});

test('createdAt is accepted with or without milliseconds', () => {
  assert.equal(change({ createdAt: AT }).ok, true);
  assert.equal(change({ createdAt: '2026-01-01T00:00:00.123Z' }).ok, true);
});
