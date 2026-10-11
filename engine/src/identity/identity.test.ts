import assert from 'node:assert/strict';
import { mkdtempSync, statSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { Keypair, StrKey } from '@stellar/stellar-sdk';

import {
  checkSignature,
  createIdentityFile,
  generateIdentity,
  identityFromSecret,
  loadIdentity,
  signBody,
  signingMessage,
} from './keys.ts';
import { decodeAddress, decodeSecret, encodeAddress, encodeSecret, isAddress } from './strkey.ts';

test('StrKey encoding agrees with the official Stellar SDK', () => {
  for (let i = 0; i < 25; i++) {
    const pair = Keypair.random();
    const pub = pair.rawPublicKey();
    const seed = pair.rawSecretKey();
    assert.equal(encodeAddress(pub), pair.publicKey());
    assert.equal(encodeSecret(seed), pair.secret());
    assert.equal(Buffer.from(decodeAddress(pair.publicKey())).toString('hex'), Buffer.from(pub).toString('hex'));
    assert.equal(Buffer.from(decodeSecret(pair.secret())).toString('hex'), Buffer.from(seed).toString('hex'));
    assert.ok(StrKey.isValidEd25519PublicKey(encodeAddress(pub)));
  }
});

test('a Hellgate identity is the Stellar account of the same secret', () => {
  const pair = Keypair.random();
  const id = identityFromSecret(pair.secret());
  assert.equal(id.address, pair.publicKey());
  // The SDK verifies a signature Hellgate made, so the same key signs both worlds.
  const message = Buffer.from('hello');
  assert.ok(pair.verify(message, Buffer.from(id.signBytes(message), 'hex')));
});

test('StrKey refuses a bad checksum, wrong kind, wrong length and stray characters', () => {
  const good = generateIdentity().address;
  const flipped = good.slice(0, 10) + (good[10] === 'A' ? 'B' : 'A') + good.slice(11);
  assert.throws(() => decodeAddress(flipped), /checksum|trailing/);
  assert.throws(() => decodeAddress(good.slice(1)), /56/);
  assert.throws(() => decodeAddress(good.toLowerCase()), /base32/);
  assert.throws(() => decodeSecret(good), /secret/);
  assert.equal(isAddress(good), true);
  assert.equal(isAddress('nope'), false);
});

function sampleBody(signer: string, type = 'change') {
  return { type, signer, n: 1, note: 'x' };
}

test('a signed body verifies, and any change to it breaks the signature', () => {
  const id = generateIdentity();
  const signed = signBody(id, sampleBody(id.address));
  assert.deepEqual(checkSignature(signed), { ok: true });
  assert.equal(checkSignature({ body: { ...signed.body, n: 2 }, sig: signed.sig }).ok, false);
});

test('a signature cannot be replayed under another record type', () => {
  const id = generateIdentity();
  const signed = signBody(id, sampleBody(id.address, 'change'));
  const replay = { body: { ...signed.body, type: 'attestation' }, sig: signed.sig };
  assert.equal(checkSignature(replay).ok, false);
  assert.notDeepEqual(signingMessage(signed.body), signingMessage(replay.body));
});

test('a signature does not verify for a different signer', () => {
  const a = generateIdentity();
  const b = generateIdentity();
  const signed = signBody(a, sampleBody(a.address));
  assert.equal(checkSignature({ body: { ...signed.body, signer: b.address }, sig: signed.sig }).ok, false);
  assert.throws(() => signBody(a, sampleBody(b.address)), /signer/);
});

test('malformed envelopes are reported, never thrown', () => {
  for (const bad of [null, 1, {}, { body: {} }, { body: { type: 't' }, sig: 'ab' }, { body: { type: 't', signer: 'G' }, sig: 'a'.repeat(128) }]) {
    assert.equal(checkSignature(bad).ok, false);
  }
});

test('the key file is private, never overwritten, and checked on load', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hg-id-'));
  const path = join(dir, 'home', 'identity.json');
  const file = createIdentityFile(path, 'tester');
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(loadIdentity(path).address, file.address);
  assert.throws(() => createIdentityFile(path), /never overwrites/);

  chmodSync(path, 0o644);
  assert.throws(() => loadIdentity(path), /other users can read/);
  chmodSync(path, 0o600);

  const other = join(dir, 'tampered.json');
  writeFileSync(other, JSON.stringify({ ...file, address: generateIdentity().address }), { mode: 0o600 });
  assert.throws(() => loadIdentity(other), /does not match/);
});
