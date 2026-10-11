/**
 * Stellar "StrKey" encoding for ed25519 keys, written from the public format:
 *
 *   payload = version byte || 32 key bytes || CRC16-XModem(version || key) little-endian
 *   text    = RFC 4648 base32 (no padding) of the payload, 56 characters
 *
 * Public keys start with `G` (version 6 << 3), secret seeds with `S` (version 18 << 3).
 * A Hellgate identity IS a Stellar account: the same 32 bytes sign records and transactions.
 */
import { HellgateError } from '../core/errors.ts';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const VERSION = { address: 6 << 3, secret: 18 << 3 } as const;
type Kind = keyof typeof VERSION;

function crc16(bytes: Uint8Array): number {
  let crc = 0x0000;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(acc << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string): Uint8Array {
  let bits = 0;
  let acc = 0;
  const out: number[] = [];
  for (const ch of text) {
    const value = ALPHABET.indexOf(ch);
    if (value < 0) throw new HellgateError('integrity', `strkey: "${ch}" is not a base32 character`);
    acc = (acc << 5) | value;
    bits += 5;
    if (bits >= 8) {
      out.push((acc >>> (bits - 8)) & 255);
      bits -= 8;
    }
    acc &= (1 << bits) - 1;
  }
  if (acc !== 0) throw new HellgateError('integrity', 'strkey: trailing bits are not zero');
  return Uint8Array.from(out);
}

function encode(kind: Kind, key: Uint8Array): string {
  if (key.length !== 32) throw new HellgateError('integrity', `strkey: a key is 32 bytes, got ${key.length}`);
  const body = new Uint8Array(33);
  body[0] = VERSION[kind];
  body.set(key, 1);
  const crc = crc16(body);
  const payload = new Uint8Array(35);
  payload.set(body, 0);
  payload[33] = crc & 255;
  payload[34] = crc >>> 8;
  return base32Encode(payload);
}

function decode(kind: Kind, text: string): Uint8Array {
  if (typeof text !== 'string' || text.length !== 56) {
    throw new HellgateError('integrity', 'strkey: expected 56 characters');
  }
  const payload = base32Decode(text);
  if (payload.length !== 35) throw new HellgateError('integrity', 'strkey: wrong payload length');
  if (payload[0] !== VERSION[kind]) {
    throw new HellgateError('integrity', `strkey: expected a ${kind === 'address' ? 'G… address' : 'S… secret'}`);
  }
  const body = payload.subarray(0, 33);
  const crc = crc16(body);
  if (payload[33] !== (crc & 255) || payload[34] !== crc >>> 8) {
    throw new HellgateError('integrity', 'strkey: checksum mismatch');
  }
  return payload.slice(1, 33);
}

export const encodeAddress = (publicKey: Uint8Array): string => encode('address', publicKey);
export const decodeAddress = (address: string): Uint8Array => decode('address', address);
export const encodeSecret = (seed: Uint8Array): string => encode('secret', seed);
export const decodeSecret = (secret: string): Uint8Array => decode('secret', secret);

export function isAddress(text: unknown): text is string {
  if (typeof text !== 'string') return false;
  try {
    decodeAddress(text);
    return true;
  } catch {
    return false;
  }
}
