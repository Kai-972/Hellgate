/**
 * Canonical JSON: the single way a value becomes bytes before it is hashed or signed.
 *
 * Rules (PROTOCOL §1):
 *   - object keys sorted by Unicode code point, no whitespace
 *   - numbers are safe integers only. A float, NaN, Infinity or -0 throws
 *   - strings use standard JSON escaping
 *   - `undefined`, functions, symbols, bigint, Date, Map and the like throw
 *
 * Scores are therefore kept in basis points, never as fractions.
 * There is exactly one encoder in the codebase. A second one would eventually hash
 * the same record to two different ids.
 */
import { createHash } from 'node:crypto';

import { HellgateError } from './errors.ts';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const MAX_DEPTH = 64;

/** Order two strings by code point. Default `<` orders by UTF-16 unit, which differs for astral characters. */
export function compareCodePoints(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i)!;
    const y = b.codePointAt(j)!;
    if (x !== y) return x < y ? -1 : 1;
    i += x > 0xffff ? 2 : 1;
    j += y > 0xffff ? 2 : 1;
  }
  if (i < a.length) return 1;
  if (j < b.length) return -1;
  return 0;
}

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function encode(value: unknown, path: string, depth: number): string {
  if (depth > MAX_DEPTH) throw new HellgateError('integrity', `canonical: ${path} is nested deeper than ${MAX_DEPTH}`);
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
        throw new HellgateError('integrity', `canonical: ${path} is ${String(value)}. Only safe integers are allowed; store scores in basis points.`);
      }
      return String(value);
    case 'object': {
      if (Array.isArray(value)) {
        const parts: string[] = [];
        for (let i = 0; i < value.length; i++) {
          if (!(i in value)) throw new HellgateError('integrity', `canonical: ${path}[${i}] is a hole`);
          parts.push(encode(value[i], `${path}[${i}]`, depth + 1));
        }
        return `[${parts.join(',')}]`;
      }
      if (!isPlainObject(value)) {
        throw new HellgateError('integrity', `canonical: ${path} is not a plain object`);
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort(compareCodePoints);
      const parts: string[] = [];
      for (const key of keys) {
        parts.push(`${JSON.stringify(key)}:${encode(record[key], `${path}.${key}`, depth + 1)}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      throw new HellgateError('integrity', `canonical: ${path} has unsupported type ${typeof value}`);
  }
}

/** The canonical text of a value. */
export function canonicalJson(value: unknown): string {
  return encode(value, '$', 0);
}

/** The canonical UTF-8 bytes of a value. */
export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(canonicalJson(value), 'utf8');
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** The content id of a record body: sha256 over its canonical bytes, as 64 lowercase hex characters. */
export function idOf(body: unknown): string {
  return sha256Hex(canonicalBytes(body));
}

export const HEX64 = /^[0-9a-f]{64}$/;
export const isHex64 = (s: unknown): s is string => typeof s === 'string' && HEX64.test(s);
