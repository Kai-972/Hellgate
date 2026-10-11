import { createHash } from 'crypto';
import { toCanonicalString } from './json.js';

export function sha256(data: string | Uint8Array): string {
  const hash = createHash('sha256');
  if (typeof data === 'string') {
    hash.update(Buffer.from(data, 'utf8'));
  } else {
    hash.update(data);
  }
  return hash.digest('hex');
}

export function hashCanonical(value: unknown): string {
  const str = toCanonicalString(value);
  return sha256(str);
}
