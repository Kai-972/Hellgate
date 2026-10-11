/**
 * Canonical JSON encoding per Hellgate protocol:
 * - UTF-8
 * - Object keys sorted by code point
 * - No whitespace
 * - Integers only (no floats, no NaN)
 * - No undefined
 */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value);
}

function assertValidValue(value: unknown, path: string = 'root'): JSONValue {
  if (value === undefined) {
    throw new Error(`Canonical JSON cannot encode undefined at ${path}`);
  }
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!isInteger(value)) {
      throw new Error(`Canonical JSON only allows integers (bp) at ${path}`);
    }
    if (!Number.isFinite(value)) {
      throw new Error(`Canonical JSON cannot encode NaN/Infinity at ${path}`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => assertValidValue(v, `${path}[${i}]`));
  }
  if (isPlainObject(value)) {
    const result: Record<string, JSONValue> = {};
    const keys = Object.keys(value).sort((a, b) => {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });
    for (const key of keys) {
      result[key] = assertValidValue(value[key], `${path}.${key}`);
    }
    return result;
  }
  throw new Error(`Canonical JSON cannot encode value of type ${typeof value} at ${path}`);
}

export function canonicalize(value: unknown): JSONValue {
  return assertValidValue(value);
}

export function toCanonicalString(value: unknown): string {
  const normalized = canonicalize(value);
  return JSON.stringify(normalized);
}
