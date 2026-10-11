/**
 * Identities and signatures.
 *
 * An identity is an ed25519 keypair whose public name is a Stellar address. The secret
 * is stored as a Stellar `S…` seed, so the same file can sign Stellar transactions.
 *
 * Keys live OUTSIDE the repository, in `$HELLGATE_HOME` or `~/.hellgate`, with mode 0600.
 * A key committed by accident is a key lost.
 *
 * Every signature is domain-separated: the signed bytes start with
 * `hellgate/v1/<record type>\n`, so a signature over one kind of record can never be
 * replayed as a signature over another.
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  type KeyObject,
} from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';

import { canonicalBytes } from '../core/canonical.ts';
import { HellgateError } from '../core/errors.ts';
import { decodeAddress, decodeSecret, encodeAddress, encodeSecret } from './strkey.ts';

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const HEX128 = /^[0-9a-f]{128}$/;

export interface IdentityFile {
  v: 1;
  address: string;
  secret: string;
  label: string;
  createdAt: string;
}

export interface Identity {
  readonly address: string;
  readonly label: string;
  /** Sign raw bytes. Returns 128 lowercase hex characters. */
  signBytes(message: Uint8Array): string;
  /** The 32-byte seed, as a Stellar `S…` secret. Needed to sign Stellar transactions. */
  readonly secret: string;
}

export function homeDir(env: NodeJS.ProcessEnv = process.env): string {
  const custom = env['HELLGATE_HOME'];
  return custom !== undefined && custom.trim() !== '' ? custom : join(homedir(), '.hellgate');
}

export const identityPath = (env: NodeJS.ProcessEnv = process.env): string => join(homeDir(env), 'identity.json');

function privateKeyFromSeed(seed: Uint8Array): KeyObject {
  return createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' });
}

function publicBytesOf(privateKey: KeyObject): Uint8Array {
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' }) as { x: string };
  return Uint8Array.from(Buffer.from(jwk.x, 'base64url'));
}

function publicKeyFromAddress(address: string): KeyObject {
  return createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, decodeAddress(address)]),
    format: 'der',
    type: 'spki',
  });
}

/** Build an identity from a Stellar `S…` secret. Used by tests and by CI, where the secret arrives as an env var. */
export function identityFromSecret(secret: string, label = 'ephemeral'): Identity {
  const seed = decodeSecret(secret);
  const key = privateKeyFromSeed(seed);
  return {
    address: encodeAddress(publicBytesOf(key)),
    label,
    secret,
    signBytes: (message) => edSign(null, message, key).toString('hex'),
  };
}

/** A fresh in-memory identity. Nothing is written to disk. */
export function generateIdentity(label = 'ephemeral'): Identity {
  const { privateKey } = generateKeyPairSync('ed25519');
  const jwk = privateKey.export({ format: 'jwk' }) as { d: string };
  const seed = Uint8Array.from(Buffer.from(jwk.d, 'base64url'));
  return identityFromSecret(encodeSecret(seed), label);
}

/** Create and save a new identity. Never overwrites an existing key. */
export function createIdentityFile(path = identityPath(), label = hostname()): IdentityFile {
  const identity = generateIdentity(label);
  const file: IdentityFile = {
    v: 1,
    address: identity.address,
    secret: identity.secret,
    label,
    createdAt: new Date().toISOString(),
  };
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new HellgateError(
        'usage',
        `an identity already exists at ${path}. Hellgate never overwrites a key. Move that file aside if you really want a new one.`,
      );
    }
    throw err;
  }
  chmodSync(path, 0o600);
  return file;
}

/** Load the saved identity. Refuses a key file that other users can read. */
export function loadIdentity(path = identityPath()): Identity {
  if (!existsSync(path)) {
    throw new HellgateError('environment', `no identity at ${path}. Run \`hellgate id create\` first.`);
  }
  if (process.platform !== 'win32') {
    const mode = statSync(path).mode & 0o777;
    if ((mode & 0o077) !== 0) {
      throw new HellgateError('environment', `${path} has mode 0${mode.toString(8)}, so other users can read your key. Run: chmod 600 ${path}`);
    }
  }
  let file: Partial<IdentityFile>;
  try {
    file = JSON.parse(readFileSync(path, 'utf8')) as Partial<IdentityFile>;
  } catch (err) {
    throw new HellgateError('integrity', `${path} is not valid JSON`, { cause: err });
  }
  if (file.v !== 1 || typeof file.secret !== 'string' || typeof file.address !== 'string') {
    throw new HellgateError('integrity', `${path} is not a Hellgate identity file`);
  }
  const identity = identityFromSecret(file.secret, file.label ?? 'unnamed');
  if (identity.address !== file.address) {
    throw new HellgateError('integrity', `${path}: the address does not match the secret`);
  }
  return identity;
}

/** The identity from `HELLGATE_SECRET` (a Stellar `S…` secret), else the saved file. */
export function resolveIdentity(env: NodeJS.ProcessEnv = process.env): Identity {
  const secret = env['HELLGATE_SECRET'];
  if (secret !== undefined && secret.trim() !== '') return identityFromSecret(secret.trim(), 'env');
  return loadIdentity(identityPath(env));
}

/* ---------------------------------------------------------------- signing */

/** The exact bytes a signature covers: `hellgate/v1/<type>\n` followed by the canonical body. */
export function signingMessage(body: { type: string }): Buffer {
  return Buffer.concat([Buffer.from(`hellgate/v1/${body.type}\n`, 'utf8'), canonicalBytes(body)]);
}

export interface Signed<B extends { type: string; signer: string }> {
  body: B;
  sig: string;
}

/** Sign a record body. The body's `signer` must be this identity's address. */
export function signBody<B extends { type: string; signer: string }>(identity: Identity, body: B): Signed<B> {
  if (body.signer !== identity.address) {
    throw new HellgateError('integrity', `body.signer is ${body.signer} but this identity is ${identity.address}`);
  }
  return { body, sig: identity.signBytes(signingMessage(body)) };
}

export type SignatureCheck = { ok: true } | { ok: false; reason: string };

/** Check a signature against the signer named in the body. Never throws on bad input. */
export function checkSignature(envelope: unknown): SignatureCheck {
  if (envelope === null || typeof envelope !== 'object') return { ok: false, reason: 'not an object' };
  const { body, sig } = envelope as { body?: unknown; sig?: unknown };
  if (body === null || typeof body !== 'object') return { ok: false, reason: 'no body' };
  const { type, signer } = body as { type?: unknown; signer?: unknown };
  if (typeof type !== 'string') return { ok: false, reason: 'body has no type' };
  if (typeof signer !== 'string') return { ok: false, reason: 'body has no signer' };
  if (typeof sig !== 'string' || !HEX128.test(sig)) return { ok: false, reason: 'sig is not 128 hex characters' };
  try {
    const message = signingMessage(body as { type: string });
    const good = edVerify(null, message, publicKeyFromAddress(signer), Buffer.from(sig, 'hex'));
    return good ? { ok: true } : { ok: false, reason: 'signature does not match the body' };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'signature check failed' };
  }
}
