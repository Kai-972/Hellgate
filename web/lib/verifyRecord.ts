/**
 * Check a Hellgate record in the browser, without trusting the server that sent it.
 *
 * A record is `{ body, sig }`. Its id is the SHA-256 of the body's canonical JSON. Its signature is an ed25519
 * signature over `hellgate/v1/<type>\n` plus that canonical JSON, made by the key named in `body.signer`, which is a
 * Stellar address (so the public key is inside the address). This file re-implements exactly that, from the public
 * rules in PROTOCOL.md, using the browser's own crypto. It shares no code with the engine, so a match is a real
 * second implementation agreeing.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function compareCodePoints(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i)!;
    const y = b.codePointAt(j)!;
    if (x !== y) return x < y ? -1 : 1;
    i += x > 0xffff ? 2 : 1;
    j += y > 0xffff ? 2 : 1;
  }
  return i < a.length ? 1 : j < b.length ? -1 : 0;
}

/** Canonical JSON: keys sorted by code point, no spaces, integers only. */
export function canonical(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error(`${value} is not a safe integer`);
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort(compareCodePoints).map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`).join(',')}}`;
  }
  throw new Error(`cannot encode a ${typeof value}`);
}

function crc16(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** The 32-byte public key inside a Stellar `G…` address (and a check of its checksum). */
export function publicKeyFromAddress(address: string): Uint8Array {
  let bits = 0;
  let acc = 0;
  const bytes: number[] = [];
  for (const ch of address) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error('not a Stellar address');
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bytes.push((acc >>> (bits - 8)) & 0xff);
      bits -= 8;
      acc &= (1 << bits) - 1;
    }
  }
  if (bytes.length !== 35 || bytes[0] !== 6 << 3) throw new Error('not a public Stellar address');
  const payload = Uint8Array.from(bytes.slice(0, 33));
  const check = bytes[33]! | (bytes[34]! << 8);
  if (crc16(payload) !== check) throw new Error('the address checksum is wrong');
  return payload.slice(1);
}

const hex = (bytes: ArrayBuffer | Uint8Array): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (text: string): Uint8Array => Uint8Array.from(text.match(/../g)!.map((h) => parseInt(h, 16)));

export interface Envelope {
  body: { type: string; signer?: string; [key: string]: unknown };
  sig?: string;
}

export interface Checked {
  /** The SHA-256 of the body equals the id it is filed under. */
  idOk: boolean;
  /** The signature is valid for the body, by the key in `signer`. `null` for records that are not signed (builds, recordings). */
  sigOk: boolean | null;
  computedId: string;
  reason: string | null;
}

export async function checkEnvelope(envelope: Envelope, expectedId: string): Promise<Checked> {
  try {
    const text = canonical(envelope.body);
    const computedId = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    const idOk = computedId === expectedId;
    if (envelope.sig === undefined || envelope.body.signer === undefined) return { idOk, sigOk: null, computedId, reason: idOk ? null : 'the content does not hash to its id' };
    const key = await crypto.subtle.importKey('raw', publicKeyFromAddress(envelope.body.signer).slice().buffer, { name: 'Ed25519' }, false, ['verify']);
    const message = new TextEncoder().encode(`hellgate/v1/${envelope.body.type}\n${text}`);
    const sigOk = await crypto.subtle.verify('Ed25519', key, fromHex(envelope.sig).slice().buffer, message);
    return { idOk, sigOk, computedId, reason: idOk && sigOk ? null : !idOk ? 'the content does not hash to its id' : 'the signature does not match the content' };
  } catch (err) {
    return { idOk: false, sigOk: false, computedId: '', reason: err instanceof Error ? err.message : 'could not check' };
  }
}
